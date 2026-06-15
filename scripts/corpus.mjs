import { analyzePattern } from "../dist/index.js";

// Known-catastrophic patterns (the real-world ReDoS canon). Single backslashes,
// no shell escaping — this file is the source of truth.
const EVIL = [
  String.raw`(a+)+$`,
  String.raw`(a*)*$`,
  String.raw`(a+)*$`,
  String.raw`(.*)*$`,
  String.raw`(\d+)+$`,
  String.raw`(a|a)*$`,
  String.raw`(\w|\d)*$`,
  String.raw`(.|a)*$`,
  String.raw`(foo|foo)*$`,
  String.raw`([a-z]+)+$`,
  String.raw`(x+x+)+y`,
  String.raw`\s*\s*$`,
  String.raw`.*.*=.*`,
  String.raw`^(\w+\s?)*$`,
  String.raw`^(([a-z])+.)+[A-Z]([a-z])+$`,
  String.raw`^(a+)+b$`,
  String.raw`([^=]+)+=`,
];

const SAFE = [
  String.raw`abc`,
  String.raw`a+b+c`,
  String.raw`(a|b)*$`,
  String.raw`[a-z]+@[a-z]+\.[a-z]+`,
  String.raw`\d{3}-\d{4}`,
  String.raw`(abc|abd)*`,
  String.raw`^https?://`,
  String.raw`(ab+)+$`,
  String.raw`foo|bar|baz`,
  String.raw`a{2,5}`,
  String.raw`([a-z]+@)+x`,
  String.raw`(a|ab)*$`,
  String.raw`\w+\s\w+`,
  String.raw`^\d+$`,
  String.raw`(?:\d{4})-(?:\d{2})`,
];

let ok = 0, bad = 0;
console.log("=== EVIL (expect a finding) ===");
for (const p of EVIL) {
  const r = analyzePattern(p);
  const flag = r.status === "exponential" || r.status === "polynomial";
  console.log(`${flag ? "✓" : "✗ MISS"} [${r.status}] /${p}/`);
  flag ? ok++ : bad++;
}
console.log("=== SAFE (expect safe/unparsed) ===");
for (const p of SAFE) {
  const r = analyzePattern(p);
  const flag = r.status === "safe" || r.status === "unparsed";
  console.log(`${flag ? "✓" : "✗ FALSE-POSITIVE"} [${r.status}] /${p}/`);
  flag ? ok++ : bad++;
}
console.log(`\nscore: ${ok} ok, ${bad} wrong`);
