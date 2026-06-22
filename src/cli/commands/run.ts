import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/nestjs-enricher"
import { generateAllTestCases } from "../../generator/index"
import { runAll } from "../../executor/runner"
import type { TestResult } from "../../executor/types"

const PASS  = "\x1b[32m✓\x1b[0m"
const FAIL  = "\x1b[31m✗\x1b[0m"
const ERR   = "\x1b[33m!\x1b[0m"

export async function runRun(flags: Record<string, string>): Promise<void> {
  const projectRoot = requireValue(flags, "project")
  const baseUrl     = requireValue(flags, "base-url")
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const timeoutMs   = Number(flags["timeout"] ?? 5000)
  const concurrency = Number(flags["concurrency"] ?? 5)
  const isJson      = "json" in flags

  if (!isJson) console.log(`Scanning: ${projectRoot}`)

  // ── 1. Scan ─────────────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { framework, graphs, findings } = scanResult

  if (!isJson) {
    console.log(`Framework : ${framework}`)
    console.log(`Routes    : ${graphs.length}`)
    console.log(`Findings  : ${findings.length}`)
  }

  // ── 2. Enrich ────────────────────────────────────────────────────────────────
  const enriched  = enrichGraphs(graphs, { projectRoot: resolve(projectRoot) })
  const dtoRoutes = enriched.filter(g => g.dtos.length > 0).length

  if (!isJson) {
    console.log(`DTOs found: ${enriched.reduce((n, g) => n + g.dtos.length, 0)} across ${dtoRoutes} routes`)
  }

  // ── 3. Generate ──────────────────────────────────────────────────────────────
  const tokens = flags["token"] ? { valid: flags["token"] } : undefined
  const cases  = generateAllTestCases(enriched, { tokens })

  if (!isJson) {
    console.log(`Test cases: ${cases.length} generated`)
    console.log(`\nRunning against ${baseUrl}...\n`)
  }

  // ── 4. Execute ───────────────────────────────────────────────────────────────
  const summary = await runAll(
    cases,
    { baseUrl, timeoutMs, concurrency },
    isJson ? undefined : printProgress
  )

  // ── 5. Report ────────────────────────────────────────────────────────────────
  if (isJson) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    printSummary(summary.results)
    console.log()
    console.log(`Results: PASS ${summary.passed}  FAIL ${summary.failed}  ERROR ${summary.errors}  (${summary.durationMs}ms)`)
  }

  const exitCode = summary.failed > 0 || summary.errors > 0 ? 1 : 0
  process.exit(exitCode)
}

function printProgress(result: TestResult, index: number, total: number): void {
  const icon = result.status === "pass" ? PASS : result.status === "fail" ? FAIL : ERR
  const pad  = String(index).padStart(String(total).length)
  const desc = result.testCase.description.slice(0, 60)
  process.stdout.write(`  [${pad}/${total}] ${icon} ${desc}\n`)
}

function printSummary(results: TestResult[]): void {
  const failures = results.filter(r => r.status !== "pass")
  if (failures.length === 0) return

  console.log("\nFailures:")
  for (const r of failures) {
    const icon = r.status === "fail" ? FAIL : ERR
    console.log(`  ${icon} ${r.testCase.description}`)
    if (r.error) console.log(`       ${r.error}`)
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
