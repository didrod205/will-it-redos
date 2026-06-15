import pc from "picocolors";
import type { RegexReport } from "./shared.js";
import { truncate, attackPreview, summarize } from "./shared.js";

function badge(status: string): string {
  if (status === "exponential") return pc.bgRed(pc.white(" EXPONENTIAL "));
  if (status === "polynomial") return pc.bgYellow(pc.black(" POLYNOMIAL "));
  return pc.dim(status);
}

function proofLine(report: RegexReport): string | null {
  const p = report.proof;
  if (!p || p.points.length === 0) return null;
  const worst = p.points[p.points.length - 1]!;
  if (p.blewUp) {
    return pc.red(`proven: ${worst.length} chars hung this regex for ${worst.ms.toFixed(0)} ms (${p.growth})`);
  }
  return pc.dim(`measured up to ${worst.length} chars: ${worst.ms.toFixed(1)} ms (${p.growth})`);
}

/** Render the result of a directory scan. */
export function renderScan(reports: RegexReport[]): string {
  const L: string[] = [];
  const dangerous = reports.filter((r) => r.analysis.status === "exponential" || r.analysis.status === "polynomial");
  const sum = summarize(reports);

  L.push("");
  if (dangerous.length === 0) {
    L.push(`  ${pc.green("✓ No ReDoS-prone regexes found.")} ${pc.dim(`(${sum.safe} safe, ${sum.unparsed} not analyzable, of ${sum.total} regexes)`)}`);
    L.push("");
    return L.join("\n");
  }

  // worst first
  dangerous.sort((a, b) => (a.analysis.status === b.analysis.status ? 0 : a.analysis.status === "exponential" ? -1 : 1));
  for (const r of dangerous) {
    L.push(`  ${badge(r.analysis.status)}  ${pc.cyan(`${r.file}:${r.line}:${r.column}`)}`);
    L.push(`    ${pc.bold(truncate(r.source, 70))}`);
    const f = r.analysis.findings[0]!;
    L.push(`    ${pc.dim(f.message)}`);
    const atk = attackPreview(r);
    if (atk) L.push(`    ${pc.dim("evil input:")} ${pc.yellow(atk)}`);
    const pl = proofLine(r);
    if (pl) L.push(`    ${pl}`);
    L.push("");
  }

  L.push(
    `  ${pc.bold(`${dangerous.length} risky regex${dangerous.length === 1 ? "" : "es"}`)} ` +
      `${pc.dim("·")} ${pc.red(`${sum.exponential} exponential`)} ${pc.dim("·")} ${pc.yellow(`${sum.polynomial} polynomial`)} ` +
      `${pc.dim(`· ${sum.safe} safe · ${sum.unparsed} skipped · ${sum.total} total`)}`,
  );
  L.push("");
  return L.join("\n");
}

/** Render a single `check <pattern>` result. */
export function renderCheck(report: RegexReport): string {
  const L: string[] = [];
  const a = report.analysis;
  L.push("");
  L.push(`  ${pc.bold(truncate(report.source, 70))}`);
  L.push("");
  if (a.status === "safe") {
    L.push(`  ${pc.green("✓ Looks safe.")} ${pc.dim("No catastrophic backtracking structure found.")}`);
    L.push("");
    return L.join("\n");
  }
  if (a.status === "unparsed") {
    L.push(`  ${pc.dim(`Couldn't analyze this pattern (${a.note}).`)}`);
    L.push("");
    return L.join("\n");
  }
  L.push(`  ${a.status === "exponential" ? pc.bgRed(pc.white(" WILL ReDoS ")) : pc.bgYellow(pc.black(" SLOW "))}  ${pc.bold(a.status + " backtracking")}`);
  L.push("");
  const f = a.findings[0]!;
  L.push(`  ${f.message}`);
  L.push("");
  const atk = attackPreview(report);
  if (atk) {
    L.push(`  ${pc.bold("The input that hangs it:")}`);
    L.push(`    ${pc.yellow(atk)}`);
    L.push("");
  }
  if (report.proof && report.proof.points.length > 0) {
    L.push(`  ${pc.bold("Proof (live, on this machine):")}`);
    for (const p of report.proof.points) {
      const bar = p.ms > 250 ? pc.red("█".repeat(Math.min(30, Math.ceil(p.ms / 100)))) : pc.cyan("▪");
      L.push(`    ${String(p.length).padStart(4)} chars  ${p.ms.toFixed(1).padStart(9)} ms  ${bar}`);
    }
    if (report.proof.blewUp) {
      const w = report.proof.points[report.proof.points.length - 1]!;
      L.push("");
      L.push(`  ${pc.red(`☠  ${w.length} characters froze this regex for ${w.ms.toFixed(0)} ms.`)} ${pc.dim("Imagine that as a request parameter.")}`);
    }
    L.push("");
  }
  return L.join("\n");
}
