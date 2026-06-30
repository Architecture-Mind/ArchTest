import { resolve } from "path"
import { writeFileSync } from "fs"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { runLint } from "../../linter/runner"
import { loadConfig } from "../../config/index"
import { loadSnapshot, snapshotPath } from "../../snapshot/store"
import { diffSnapshots } from "../../snapshot/diff"
import { captureSnapshot } from "../../snapshot/capture"
import { buildHtmlReport, buildMarkdownReport } from "../../report/index"
import type { ReportData } from "../../report/index"

const RESET = "\x1b[0m"
const GREEN = "\x1b[32m"
const DIM   = "\x1b[90m"

type ReportFormat = "html" | "md" | "markdown"

export async function runReportCmd(flags: Record<string, string>): Promise<void> {
  const projectRoot       = requireProject(flags)
  const bin               = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const frameworkOverride = flags["framework"]
  const format            = (flags["format"] ?? "html") as ReportFormat
  const outFile           = flags["out"] ?? flags["output"] ?? defaultOutputFile(format)
  const includeFuzz       = "no-fuzz" in flags ? false : false  // fuzz requires a live server; skip by default
  const skipSnapshot      = "no-snapshot" in flags

  const config = loadConfig(projectRoot)

  console.log(`Scanning: ${resolve(projectRoot)}\n`)

  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin, framework: frameworkOverride })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const enriched = enrichGraphs(scanResult.graphs, { projectRoot: resolve(projectRoot) })
  const issues   = runLint(enriched, config)

  // Optional snapshot diff
  let snapshotDiff: ReportData["snapshot"] | undefined
  if (!skipSnapshot) {
    const storeOpts = { projectRoot: resolve(projectRoot) }
    const baseline  = loadSnapshot(storeOpts)
    if (baseline) {
      const current = captureSnapshot(enriched, scanResult.framework)
      snapshotDiff  = diffSnapshots(baseline, current)
    }
  }

  const data: ReportData = {
    generatedAt: new Date().toISOString(),
    projectRoot: resolve(projectRoot),
    framework:   scanResult.framework,
    routeCount:  scanResult.graphs.length,
    lint:        { issues },
    snapshot:    snapshotDiff,
  }

  const content = isMarkdown(format)
    ? buildMarkdownReport(data)
    : buildHtmlReport(data)

  const outPath = resolve(outFile)
  writeFileSync(outPath, content, "utf8")

  console.log(`${GREEN}✓${RESET} Report saved: ${DIM}${outPath}${RESET}`)
  console.log()
  console.log(`  Format    : ${isMarkdown(format) ? "Markdown" : "HTML"}`)
  console.log(`  Routes    : ${data.routeCount}`)
  console.log(`  Lint      : ${issues.length} issue${issues.length === 1 ? "" : "s"}`)
  if (snapshotDiff) {
    console.log(`  Snapshot  : ${snapshotDiff.hasBreakingChanges ? "BREAKING changes detected" : "no breaking changes"}`)
  }
}

function isMarkdown(format: ReportFormat): boolean {
  return format === "md" || format === "markdown"
}

function defaultOutputFile(format: ReportFormat): string {
  return isMarkdown(format) ? "archtest-report.md" : "archtest-report.html"
}

function requireProject(flags: Record<string, string>): string {
  const v = flags["project"]
  if (!v) {
    console.error("Error: --project is required")
    process.exit(2)
  }
  return v
}
