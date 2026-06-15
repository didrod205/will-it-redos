// A character-set abstraction whose only job is answering one question well:
// "can these two atoms match the same character?" — the heart of ReDoS overlap
// detection. We answer it by sampling a fixed probe alphabet plus each set's own
// representative chars: deterministic, and correct for the patterns that matter.

import type { ClassNode, ClassItem } from "./ast.js";

// A fixed probe alphabet covering the equivalence classes regex authors use.
const PROBE = [
  "a", "b", "z", "A", "Z", "0", "5", "9", "_", "-", ".", " ", "\t", "\n", "!", "@", "/", "\\", "#", "+", "é",
];

const isDigit = (cp: number) => cp >= 48 && cp <= 57;
const isWord = (cp: number) => isDigit(cp) || (cp >= 65 && cp <= 90) || (cp >= 97 && cp <= 122) || cp === 95;
const isSpace = (cp: number) => cp === 32 || cp === 9 || cp === 10 || cp === 13 || cp === 11 || cp === 12;

function shorthandTest(short: string, cp: number): boolean {
  switch (short) {
    case "d": return isDigit(cp);
    case "D": return !isDigit(cp);
    case "w": return isWord(cp);
    case "W": return !isWord(cp);
    case "s": return isSpace(cp);
    case "S": return !isSpace(cp);
    default: return false;
  }
}

export class CharSet {
  constructor(
    private readonly testFn: (cp: number) => boolean,
    private readonly sampleChars: string[],
  ) {}

  test(ch: string): boolean {
    const cp = ch.codePointAt(0);
    return cp === undefined ? false : this.testFn(cp);
  }

  /** Representative chars this set definitely contains (for overlap probing). */
  samples(): string[] {
    const out: string[] = [];
    for (const c of [...this.sampleChars, ...PROBE]) {
      if (this.test(c)) out.push(c);
    }
    return out.length > 0 ? out : this.sampleChars;
  }

  /** Do A and B share at least one character? */
  overlaps(other: CharSet): boolean {
    for (const c of this.samples()) if (other.test(c)) return true;
    for (const c of other.samples()) if (this.test(c)) return true;
    return false;
  }

  static any(): CharSet {
    // `.` matches anything except a line terminator (no `s` flag) — modelling that
    // lets us pick a newline as the failing suffix for `.`-based loops.
    return new CharSet((cp) => cp !== 10 && cp !== 13 && cp !== 0x2028 && cp !== 0x2029, ["a"]);
  }

  static literal(ch: string): CharSet {
    const cp = ch.codePointAt(0);
    return new CharSet((c) => c === cp, [ch]);
  }

  static shorthand(short: string): CharSet {
    const sample = short === "d" ? ["0"] : short === "w" ? ["a"] : short === "s" ? [" "] : short === "D" ? ["a"] : short === "W" ? [" "] : ["a"];
    return new CharSet((cp) => shorthandTest(short, cp), sample);
  }

  static fromClass(node: ClassNode): CharSet {
    const items = node.items;
    const samples: string[] = [];
    const positive = (cp: number): boolean => {
      for (const it of items) {
        if (matchItem(it, cp)) return true;
      }
      return false;
    };
    for (const it of items) {
      if (it.kind === "char" && it.value) samples.push(it.value);
      else if (it.kind === "range" && it.from !== undefined) samples.push(String.fromCodePoint(it.from));
      else if (it.kind === "shorthand" && it.short) samples.push(it.short === "d" ? "0" : it.short === "s" ? " " : "a");
    }
    if (node.negated) {
      return new CharSet((cp) => !positive(cp), samples.length ? [] : ["a"]); // samples computed via probe in samples()
    }
    return new CharSet(positive, samples);
  }
}

function matchItem(it: ClassItem, cp: number): boolean {
  if (it.kind === "char" && it.value) return it.value.codePointAt(0) === cp;
  if (it.kind === "range" && it.from !== undefined && it.to !== undefined) return cp >= it.from && cp <= it.to;
  if (it.kind === "shorthand" && it.short) return shorthandTest(it.short, cp);
  return false;
}
