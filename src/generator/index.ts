import type { EnrichedGraph } from "../enricher/types"
import type { TestCase } from "./types"
import { generateTestCases } from "./payload-generator"

const AUTH_GATE_TYPES = new Set(["ir:auth_gate", "ir:authz_check"])

export interface GeneratorOptions {
  /** Default headers for all requests (e.g. Accept header) */
  defaultHeaders?: Record<string, string>
  /**
   * Tokens for auth testing.
   * If omitted, auth test cases are still generated but headers will be empty.
   */
  tokens?: {
    valid?: string
    invalid?: string
  }
}

/**
 * Top-level entry: EnrichedGraph[] → TestCase[]
 */
export function generateAllTestCases(
  graphs: EnrichedGraph[],
  opts: GeneratorOptions = {}
): TestCase[] {
  const all: TestCase[] = []

  for (const graph of graphs) {
    const route = `${graph.method} ${graph.path}`

    // ── Validation test cases from DTOs ──────────────────────────────────────
    for (const dto of graph.dtos) {
      const cases = generateTestCases(dto, {
        route,
        method: graph.method,
        path:   graph.path,
        headers: {
          ...(opts.defaultHeaders ?? {}),
          ...(opts.tokens?.valid ? { Authorization: `Bearer ${opts.tokens.valid}` } : {}),
        },
      })
      all.push(...cases)
    }

    // ── Auth test cases from auth_gate nodes ──────────────────────────────────
    const hasAuthGate = graph.nodes.some(n => AUTH_GATE_TYPES.has(n.type))
    if (hasAuthGate) {
      all.push(...generateAuthTestCases(graph, opts))
    }
  }

  return all
}

function generateAuthTestCases(graph: EnrichedGraph, opts: GeneratorOptions): TestCase[] {
  const route  = `${graph.method} ${graph.path}`
  const method = graph.method
  const path   = graph.path
  const cases: TestCase[] = []

  // No token at all → expect 401
  cases.push({
    id:             `auth_no_token_${sanitize(route)}`,
    route,
    method,
    path,
    category:       "no_auth",
    description:    `${route} — no auth token → expect 401`,
    headers:        { ...(opts.defaultHeaders ?? {}) },
    expectedStatus: 401,
  })

  // Invalid / malformed token → expect 401
  const badToken = opts.tokens?.invalid ?? "invalid.token.value"
  cases.push({
    id:             `auth_bad_token_${sanitize(route)}`,
    route,
    method,
    path,
    category:       "invalid_token",
    description:    `${route} — invalid token → expect 401`,
    headers:        { ...(opts.defaultHeaders ?? {}), Authorization: `Bearer ${badToken}` },
    expectedStatus: 401,
  })

  return cases
}

function sanitize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")
}
