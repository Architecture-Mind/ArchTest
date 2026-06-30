import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { runLint } from "../../linter/runner"
import { loadConfig } from "../../config/index"
import { saveBaseline, loadBaseline, baselinePath } from "../../baseline/index"

const RESET = "\x1b[0m"
const BOLD  = "\x1b[1m"
const DIM   = "\x1b[90m"
const GREEN = "\x1b[32m"
const RED   = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN   = "\x1b[36m"

export async function runBaselineCmd(flags: Record<string, string>): Promise<void> {
  const projectRoot       = requireProject(flags)
  const bin               = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const frameworkOverride = flags["framework"]
  const isJson            = "json" in flags
  const storeOpts         = { projectRoot: resolve(projectRoot), file: flags["file"] }

  const config = loadConfig(projectRoot)

  if (!isJson) console.log(`Scanning: ${resolve(projectRoot)}\n`)

  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin, framework: frameworkOverride })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const enriched = enrichGraphs(scanResult.graphs, { projectRoot: resolve(projectRoot) })
  const issues   = runLint(enriched, config)
  const filePath = saveBaseline(issues, storeOpts)

  if (isJson) {
    console.log(JSON.stringify({ saved: filePath, issues: issues.length }, null, 2))
    return
  }

  const high = issues.filter(r => r.severity === "high").length
  const warn = issues.filter(r => r.severity === "warn").length
  const info = issues.filter(r => r.severity === "info").length

  console.log(`${GREEN}✓${RESET} Lint baseline saved: ${DIM}${filePath}${RESET}`)
  console.log()
  console.log(`  Issues : ${issues.length} total  ${RED}${high} HIGH${RESET}  ${YELLOW}${warn} WARN${RESET}  ${CYAN}${info} INFO${RESET}`)
  console.log()
  console.log(`${DIM}Commit ${filePath} to track new issues in CI.${RESET}`)
  console.log(`${DIM}Run: archtest lint --new-only --project . to see only new issues.${RESET}`)
}

export function runBaselineShowCmd(flags: Record<string, string>): void {
  const projectRoot = requireProject(flags)
  const storeOpts   = { projectRoot: resolve(projectRoot), file: flags["file"] }
  const baseline    = loadBaseline(storeOpts)

  if (!baseline) {
    const path = baselinePath(storeOpts)
    console.error(`No baseline found at: ${path}`)
    console.error(`Run: archtest baseline --project ${projectRoot}`)
    process.exit(1)
  }

  console.log(`${BOLD}Lint baseline${RESET}  ${DIM}captured ${baseline.capturedAt}${RESET}`)
  console.log(`${baseline.issues.length} issue${baseline.issues.length === 1 ? "" : "s"} suppressed`)
}

function requireProject(flags: Record<string, string>): string {
  const v = flags["project"]
  if (!v) {
    console.error("Error: --project is required")
    process.exit(2)
  }
  return v
}
