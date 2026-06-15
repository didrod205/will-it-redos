import { CharSet } from "./charset.js";

export interface Attack {
  /** Chars needed to reach the vulnerable loop (best-effort). */
  prefix: string;
  /** The ambiguity character pumped to blow up the backtracking. */
  pumpChar: string;
  /** A trailing char the loop rejects — forces the engine to backtrack fully. */
  suffix: string;
  /** Build an evil input that repeats the pump `n` times. */
  build(n: number): string;
  /** A ready-to-show example at a modest size. */
  example: string;
}

// Tried in order as the failing suffix; the first one ALL reject sets refuse wins.
const SUFFIX_CANDIDATES = ["!", "@", "#", "~", "<", " ", ".", "\n"];

function failingChar(rejectSets: CharSet[], pumpChar: string): string {
  for (const c of SUFFIX_CANDIDATES) {
    if (c === pumpChar) continue;
    if (rejectSets.every((s) => !s.test(c))) return c;
  }
  return " ";
}

/**
 * Construct the evil input. `pumpChar` is the ambiguity character (accepted by
 * the overlapping parts); `rejectSets` are the loop's sets, used to pick a
 * suffix the loop can't eat — which forces the engine to backtrack fully.
 */
export function buildAttack(prefix: string, pumpChar: string, rejectSets: CharSet[], exampleN = 25): Attack {
  const suffix = failingChar(rejectSets, pumpChar);
  const build = (n: number) => prefix + pumpChar.repeat(Math.max(1, n)) + suffix;
  return { prefix, pumpChar, suffix, build, example: build(exampleN) };
}
