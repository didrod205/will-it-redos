import type { Node, Quantifier, Alternation } from "./ast.js";
import { isUnbounded } from "./ast.js";
import { canMatchEmpty, canMatchEmptySeq, firstSet, firstSetSeq, anyOverlap, sharedChar, toSeq } from "./sets.js";
import { CharSet } from "./charset.js";
import { buildAttack, type Attack } from "./attack.js";
import { parsePattern, UnsupportedRegexError } from "./parse.js";

export type Severity = "exponential" | "polynomial";
export type FindingKind = "nested-quantifier" | "overlapping-alternation" | "adjacent-quantifier";

export interface Finding {
  severity: Severity;
  kind: FindingKind;
  message: string;
  attack: Attack;
}

export interface AnalysisResult {
  worst: Severity | "safe";
  findings: Finding[];
}

const MESSAGES: Record<FindingKind, string> = {
  "nested-quantifier":
    "Nested quantifier (a `(x+)+` shape). On a long run of the inner character followed by a non-match, the engine tries exponentially many ways to split it.",
  "overlapping-alternation":
    "A quantified group whose alternatives overlap (a `(a|a)*` / `(a|ab)*` shape) — the same text matches via multiple branches, exploding combinatorially.",
  "adjacent-quantifier":
    "Two adjacent unbounded quantifiers over overlapping characters (a `.*.*` shape) — quadratic time on a long non-matching input.",
};

/** A single representative char for an atom, used to build the reach-the-loop prefix. */
function sampleChar(node: Node): string {
  const fs = firstSet(node);
  for (const s of fs) {
    const samples = s.samples();
    if (samples[0]) return samples[0];
  }
  return "";
}

/** Peel a node down to an unbounded quantifier if that's effectively what it is. */
function asUnboundedQuant(node: Node): Quantifier | null {
  if (node.type === "quant" && isUnbounded(node)) return node;
  return null;
}

/** Find an inner unbounded quantifier reachable at loop-start with an empty path before/after. */
function findNestedExp(childSeq: Node[], outerLoop: CharSet[]): Quantifier | null {
  const search = (seq: Node[]): Quantifier | null => {
    for (let i = 0; i < seq.length; i++) {
      const before = seq.slice(0, i);
      if (!canMatchEmptySeq(before)) break; // a mandatory atom separates iterations
      const node = seq[i]!;
      const after = seq.slice(i + 1);
      const afterFirst = firstSetSeq(after);
      // The remainder "anchors" iterations only if it MUST consume a char the inner
      // loop can't — i.e. it's non-empty AND disjoint from the inner set. An empty
      // or overlapping remainder still lets the outer loop re-enter ambiguously.
      const afterTransparent = (innerSet: CharSet[]) => canMatchEmptySeq(after) || anyOverlap(afterFirst, innerSet);

      const q = asUnboundedQuant(node);
      if (q) {
        const innerSet = firstSet(q.child);
        if (afterTransparent(innerSet) && anyOverlap(innerSet, outerLoop)) return q;
      }
      if (node.type === "group") {
        if (afterTransparent(firstSetSeq(node.body))) {
          const r = search(node.body);
          if (r) return r;
        }
      } else if (node.type === "alt") {
        if (afterTransparent(firstSet(node))) {
          for (const opt of node.options) {
            const r = search(opt);
            if (r) return r;
          }
        }
      }
    }
    return null;
  };
  return search(childSeq);
}

function unwrapAlt(node: Node): Alternation | null {
  if (node.type === "alt") return node;
  if (node.type === "group" && node.body.length === 1 && node.body[0]!.type === "alt") {
    return node.body[0] as Alternation;
  }
  return null;
}

function isLiteralCharSeq(seq: Node[]): string | null {
  let out = "";
  for (const n of seq) {
    if (n.type === "char") out += n.value;
    else return null;
  }
  return out;
}

/**
 * If two alternation options can match the SAME text — the only thing a `*`/`+`
 * can exploit — return the ambiguity char. We fire when both branches are a
 * single overlapping atom (`(a|a)`, `(\w|\d)`, `(.|a)`) or are identical literals
 * (`(foo|foo)`). We deliberately do NOT fire on `(a|ab)`: those match different
 * strings, so they don't blow up — false positives are worse than a rare miss.
 */
function dangerousAlt(alt: Alternation): string | null {
  const opts = alt.options;
  const single = (o: Node[]) => o.length === 1 && (o[0]!.type === "char" || o[0]!.type === "any" || o[0]!.type === "class");
  for (let i = 0; i < opts.length; i++) {
    for (let j = i + 1; j < opts.length; j++) {
      const a = opts[i]!;
      const b = opts[j]!;
      if (single(a) && single(b)) {
        const shared = sharedChar(firstSet(a[0]!), firstSet(b[0]!));
        if (shared) return shared;
      }
      const la = isLiteralCharSeq(a);
      const lb = isLiteralCharSeq(b);
      // identical literal branches → pump the whole unit ("foo"), which build() repeats
      if (la !== null && la.length > 0 && la === lb) return la;
    }
  }
  return null;
}

function nextConsuming(seq: Node[], from: number): Node | null {
  for (let k = from; k < seq.length; k++) {
    const n = seq[k]!;
    if (n.type === "anchor" || n.type === "look") continue;
    return n;
  }
  return null;
}

/** Analyze a parsed pattern for catastrophic backtracking. */
export function analyze(ast: Node[]): AnalysisResult {
  const findings: Finding[] = [];

  const add = (severity: Severity, kind: FindingKind, prefix: string, pumpChar: string, rejectSets: CharSet[]) => {
    findings.push({ severity, kind, message: MESSAGES[kind], attack: buildAttack(prefix, pumpChar, rejectSets) });
  };

  const detectQuant = (q: Quantifier, prefix: string) => {
    if (!isUnbounded(q)) return;
    const outerLoop = firstSetSeq(toSeq(q.child));
    if (outerLoop.length === 0) return;
    const inner = findNestedExp(toSeq(q.child), outerLoop);
    if (inner) {
      const pump = sharedChar(firstSet(inner.child), outerLoop) ?? outerLoop[0]!.samples()[0] ?? "a";
      add("exponential", "nested-quantifier", prefix, pump, outerLoop);
      return;
    }
    const alt = unwrapAlt(q.child);
    if (alt) {
      const pump = dangerousAlt(alt);
      if (pump) add("exponential", "overlapping-alternation", prefix, pump, outerLoop);
    }
  };

  const visit = (node: Node, prefix: string): void => {
    switch (node.type) {
      case "quant":
        detectQuant(node, prefix);
        visit(node.child, prefix);
        break;
      case "group":
        visitSeq(node.body, prefix);
        break;
      case "alt":
        for (const o of node.options) visitSeq(o, prefix);
        break;
      case "look":
        visitSeq(node.body, prefix);
        break;
      default:
        break;
    }
  };

  const visitSeq = (seq: Node[], prefix: string): void => {
    let local = prefix;
    for (let i = 0; i < seq.length; i++) {
      const node = seq[i]!;
      if (node.type === "quant" && isUnbounded(node)) {
        const nxt = nextConsuming(seq, i + 1);
        if (nxt && nxt.type === "quant" && isUnbounded(nxt)) {
          const pump = sharedChar(firstSet(node.child), firstSet(nxt.child));
          if (pump) add("polynomial", "adjacent-quantifier", local, pump, firstSet(node.child));
        }
      }
      visit(node, local);
      if (!canMatchEmpty(node)) local += sampleChar(node);
    }
  };

  visitSeq(ast, "");

  // Strongest first; one finding per (kind,severity) is plenty of signal.
  const seen = new Set<string>();
  const unique = findings.filter((f) => {
    const key = `${f.severity}:${f.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "exponential" ? -1 : 1));

  return {
    worst: unique.length === 0 ? "safe" : unique[0]!.severity,
    findings: unique,
  };
}

export interface PatternAnalysis {
  pattern: string;
  flags?: string;
  /** "safe" | "exponential" | "polynomial" | "unparsed" */
  status: "safe" | "exponential" | "polynomial" | "unparsed";
  findings: Finding[];
  /** Reason, when status is "unparsed". */
  note?: string;
}

/** Parse + analyze a raw pattern string. Never throws — exotic syntax → "unparsed". */
export function analyzePattern(pattern: string, flags?: string): PatternAnalysis {
  let ast: Node[];
  try {
    ast = parsePattern(pattern);
  } catch (err) {
    return {
      pattern,
      flags,
      status: "unparsed",
      findings: [],
      note: err instanceof UnsupportedRegexError ? err.message : "parse error",
    };
  }
  const result = analyze(ast);
  return {
    pattern,
    flags,
    status: result.worst === "safe" ? "safe" : result.worst,
    findings: result.findings,
  };
}
