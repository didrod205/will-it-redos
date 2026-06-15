import { describe, it, expect } from "vitest";
import { analyzePattern } from "../src/analyze.js";

// The real-world ReDoS canon. If the detector regresses, these move.
const EVIL: Array<[string, "exponential" | "polynomial"]> = [
  [String.raw`(a+)+$`, "exponential"],
  [String.raw`(a*)*$`, "exponential"],
  [String.raw`(a+)*$`, "exponential"],
  [String.raw`(.*)*$`, "exponential"],
  [String.raw`(\d+)+$`, "exponential"],
  [String.raw`([a-z]+)+$`, "exponential"],
  [String.raw`(a|a)*$`, "exponential"],
  [String.raw`(\w|\d)*$`, "exponential"],
  [String.raw`(.|a)*$`, "exponential"],
  [String.raw`(x+x+)+y`, "exponential"],
  [String.raw`^(\w+\s?)*$`, "exponential"],
  [String.raw`^(([a-z])+.)+[A-Z]([a-z])+$`, "exponential"],
  [String.raw`([^=]+)+=`, "exponential"],
  [String.raw`\s*\s*$`, "polynomial"],
  [String.raw`.*.*=.*`, "polynomial"],
];

// Patterns that must NEVER be flagged — false positives kill trust.
const SAFE = [
  String.raw`abc`,
  String.raw`a+b+c`,
  String.raw`(a|b)*$`,
  String.raw`[a-z]+@[a-z]+\.[a-z]+`,
  String.raw`\d{3}-\d{4}`,
  String.raw`(abc|abd)*`,
  String.raw`^https?://`,
  String.raw`(ab+)+$`,
  String.raw`(a|ab)*$`,
  String.raw`([a-z]+@)+x`,
  String.raw`\w+\s\w+`,
  String.raw`^\d+$`,
  String.raw`foo|bar|baz`,
];

describe("analyzePattern — evil corpus", () => {
  for (const [pattern, severity] of EVIL) {
    it(`flags /${pattern}/ as ${severity}`, () => {
      const r = analyzePattern(pattern);
      expect(r.status).toBe(severity);
      expect(r.findings.length).toBeGreaterThan(0);
    });
  }
});

describe("analyzePattern — safe corpus (no false positives)", () => {
  for (const pattern of SAFE) {
    it(`leaves /${pattern}/ alone`, () => {
      expect(analyzePattern(pattern).status).toBe("safe");
    });
  }
});

describe("the generated attack has the right shape", () => {
  for (const [pattern] of EVIL) {
    it(`/${pattern}/ yields a pump + failing suffix`, () => {
      const attack = analyzePattern(pattern).findings[0]!.attack;
      const built = attack.build(3);
      expect(built).toContain(attack.pumpChar);
      expect(built.endsWith(attack.suffix)).toBe(true);
      expect(attack.pumpChar.length).toBeGreaterThan(0);
      // the loop must be willing to consume the pump (otherwise it isn't the loop char)
      expect(new RegExp(attack.pumpChar).test(attack.pumpChar)).toBe(true);
    });
  }

  it("never throws on exotic syntax — returns 'unparsed'", () => {
    const r = analyzePattern("a++"); // possessive
    expect(r.status).toBe("unparsed");
    expect(r.note).toBeTruthy();
  });
});

describe("a known catastrophic regex actually hangs (proof, generously bounded)", () => {
  it("/(a+)+$/ blows past 250ms within a small pump", () => {
    const attack = analyzePattern(String.raw`(a+)+$`).findings[0]!.attack;
    const re = /(a+)+$/;
    let peak = 0;
    for (let n = 16; n <= 34; n += 4) {
      const start = performance.now();
      re.test(attack.build(n));
      peak = Math.max(peak, performance.now() - start);
      if (peak > 250) break;
    }
    expect(peak).toBeGreaterThan(250);
  });
});
