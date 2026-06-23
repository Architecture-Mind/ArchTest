import { resolve } from "path"
import { writeFileSync } from "fs"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/nestjs-enricher"
import { buildFuzzCases, runFuzz } from "../../fuzzer/runner"
import type { FuzzResult, FuzzSummary } from "../../fuzzer/types"

const RESET  = "\x1b[0m"
const BOLD   = "\x1b[1m"
const DIM    = "\x1b[90m"
const RED    = "\x1b[31m"
const YELLOW = "\x1b[33m"
const GREEN  = "\x1b[32m"

export async function runFuzzCmd(flags: Record<string, string>): Promise<void> {
  const projectRoot = requireValue(flags, "project")
  const baseUrl     = requireValue(flags, "base-url")
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const timeoutMs   = Number(flags["timeout"]     ?? 5000)
  const concurrency = Number(flags["concurrency"] ?? 5)
  const reportFile  = flags["report"]
  const isJson      = "json" in flags

  if (!isJson) {
    console.log(`${BOLD}archtest fuzz${RESET}`)
    console.log(`Project : ${resolve(projectRoot)}`)
    console.log(`Target  : ${baseUrl}\n`)
  }

  // ── 1. Scan + Enrich ─────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const enriched = enrichGraphs(scanResult.graphs, { projectRoot: resolve(projectRoot) })

  // ── 2. Build fuzz cases ───────────────────────────────────────────────────────
  const cases = buildFuzzCases(enriched)

  if (!isJson) {
    console.log(`${DIM}Framework: ${scanResult.framework}  Routes: ${scanResult.graphs.length}  Fuzz cases: ${cases.length}${RESET}\n`)
    if (cases.length === 0) {
      console.log("No fuzz cases generated — check that your project has routes with DTOs.")
      return
    }
    console.log(`Fuzzing ${enriched.length} routes with ${cases.length} edge-case payloads...\n`)
  }

  // ── 3. Execute ────────────────────────────────────────────────────────────────
  const summary = await runFuzz(cases, { baseUrl, timeoutMs, concurrency })

  // ── 4. Report ─────────────────────────────────────────────────────────────────
  if (isJson) {
    const out = JSON.stringify(buildJsonReport(summary), null, 2)
    if (reportFile) writeFileSync(resolve(reportFile), out, "utf8")
    else console.log(out)
    process.exit(summary.crashes > 0 ? 1 : 0)
  }

  printFindings(summary.results)
  printSummary(summary.total, summary.crashes, summary.durationMs)

  if (reportFile) {
    writeFileSync(resolve(reportFile), JSON.stringify(buildJsonReport(summary), null, 2), "utf8")
    console.log(`\nReport saved → ${reportFile}`)
  }

  process.exit(summary.crashes > 0 ? 1 : 0)
}

function printFindings(results: FuzzResult[]): void {
  const crashes      = results.filter(r => r.status === "crash")
  const unexpected   = results.filter(r => r.status === "unexpected_ok")

  if (crashes.length === 0 && unexpected.length === 0) return

  for (const r of crashes) {
    console.log(
      `  ${RED}${BOLD}🐛 CRASH${RESET}  ${r.fuzzCase.route}` +
      `  ${DIM}field: ${r.fuzzCase.fuzzField}  [${r.fuzzCase.fuzzCategory}]${RESET}` +
      `  → ${RED}${r.actualStatus} Server Error${RESET}`
    )
  }

  for (const r of unexpected) {
    console.log(
      `  ${YELLOW}${BOLD}⚠ BYPASS${RESET}  ${r.fuzzCase.route}` +
      `  ${DIM}field: ${r.fuzzCase.fuzzField}  [${r.fuzzCase.fuzzCategory}]${RESET}` +
      `  → ${YELLOW}${r.actualStatus} (validation bypassed?)${RESET}`
    )
  }

  console.log()
}

function printSummary(total: number, crashes: number, durationMs: number): void {
  const icon = crashes > 0 ? `${RED}${BOLD}FINDINGS${RESET}` : `${GREEN}${BOLD}CLEAN${RESET}`
  console.log(`${icon}  ${crashes} crash${crashes === 1 ? "" : "es"}  ${DIM}${total} payloads  ${durationMs}ms${RESET}`)
}

function buildJsonReport(summary: FuzzSummary) {
  return {
    baseUrl:    summary.baseUrl,
    startedAt:  summary.startedAt,
    durationMs: summary.durationMs,
    total:      summary.total,
    crashes:    summary.crashes,
    results: summary.results.map((r: FuzzResult) => ({
      route:        r.fuzzCase.route,
      field:        r.fuzzCase.fuzzField,
      fuzzCategory: r.fuzzCase.fuzzCategory,
      status:       r.status,
      actualStatus: r.actualStatus ?? null,
      durationMs:   r.durationMs,
      error:        r.error ?? null,
    })),
  }
}

function requireValue(flags: Record<string, string>, key: string): string {
  const v = flags[key]
  if (!v) {
    console.error(`Error: --${key} is required`)
    process.exit(2)
  }
  return v
}
