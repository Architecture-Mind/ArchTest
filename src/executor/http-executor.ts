import type { TestCase } from "../generator/types"
import type { TestResult } from "./types"

export interface RequestOptions {
  baseUrl: string
  timeoutMs: number
}

/**
 * Executes a single test case against a running server.
 * Uses native fetch (Node.js 18+).
 */
export async function executeOne(tc: TestCase, opts: RequestOptions): Promise<TestResult> {
  const start  = Date.now()
  const url    = `${opts.baseUrl.replace(/\/$/, "")}${tc.path}`
  const method = tc.method.toUpperCase()

  const hasBody = tc.payload !== undefined && ["POST", "PUT", "PATCH"].includes(method)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Accept": "application/json",
        ...tc.headers,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body:   hasBody ? JSON.stringify(tc.payload) : undefined,
      signal: controller.signal,
    })

    clearTimeout(timer)

    let actualBody: unknown = null
    try {
      const text = await response.text()
      actualBody = text ? JSON.parse(text) : null
    } catch {
      actualBody = null
    }

    const durationMs = Date.now() - start
    const pass       = response.status === tc.expectedStatus

    return {
      testCase:     tc,
      status:       pass ? "pass" : "fail",
      actualStatus: response.status,
      actualBody,
      durationMs,
      ...(!pass && {
        error: `expected ${tc.expectedStatus}, got ${response.status}`,
      }),
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    const durationMs = Date.now() - start
    const name       = (err as { name?: string }).name
    const isTimeout  = name === "AbortError"
    const message    = isTimeout
      ? `timeout after ${opts.timeoutMs}ms`
      : (err instanceof Error ? err.message : String(err))

    return {
      testCase:     tc,
      status:       "error",
      actualStatus: null,
      actualBody:   null,
      durationMs,
      error: message,
    }
  }
}
