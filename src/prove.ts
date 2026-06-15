import type { Attack } from "./attack.js";

export interface ProofPoint {
  n: number;
  length: number;
  ms: number;
}

export interface Proof {
  points: ProofPoint[];
  maxMs: number;
  /** Did a single match exceed the soft cap? */
  blewUp: boolean;
  growth: "exponential" | "polynomial" | "linear";
}

export interface ProveOptions {
  softCapMs?: number;
  budgetMs?: number;
  maxN?: number;
  startN?: number;
  step?: number;
}

/**
 * Empirically confirm a finding by timing the regex against a growing pump.
 * Self-protecting: small steps keep the overshoot bounded, and we stop the
 * moment one run exceeds the soft cap or the total budget is spent — so the
 * prover itself can't hang.
 */
export function prove(re: RegExp, attack: Attack, opts: ProveOptions = {}): Proof {
  const softCap = opts.softCapMs ?? 250;
  const budget = opts.budgetMs ?? 2500;
  const maxN = opts.maxN ?? 46;
  const step = opts.step ?? 2;
  const points: ProofPoint[] = [];
  let total = 0;

  for (let nn = opts.startN ?? 8; nn <= maxN; nn += step) {
    const input = attack.build(nn);
    // fresh regex each time: a global/sticky regex keeps lastIndex state
    const r = new RegExp(re.source, re.flags.replace(/[gy]/g, ""));
    const t = performance.now();
    r.test(input);
    const ms = performance.now() - t;
    points.push({ n: nn, length: input.length, ms });
    total += ms;
    if (ms > softCap || total > budget) break;
  }

  const maxMs = points.reduce((m, p) => Math.max(m, p.ms), 0);
  const blewUp = maxMs > softCap;
  return { points, maxMs, blewUp, growth: classify(points) };
}

function classify(points: ProofPoint[]): Proof["growth"] {
  const meaningful = points.filter((p) => p.ms > 0.3);
  if (meaningful.length < 2) return "linear";
  const a = meaningful[meaningful.length - 2]!;
  const b = meaningful[meaningful.length - 1]!;
  const ratio = b.ms / Math.max(a.ms, 0.05);
  const dn = Math.max(1, b.n - a.n);
  const perStep = Math.pow(ratio, 2 / dn); // normalize to a +2 step
  if (perStep >= 3) return "exponential";
  if (perStep >= 1.4) return "polynomial";
  return "linear";
}
