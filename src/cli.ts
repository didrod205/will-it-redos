#!/usr/bin/env node
import { cac } from "cac";
import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { analyzePattern, type Severity } from "./analyze.js";
import { scanPaths } from "./scan.js";
import { prove } from "./prove.js";
import type { RegexReport } from "./report/shared.js";
import { scanToMarkdown, scanToJSON } from "./report/markdown.js";

const VERSION = "0.1.0";

function fail(message: string): never {
  process.stderr.write(`\nwill-it-redos: ${message}\n\n`);
  process.exit(2);
}

const SEV_RANK: Record<Severity, number> = { polynomial: 1, exponential: 2 };

function tryRegExp(pattern: string, flags: string): RegExp | null {
  try {
    return new RegExp(pattern, flags.replace(/[gy]/g, ""));
  } catch {
    return null;
  }
}

interface ScanFlags {
  prove?: boolean;
  minSeverity?: string;
  json?: boolean | string;
  md?: boolean | string;
  quiet?: boolean;
  color?: boolean;
  ignore?: string | string[];
}

async function cmdScan(paths: string[], flags: ScanFlags): Promise<void> {
  const root = process.cwd();
  const targets = paths.length > 0 ? paths : ["."];
  for (const p of targets) if (!existsSync(resolve(p))) fail(`Path not found: ${p}`);

  const found = scanPaths(
    targets.map((p) => resolve(p)),
    root,
    { ignore: flags.ignore === undefined ? [] : Array.isArray(flags.ignore) ? flags.ignore : [flags.ignore] },
  );

  const reports: RegexReport[] = found.map((f) => ({ ...f, analysis: analyzePattern(f.pattern, f.flags) }));

  if (flags.prove) {
    for (const r of reports) {
      if (r.analysis.status !== "exponential" && r.analysis.status !== "polynomial") continue;
      const re = tryRegExp(r.pattern, r.flags);
      const atk = r.analysis.findings[0]?.attack;
      if (re && atk) r.proof = prove(re, atk);
    }
  }

  if (flags.color === false) process.env["NO_COLOR"] = "1";

  if (flags.json !== undefined) {
    const out = scanToJSON(reports);
    if (typeof flags.json === "string") writeFileSync(resolve(flags.json), out + "\n", "utf8");
    else process.stdout.write(out + "\n");
  } else if (flags.md !== undefined) {
    const out = scanToMarkdown(reports);
    if (typeof flags.md === "string") writeFileSync(resolve(flags.md), out, "utf8");
    else process.stdout.write(out);
  } else if (!flags.quiet) {
    const { renderScan } = await import("./report/console.js");
    process.stdout.write(renderScan(reports));
  }

  const minSev: Severity = flags.minSeverity === "polynomial" ? "polynomial" : "exponential";
  const hit = reports.some(
    (r) => (r.analysis.status === "exponential" || r.analysis.status === "polynomial") && SEV_RANK[r.analysis.status] >= SEV_RANK[minSev],
  );
  process.exitCode = hit ? 1 : 0;
}

interface CheckFlags {
  prove?: boolean;
  json?: boolean;
  color?: boolean;
}

async function cmdCheck(pattern: string | undefined, flags: CheckFlags): Promise<void> {
  if (!pattern) fail('Give me a pattern: will-it-redos check "(a+)+$"');
  // Accept /pattern/flags or a bare pattern.
  let pat = pattern;
  let flg = "";
  const m = pattern.match(/^\/(.*)\/([a-z]*)$/s);
  if (m) {
    pat = m[1]!;
    flg = m[2]!;
  }
  const analysis = analyzePattern(pat, flg);
  const report: RegexReport = {
    file: "(input)",
    line: 0,
    column: 0,
    pattern: pat,
    flags: flg,
    source: m ? pattern : `/${pat}/${flg}`,
    kind: "literal",
    analysis,
  };

  if ((flags.prove ?? true) && (analysis.status === "exponential" || analysis.status === "polynomial")) {
    const re = tryRegExp(pat, flg);
    const atk = analysis.findings[0]?.attack;
    if (re && atk) report.proof = prove(re, atk);
  }

  if (flags.color === false) process.env["NO_COLOR"] = "1";

  if (flags.json) {
    process.stdout.write(scanToJSON([report]) + "\n");
  } else {
    const { renderCheck } = await import("./report/console.js");
    process.stdout.write(renderCheck(report));
  }
  process.exitCode = analysis.status === "exponential" || analysis.status === "polynomial" ? 1 : 0;
}

const cli = cac("will-it-redos");

function addScanOptions(cmd: ReturnType<typeof cli.command>) {
  return cmd
    .option("--prove", "Confirm each finding by timing it live (bounded, safe)")
    .option("--min-severity <level>", "Fail (exit 1) at this level: exponential (default) | polynomial")
    .option("--ignore <dir>", "Extra directory name to skip (repeatable)")
    .option("--json [file]", "JSON output")
    .option("--md [file]", "Markdown output")
    .option("--quiet", "No output (use the exit code)")
    .option("--no-color", "Disable colors");
}

addScanOptions(cli.command("[...paths]", "Scan files/dirs for ReDoS-prone regexes (default: current dir)")).action(
  (paths: string[], flags: ScanFlags) => cmdScan(paths, flags),
);

addScanOptions(cli.command("scan [...paths]", "Scan files/dirs for ReDoS-prone regexes")).action((paths: string[], flags: ScanFlags) =>
  cmdScan(paths, flags),
);

cli
  .command("check <pattern>", "Analyze one pattern and show the input that hangs it")
  .option("--no-prove", "Skip the live timing proof")
  .option("--json", "JSON output")
  .option("--no-color", "Disable colors")
  .action((pattern: string, flags: CheckFlags) => cmdCheck(pattern, flags));

cli.help();
cli.version(VERSION);

cli.parse(process.argv, { run: false });
void (async () => {
  try {
    await cli.runMatchedCommand();
  } catch (err) {
    fail((err as Error).message);
  }
})();
