import type { FoundRegex } from "../scan.js";
import type { PatternAnalysis, Severity } from "../analyze.js";
import type { Proof } from "../prove.js";

export interface RegexReport extends FoundRegex {
  analysis: PatternAnalysis;
  proof?: Proof;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  exponential: "EXPONENTIAL",
  polynomial: "POLYNOMIAL",
};

/** Truncate without escaping — for showing source code (regex literals) verbatim. */
export function truncate(s: string, max = 70): string {
  const oneLine = s.replace(/\s*\n\s*/g, " ");
  return oneLine.length <= max ? oneLine : oneLine.slice(0, max - 1) + "…";
}

/** Make control chars visible and bound the length for display. */
export function showString(s: string, max = 48): string {
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r")
    .replace(/[\x00-\x1f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  if (escaped.length <= max) return escaped;
  return escaped.slice(0, max) + "…";
}

/** A compact, copy-pasteable evil-input description. */
export function attackPreview(report: RegexReport): string | null {
  const f = report.analysis.findings[0];
  if (!f) return null;
  const a = f.attack;
  const unit = a.pumpChar.length === 1 ? `"${showString(a.pumpChar)}"` : `"${showString(a.pumpChar)}"`;
  const pre = a.prefix ? `"${showString(a.prefix)}" + ` : "";
  return `${pre}${unit}.repeat(50000) + "${showString(a.suffix)}"`;
}

export function summarize(reports: RegexReport[]): { exponential: number; polynomial: number; safe: number; unparsed: number; total: number } {
  let exponential = 0, polynomial = 0, safe = 0, unparsed = 0;
  for (const r of reports) {
    if (r.analysis.status === "exponential") exponential++;
    else if (r.analysis.status === "polynomial") polynomial++;
    else if (r.analysis.status === "unparsed") unparsed++;
    else safe++;
  }
  return { exponential, polynomial, safe, unparsed, total: reports.length };
}
