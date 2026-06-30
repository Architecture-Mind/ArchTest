import type { EnrichedGraph } from "../enricher/types"
import type { ExecutorOptions } from "../executor/types"
import type { FuzzCase, FuzzResult, FuzzSummary, FieldCoverage } from "./types"
import { generateFuzzValues } from "./fuzz-values"
import { validPayload } from "../generator/valid-value"

export function buildFuzzCases(graphs: EnrichedGraph[]): FuzzCase[] {
  const cases: FuzzCase[] = []

  for (const graph of graphs) {
    for (const dto of graph.dtos) {
      const basePayload = validPayload(dto.fields)

      for (const field of dto.fields) {
        const fuzzValues = generateFuzzValues(field)

        for (const fuzzValue of fuzzValues) {
          const payload: Record<string, unknown> = { ...basePayload }

          if (fuzzValue === undefined) {
            delete payload[field.name]
          } else {
            payload[field.name] = fuzzValue
          }

          const fuzzCategory = categorizeFuzzValue(fuzzValue)
          const id = `fuzz_${graph.method}_${graph.path}_${field.name}_${cases.length}`

          cases.push({
            id,
            category:     "fuzz",
            route:        `${graph.method} ${graph.path}`,
            method:       graph.method,
            path:         graph.path,
            description:  `[fuzz] ${field.name} — ${fuzzCategory}`,
            payload,
            headers:      { "Content-Type": "application/json" },
            expectedStatus: 400,
            fuzzField:    field.name,
            fuzzCategory,
          })
        }
      }
    }
  }

  return cases
}

function categorizeFuzzValue(v: unknown): string {
  if (v === null)      return "null"
  if (v === undefined) return "undefined"
  if (Array.isArray(v)) return "type_confusion_array"
  if (typeof v === "object") return "type_confusion_object"
  if (typeof v === "string") {
    if (v.length >= 1000)           return "very_long_string"
    if (v.includes("OR 1=1") || v.includes("DROP TABLE")) return "sql_injection"
    if (v.includes("{{") || v.includes("${")) return "template_injection"
    if (v.includes("<script>"))     return "xss"
    if (v.includes(".."))          return "path_traversal"
    if (/[\u{1F300}-\u{1FFFF}]/u.test(v)) return "unicode_emoji"
    if (v.trim() === "")           return "whitespace_or_empty"
    return "unicode_edge"
  }
  if (typeof v === "number") {
    if (!isFinite(v))              return "non_finite"
    if (Math.abs(v) > Number.MAX_SAFE_INTEGER) return "overflow_number"
    return "extreme_number"
  }
  return "unknown"
}

export async function runFuzz(
  cases: FuzzCase[],
  opts: ExecutorOptions,
): Promise<FuzzSummary> {
  const startedAt  = new Date().toISOString()
  const wallStart  = Date.now()
  const results: FuzzResult[] = []

  const concurrency = opts.concurrency ?? 5
  const timeoutMs   = opts.timeoutMs   ?? 5000
  const queue       = [...cases]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const fc = queue.shift()
      if (!fc) break
      results.push(await executeFuzzCase(fc, opts.baseUrl, timeoutMs))
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, cases.length || 1) }, () => worker())
  )

  const fieldCoverage = computeFieldCoverage(results, cases)

  return {
    baseUrl:       opts.baseUrl,
    startedAt,
    durationMs:    Date.now() - wallStart,
    total:         results.length,
    crashes:       results.filter(r => r.status === "crash").length,
    results,
    fieldCoverage,
    coveragePct:   fieldCoverage.length > 0 ? 100 : 0,
  }
}

function computeFieldCoverage(results: FuzzResult[], cases: FuzzCase[]): FieldCoverage[] {
  // Build a map of route+field → all cases and their results
  const map = new Map<string, { route: string; field: string; categories: Set<string>; crashes: number; bypasses: number; total: number }>()

  for (const fc of cases) {
    const key = `${fc.route}|${fc.fuzzField}`
    if (!map.has(key)) {
      map.set(key, { route: fc.route, field: fc.fuzzField, categories: new Set(), crashes: 0, bypasses: 0, total: 0 })
    }
    map.get(key)!.categories.add(fc.fuzzCategory)
    map.get(key)!.total++
  }

  for (const r of results) {
    const key = `${r.fuzzCase.route}|${r.fuzzCase.fuzzField}`
    const entry = map.get(key)
    if (!entry) continue
    if (r.status === "crash")        entry.crashes++
    if (r.status === "unexpected_ok") entry.bypasses++
  }

  return [...map.values()].map(e => ({
    route:            e.route,
    field:            e.field,
    totalPayloads:    e.total,
    categoriesFuzzed: [...e.categories].sort(),
    crashes:          e.crashes,
    bypasses:         e.bypasses,
  }))
}

async function executeFuzzCase(
  fc: FuzzCase,
  baseUrl: string,
  timeoutMs: number,
): Promise<FuzzResult> {
  const start      = Date.now()
  const url        = `${baseUrl.replace(/\/$/, "")}${fc.path}`
  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method:  fc.method.toUpperCase(),
      headers: { "Accept": "application/json", ...fc.headers },
      body:    JSON.stringify(fc.payload),
      signal:  controller.signal,
    })
    clearTimeout(timer)

    const status = response.status

    return {
      fuzzCase:    fc,
      actualStatus: status,
      durationMs:  Date.now() - start,
      // 5xx = crash (server didn't handle the input)
      // 2xx with fuzz payload = unexpected_ok (validation bypassed)
      status: status >= 500 ? "crash"
            : status < 300  ? "unexpected_ok"
            : "ok",
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    const error = err instanceof Error ? err.message : String(err)
    return {
      fuzzCase:   fc,
      durationMs: Date.now() - start,
      status:     "ok",
      error,
    }
  }
}
