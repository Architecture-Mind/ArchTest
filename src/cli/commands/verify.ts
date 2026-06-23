import { resolve } from "path"
import { writeFileSync } from "fs"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { generateAllTestCases } from "../../generator/index"
import { runAll } from "../../executor/runner"
import type { TestResult, RunSummary } from "../../executor/types"

const RESET = "\x1b[0m"
const DIM   = "\x1b[90m"
const BOLD  = "\x1b[1m"
const GREEN = "\x1b[32m"
const RED   = "\x1b[31m"
const YELLOW = "\x1b[33m"

export async function runVerify(flags: Record<string, string>): Promise<void> {
  const projectRoot = requireValue(flags, "project")
  const baseUrl     = requireValue(flags, "base-url")
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const timeoutMs   = Number(flags["timeout"]     ?? 5000)
  const concurrency = Number(flags["concurrency"] ?? 5)
  const reportFile  = flags["report"]
  const isJson      = "json" in flags

  if (!isJson) {
    console.log(`${BOLD}archtest verify${RESET}`)
    console.log(`Project : ${resolve(projectRoot)}`)
    console.log(`Target  : ${baseUrl}\n`)
  }

  // ── 1. Scan ──────────────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { framework, graphs, findings } = scanResult

  // ── 2. Enrich ────────────────────────────────────────────────────────────────
  const enriched = enrichGraphs(graphs, { projectRoot: resolve(projectRoot), framework })

  // ── 3. Generate ──────────────────────────────────────────────────────────────
  const tokens = flags["token"] ? { valid: flags["token"] } : undefined
  const cases  = generateAllTestCases(enriched, { tokens })

  if (!isJson) {
    console.log(`${DIM}Framework: ${framework}  Routes: ${graphs.length}  Cases: ${cases.length}  Findings: ${findings.length}${RESET}\n`)
    if (cases.length === 0) {
      console.log("No test cases generated — check that your project has routes with DTOs.")
      return
    }
    console.log(`Running ${cases.length} test cases against ${baseUrl}...\n`)
  }

  // ── 4. Execute ───────────────────────────────────────────────────────────────
  const summary = await runAll(cases, { baseUrl, timeoutMs, concurrency })

  // ── 5. Report ────────────────────────────────────────────────────────────────
  if (isJson) {
    const out = buildJsonReport(summary, framework, findings.length)
    const json = JSON.stringify(out, null, 2)
    if (reportFile) {
      writeFileSync(resolve(reportFile), json, "utf8")
    } else {
      console.log(json)
    }
    process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0)
  }

  printRouteBreakdown(summary.results)
  printFailureDetail(summary.results)
  printFinalSummary(summary, reportFile)

  if (reportFile) {
    const out  = buildJsonReport(summary, framework, findings.length)
    writeFileSync(resolve(reportFile), JSON.stringify(out, null, 2), "utf8")
    console.log(`\nReport saved → ${reportFile}`)
  }

  process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0)
}

// ── Per-route breakdown ───────────────────────────────────────────────────────

function printRouteBreakdown(results: TestResult[]): void {
  const byRoute = groupByRoute(results)

  for (const [route, routeResults] of byRoute) {
    const passed  = routeResults.filter(r => r.status === "pass").length
    const failed  = routeResults.filter(r => r.status === "fail").length
    const errored = routeResults.filter(r => r.status === "error").length
    const total   = routeResults.length
    const allPass = failed === 0 && errored === 0

    const icon    = allPass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`
    const counter = allPass
      ? `${DIM}${total}/${total} passed${RESET}`
      : `${RED}${failed + errored} failed${RESET}${DIM}, ${passed} passed${RESET}`

    console.log(`  ${icon} ${BOLD}${route}${RESET}  ${counter}`)

    if (!allPass) {
      for (const r of routeResults) {
        if (r.status === "pass") continue
        const icon2    = r.status === "fail" ? `${RED}✗${RESET}` : `${YELLOW}!${RESET}`
        const expected = r.testCase.expectedStatus
        const actual   = r.actualStatus ?? "—"
        const label    = r.testCase.description.replace(/^[^—]+— /, "")
        console.log(`    ${icon2} ${DIM}${label}${RESET}  expected ${expected}, got ${actual}`)
        if (r.error) console.log(`       ${YELLOW}${r.error}${RESET}`)
      }
    }
  }

  console.log()
}

// ── Failure detail section ────────────────────────────────────────────────────

function printFailureDetail(results: TestResult[]): void {
  const failures = results.filter(r => r.status !== "pass")
  if (failures.length === 0) return

  const categories = new Map<string, number>()
  for (const r of failures) {
    const cat = r.testCase.category
    categories.set(cat, (categories.get(cat) ?? 0) + 1)
  }

  console.log(`${BOLD}Failure breakdown${RESET}`)
  for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${RED}${String(count).padStart(3)}${RESET}  ${cat.replace(/_/g, " ")}`)
  }
  console.log()
}

// ── Final summary line ────────────────────────────────────────────────────────

function printFinalSummary(summary: RunSummary, reportFile?: string): void {
  const allPass = summary.failed === 0 && summary.errors === 0

  const status = allPass
    ? `${GREEN}${BOLD}PASS${RESET}`
    : `${RED}${BOLD}FAIL${RESET}`

  const parts = [
    `${GREEN}${summary.passed} passed${RESET}`,
    summary.failed > 0 ? `${RED}${summary.failed} failed${RESET}` : null,
    summary.errors  > 0 ? `${YELLOW}${summary.errors} errors${RESET}` : null,
    `${DIM}${summary.total} total  ${summary.durationMs}ms${RESET}`,
  ].filter(Boolean)

  console.log(`${status}  ${parts.join("  ")}`)

  if (!allPass && !reportFile) {
    console.log(`\n${DIM}Tip: add --report results.json to save full output${RESET}`)
  }
}

// ── JSON report shape ─────────────────────────────────────────────────────────

function buildJsonReport(summary: RunSummary, framework: string, findingsCount: number) {
  return {
    framework,
    findings: findingsCount,
    baseUrl:    summary.baseUrl,
    startedAt:  summary.startedAt,
    durationMs: summary.durationMs,
    total:   summary.total,
    passed:  summary.passed,
    failed:  summary.failed,
    errors:  summary.errors,
    pass:    summary.failed === 0 && summary.errors === 0,
    results: summary.results.map(r => ({
      route:          r.testCase.route,
      category:       r.testCase.category,
      description:    r.testCase.description,
      status:         r.status,
      expectedStatus: r.testCase.expectedStatus,
      actualStatus:   r.actualStatus,
      durationMs:     r.durationMs,
      error:          r.error ?? null,
    })),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function groupByRoute(results: TestResult[]): Map<string, TestResult[]> {
  const map = new Map<string, TestResult[]>()
  for (const r of results) {
    const key = r.testCase.route
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return map
}

function requireValue(flags: Record<string, string>, key: string): string {
  const v = flags[key]
  if (!v) {
    console.error(`Error: --${key} is required`)
    process.exit(2)
  }
  return v
}
