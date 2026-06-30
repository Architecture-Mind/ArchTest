import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { runLint, ALL_RULES } from "../../linter/runner"
import { loadConfig } from "../../config/index"
import { loadBaseline } from "../../baseline/index"
import type { LintResult, LintSeverity } from "../../linter/types"

const RESET  = "\x1b[0m"
const BOLD   = "\x1b[1m"
const DIM    = "\x1b[90m"
const RED    = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN   = "\x1b[36m"

const SEVERITY_COLOR: Record<LintSeverity, string> = {
  high: RED,
  warn: YELLOW,
  info: CYAN,
}

const SEVERITY_LABEL: Record<LintSeverity, string> = {
  high: "HIGH",
  warn: "WARN",
  info: "INFO",
}

const SEVERITY_ORDER: Record<LintSeverity, number> = { high: 0, warn: 1, info: 2 }
const MIN_SEVERITY_DEFAULT: LintSeverity = "info"

export async function runLintCmd(flags: Record<string, string>): Promise<void> {
  const projectRoot       = requireProject(flags)
  const bin               = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const frameworkOverride = flags["framework"]
  const isJson            = "json" in flags
  const isExplain         = "explain" in flags
  const isCi              = "ci" in flags
  const isNewOnly         = "new-only" in flags
  const minSeverity       = (flags["min-severity"] as LintSeverity | undefined) ?? MIN_SEVERITY_DEFAULT

  const config = loadConfig(projectRoot)

  if (!isJson && !isCi) console.log(`Scanning: ${resolve(projectRoot)}\n`)

  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin, framework: frameworkOverride })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const enriched   = enrichGraphs(scanResult.graphs, { projectRoot: resolve(projectRoot) })
  const allResults = runLint(enriched, config)
  let results      = filterBySeverity(allResults, minSeverity)

  // --new-only: suppress issues present in baseline
  if (isNewOnly) {
    const baseline = loadBaseline({ projectRoot: resolve(projectRoot) })
    if (baseline) {
      const baselineKeys = new Set(baseline.issues.map(r => `${r.code}|${r.route}|${r.field ?? ""}|${r.message}`))
      results = results.filter(r => !baselineKeys.has(`${r.code}|${r.route}|${r.field ?? ""}|${r.message}`))
    }
  }

  // ── JSON output ───────────────────────────────────────────────────────────────
  if (isJson) {
    console.log(JSON.stringify({ issues: results, total: results.length }, null, 2))
    process.exit(results.some(r => r.severity === "high") ? 1 : 0)
  }

  // ── CI annotation output (GitHub Actions) ────────────────────────────────────
  if (isCi) {
    for (const r of results) {
      const level = r.severity === "high" ? "error" : r.severity === "warn" ? "warning" : "notice"
      const title = `[${r.code}] ${r.message}`
      const loc   = r.field ? ` field=${r.field}` : ""
      console.log(`::${level} title=${title}::${r.route}${loc}`)
    }
    process.exit(results.some(r => r.severity === "high") ? 1 : 0)
  }

  // ── Human output ──────────────────────────────────────────────────────────────
  if (results.length === 0) {
    if (isNewOnly) {
      console.log(`${DIM}No new issues since baseline.${RESET}`)
    } else {
      console.log(`${DIM}No issues found.${RESET}`)
    }
    process.exit(0)
  }

  const sorted = [...results].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  )

  for (const r of sorted) {
    const color = SEVERITY_COLOR[r.severity]
    const label = SEVERITY_LABEL[r.severity]
    const loc   = r.field ? `${r.route}  ${DIM}field: ${r.field}${RESET}` : r.route
    console.log(`  ${color}${BOLD}${label}${RESET}  ${loc}`)
    console.log(`        ${DIM}[${r.code}] ${r.message}${RESET}`)

    if (isExplain) {
      printExplain(r)
    }
  }

  console.log()
  printSummary(results)

  process.exit(results.some(r => r.severity === "high") ? 1 : 0)
}

function printExplain(r: LintResult): void {
  const rule = ALL_RULES.find(rl => rl.code === r.code)
  if (!rule?.explain) return

  const { why, risk, fix } = rule.explain
  console.log()
  console.log(`        ${BOLD}Why?${RESET}`)
  console.log(`        ${why}`)
  if (risk.length > 0) {
    console.log()
    console.log(`        ${BOLD}Risk${RESET}`)
    for (const item of risk) {
      console.log(`        ${DIM}• ${item}${RESET}`)
    }
  }
  console.log()
  console.log(`        ${BOLD}Suggested Fix${RESET}`)
  console.log(`        ${fix}`)
  console.log()
}

function filterBySeverity(results: LintResult[], min: LintSeverity): LintResult[] {
  const minOrder = SEVERITY_ORDER[min]
  return results.filter(r => SEVERITY_ORDER[r.severity] <= minOrder)
}

function printSummary(results: LintResult[]): void {
  const high = results.filter(r => r.severity === "high").length
  const warn = results.filter(r => r.severity === "warn").length
  const info = results.filter(r => r.severity === "info").length

  const parts: string[] = []
  if (high) parts.push(`${RED}${high} HIGH${RESET}`)
  if (warn) parts.push(`${YELLOW}${warn} WARN${RESET}`)
  if (info) parts.push(`${CYAN}${info} INFO${RESET}`)

  console.log(`${results.length} issue${results.length === 1 ? "" : "s"} found (${parts.join(", ")})`)
}

function requireProject(flags: Record<string, string>): string {
  const v = flags["project"]
  if (!v) {
    console.error("Error: --project is required")
    process.exit(2)
  }
  return v
}
