import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

export interface FoundRegex {
  file: string;
  line: number;
  column: number;
  pattern: string;
  flags: string;
  /** The literal as written, for display. */
  source: string;
  kind: "literal" | "constructor";
}

const CODE_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".next", "out", "vendor", ".cache", ".turbo"]);
const MAX_FILE = 4 * 1024 * 1024;

// Keywords after which a `/` begins a regex even though the token ends in a letter.
const REGEX_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "do",
  "else", "yield", "await", "case", "throw",
]);

function lineColAt(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: index - last };
}

/** True if a `/` at this point starts a regex (vs. division), from the prior token. */
function regexAllowed(prevWord: string, prevChar: string): boolean {
  if (prevChar === "") return true;
  if (REGEX_KEYWORDS.has(prevWord)) return true;
  // After these, a value (and thus a regex) is expected.
  return "(,=:[!&|?{};+-*%^~<>".includes(prevChar);
}

/** Extract regex literals from one file's text via a small JS tokenizer. */
export function scanText(text: string, file: string): FoundRegex[] {
  const out: FoundRegex[] = [];
  let i = 0;
  const n = text.length;
  let prevWord = "";
  let prevSignificant = "";

  const skipString = (quote: string) => {
    i++;
    while (i < n) {
      const c = text[i++];
      if (c === "\\") i++;
      else if (c === quote) break;
    }
  };

  while (i < n) {
    const c = text[i]!;

    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      skipString(c);
      prevSignificant = c;
      prevWord = "";
      continue;
    }
    if (c === "/" && regexAllowed(prevWord, prevSignificant)) {
      const start = i;
      i++;
      let inClass = false;
      let ok = false;
      let body = "";
      while (i < n) {
        const ch = text[i]!;
        if (ch === "\\") {
          body += ch + (text[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (ch === "\n") break; // unterminated → not a regex
        if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) {
          ok = true;
          break;
        }
        body += ch;
        i++;
      }
      if (ok) {
        i++; // consume closing /
        let flags = "";
        while (i < n && /[a-z]/i.test(text[i]!)) flags += text[i++]!;
        if (body.length > 0) {
          const { line, column } = lineColAt(text, start);
          out.push({ file, line, column, pattern: body, flags, source: `/${body}/${flags}`, kind: "literal" });
        }
        prevSignificant = "/";
        prevWord = "";
        continue;
      }
      // not a regex after all — fall through as division
      i = start + 1;
      prevSignificant = "/";
      prevWord = "";
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      let w = "";
      while (i < n && /[A-Za-z0-9_$]/.test(text[i]!)) w += text[i++]!;
      prevWord = w;
      prevSignificant = w[w.length - 1]!;
      continue;
    }
    if (!/\s/.test(c)) {
      prevSignificant = c;
      prevWord = "";
    }
    i++;
  }

  out.push(...scanConstructors(text, file));
  return out;
}

const CTOR_RE = /(?<![.\w])(?:new\s+)?RegExp\s*\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*(?:,\s*(["'])([a-z]*)\3)?/g;

function scanConstructors(text: string, file: string): FoundRegex[] {
  const out: FoundRegex[] = [];
  for (const m of text.matchAll(CTOR_RE)) {
    // The string-literal body uses JS escaping; unescape one level so "\\d" → "\d".
    let pattern: string;
    try {
      pattern = JSON.parse('"' + m[2]!.replace(/\\(['"])/g, "$1").replace(/"/g, '\\"') + '"');
    } catch {
      pattern = m[2]!;
    }
    const flags = m[4] ?? "";
    const { line, column } = lineColAt(text, m.index);
    out.push({ file, line, column, pattern, flags, source: m[0], kind: "constructor" });
  }
  return out;
}

export interface ScanOptions {
  /** Extra dir names to ignore. */
  ignore?: string[];
}

function walk(path: string, root: string, opts: ScanOptions, acc: FoundRegex[]): void {
  let st;
  try {
    st = statSync(path);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    const base = path.split(/[\\/]/).pop() ?? "";
    if (IGNORE_DIRS.has(base) || opts.ignore?.includes(base)) return;
    let entries: string[];
    try {
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const e of entries) walk(join(path, e), root, opts, acc);
    return;
  }
  if (!st.isFile() || st.size > MAX_FILE) return;
  if (!CODE_EXT.has(extname(path))) return;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  const rel = relative(root, path) || path;
  acc.push(...scanText(text, rel));
}

/** Walk paths and return every regex literal/constructor found. */
export function scanPaths(paths: string[], root: string, opts: ScanOptions = {}): FoundRegex[] {
  const acc: FoundRegex[] = [];
  for (const p of paths) walk(p, root, opts, acc);
  return acc;
}
