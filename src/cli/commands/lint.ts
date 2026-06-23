import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { runLint } from "../../linter/runner"
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
  const projectRoot  = requireProject(flags)
  const bin          = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const isJson       = "json" in flags
  const minSeverity  = (flags["min-severity"] as LintSeverity | undefined) ?? MIN_SEVERITY_DEFAULT

  if (!isJson) console.log(`Scanning: ${resolve(projectRoot)}\n`)

  // ── 1. Scan + Enrich ─────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const enriched = enrichGraphs(scanResult.graphs, { projectRoot: resolve(projectRoot) })

  // ── 2. Lint ───────────────────────────────────────────────────────────────────
  const allResults = runLint(enriched)
  const results    = filterBySeverity(allResults, minSeverity)

  // ── 3. Output ─────────────────────────────────────────────────────────────────
  if (isJson) {
    console.log(JSON.stringify({ issues: results, total: results.length }, null, 2))
    process.exit(results.some(r => r.severity === "high") ? 1 : 0)
  }

  if (results.length === 0) {
    console.log(`${DIM}No issues found.${RESET}`)
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
  }

  console.log()
  printSummary(results)

  process.exit(results.some(r => r.severity === "high") ? 1 : 0)
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
