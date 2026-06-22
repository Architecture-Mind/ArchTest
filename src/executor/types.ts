import type { TestCase } from "../generator/types"

export type TestStatus = "pass" | "fail" | "error" | "skip"

export interface TestResult {
  testCase: TestCase
  status: TestStatus
  actualStatus: number | null
  actualBody: unknown
  durationMs: number
  error?: string
}

export interface RunSummary {
  baseUrl: string
  startedAt: string
  durationMs: number
  total: number
  passed: number
  failed: number
  errors: number
  results: TestResult[]
}

export interface ExecutorOptions {
  baseUrl: string
  /** ms per request, default 5000 */
  timeoutMs?: number
  /** max concurrent requests, default 5 */
  concurrency?: number
}
