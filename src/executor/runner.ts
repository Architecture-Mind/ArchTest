import { executeOne } from "./http-executor"
import type { TestCase } from "../generator/types"
import type { TestResult, RunSummary, ExecutorOptions } from "./types"

/**
 * Runs all test cases with bounded concurrency.
 * Progress callback fires after each test completes.
 */
export async function runAll(
  cases: TestCase[],
  opts: ExecutorOptions,
  onProgress?: (result: TestResult, index: number, total: number) => void
): Promise<RunSummary> {
  const timeoutMs   = opts.timeoutMs   ?? 5000
  const concurrency = opts.concurrency ?? 5
  const startedAt   = new Date().toISOString()
  const wallStart   = Date.now()

  const results: TestResult[] = []
  const queue = [...cases]
  let index = 0

  // Worker: drains the queue sequentially
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const tc = queue.shift()
      if (!tc) break

      const result = await executeOne(tc, { baseUrl: opts.baseUrl, timeoutMs })
      results.push(result)

      const current = ++index
      onProgress?.(result, current, cases.length)
    }
  }

  // Spawn N workers in parallel
  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length || 1) }, () => worker())
  )

  const durationMs = Date.now() - wallStart

  return {
    baseUrl:   opts.baseUrl,
    startedAt,
    durationMs,
    total:   results.length,
    passed:  results.filter(r => r.status === "pass").length,
    failed:  results.filter(r => r.status === "fail").length,
    errors:  results.filter(r => r.status === "error").length,
    results,
  }
}
