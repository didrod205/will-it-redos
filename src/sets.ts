import type { Node } from "./ast.js";
import { CharSet } from "./charset.js";

/** Can this node match the empty string? */
export function canMatchEmpty(node: Node): boolean {
  switch (node.type) {
    case "char":
    case "any":
    case "class":
    case "backref":
      return false;
    case "anchor":
    case "look":
      return true;
    case "quant":
      return node.min === 0 || canMatchEmpty(node.child);
    case "group":
      return canMatchEmptySeq(node.body);
    case "alt":
      return node.options.some(canMatchEmptySeq);
  }
}

export function canMatchEmptySeq(seq: Node[]): boolean {
  return seq.every(canMatchEmpty);
}

/** The set of characters that can begin a match of this node. */
export function firstSet(node: Node): CharSet[] {
  switch (node.type) {
    case "char":
      return [CharSet.literal(node.value)];
    case "any":
      return [CharSet.any()];
    case "class":
      return [CharSet.fromClass(node)];
    case "anchor":
    case "look":
    case "backref":
      return [];
    case "quant":
      return firstSet(node.child);
    case "group":
      return firstSetSeq(node.body);
    case "alt":
      return node.options.flatMap(firstSetSeq);
  }
}

export function firstSetSeq(seq: Node[]): CharSet[] {
  const out: CharSet[] = [];
  for (const node of seq) {
    out.push(...firstSet(node));
    if (!canMatchEmpty(node)) break;
  }
  return out;
}

export function anyOverlap(a: CharSet[], b: CharSet[]): boolean {
  for (const x of a) for (const y of b) if (x.overlaps(y)) return true;
  return false;
}

/** A single character accepted by some set in BOTH groups — the ambiguity char. */
export function sharedChar(a: CharSet[], b: CharSet[]): string | null {
  for (const x of a) {
    for (const c of x.samples()) {
      if (b.some((y) => y.test(c))) return c;
    }
  }
  for (const y of b) {
    for (const c of y.samples()) {
      if (a.some((x) => x.test(c))) return c;
    }
  }
  return null;
}

/** Unwrap a quantifier's child into the sequence it loops over. */
export function toSeq(node: Node): Node[] {
  if (node.type === "group") return node.body;
  return [node];
}
