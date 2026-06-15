import type { RegexReport } from "./shared.js";
import { truncate, attackPreview, summarize } from "./shared.js";

function icon(status: string): string {
  return status === "exponential" ? "🔴" : status === "polynomial" ? "🟡" : "⚪";
}

export function scanToMarkdown(reports: RegexReport[]): string {
  const dangerous = reports.filter((r) => r.analysis.status === "exponential" || r.analysis.status === "polynomial");
  const sum = summarize(reports);
  const L: string[] = [];
  L.push(`# will-it-redos — ${dangerous.length} risky regex${dangerous.length === 1 ? "" : "es"}`);
  L.push("");
  L.push(`Scanned **${sum.total}** regexes: 🔴 ${sum.exponential} exponential · 🟡 ${sum.polynomial} polynomial · ⚪ ${sum.safe} safe · ${sum.unparsed} skipped.`);
  L.push("");
  if (dangerous.length === 0) {
    L.push("No catastrophic-backtracking regexes found. ✅");
    return L.join("\n") + "\n";
  }
  dangerous.sort((a, b) => (a.analysis.status === b.analysis.status ? 0 : a.analysis.status === "exponential" ? -1 : 1));
  for (const r of dangerous) {
    L.push(`### ${icon(r.analysis.status)} \`${truncate(r.source, 80)}\``);
    L.push(`\`${r.file}:${r.line}:${r.column}\` — **${r.analysis.status}**`);
    L.push("");
    L.push(r.analysis.findings[0]!.message);
    const atk = attackPreview(r);
    if (atk) {
      L.push("");
      L.push("```js");
      L.push(`// the input that hangs it:`);
      L.push(atk);
      L.push("```");
    }
    if (r.proof?.blewUp) {
      const w = r.proof.points[r.proof.points.length - 1]!;
      L.push(`> ☠ Proven: **${w.length} chars hung it for ${w.ms.toFixed(0)} ms** (${r.proof.growth}).`);
    }
    L.push("");
  }
  L.push("<sub>generated locally by [will-it-redos](https://github.com/didrod205/will-it-redos)</sub>");
  return L.join("\n") + "\n";
}

export function scanToJSON(reports: RegexReport[]): string {
  const slim = reports.map((r) => ({
    file: r.file,
    line: r.line,
    column: r.column,
    source: r.source,
    pattern: r.pattern,
    flags: r.flags,
    status: r.analysis.status,
    findings: r.analysis.findings.map((f) => ({
      severity: f.severity,
      kind: f.kind,
      message: f.message,
      attack: { prefix: f.attack.prefix, pumpChar: f.attack.pumpChar, suffix: f.attack.suffix, example: f.attack.example },
    })),
    proof: r.proof ? { maxMs: Math.round(r.proof.maxMs), blewUp: r.proof.blewUp, growth: r.proof.growth } : undefined,
  }));
  return JSON.stringify({ summary: summarize(reports), regexes: slim }, null, 2);
}
