// Public, browser-safe API: parse + analyze any regex pattern, build the evil
// input. The scanner, prover, and CLI are node-only and not exported here.

export type { Node } from "./ast.js";
export { parsePattern, UnsupportedRegexError } from "./parse.js";
export { CharSet } from "./charset.js";
export { canMatchEmpty, firstSet, firstSetSeq } from "./sets.js";
export { analyze, analyzePattern } from "./analyze.js";
export type { Finding, FindingKind, Severity, AnalysisResult, PatternAnalysis } from "./analyze.js";
export { buildAttack } from "./attack.js";
export type { Attack } from "./attack.js";
