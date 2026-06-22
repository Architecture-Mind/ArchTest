import type { DTOSchema } from "../enricher/types"
import type { TestCase, TestCategory } from "./types"
import { validPayload, validValue } from "./valid-value"
import { invalidCasesForField } from "./invalid-cases"

export interface GenerateOptions {
  route: string
  method: string
  path: string
  /** Auth headers to include on the happy-path test */
  headers?: Record<string, string>
}

let idCounter = 0
function nextId(route: string, category: TestCategory, suffix = ""): string {
  const slug = route.toLowerCase().replace(/[^a-z0-9]/g, "_")
  const id = ++idCounter
  return `${slug}_${category}${suffix ? `_${suffix}` : ""}_${id}`
}

/**
 * Generates all test cases for one DTO bound to a route.
 */
export function generateTestCases(dto: DTOSchema, opts: GenerateOptions): TestCase[] {
  const { route, method, path, headers = {} } = opts
  const cases: TestCase[] = []

  const base = validPayload(dto.fields)

  // ── Happy path ──────────────────────────────────────────────────────────────
  cases.push({
    id:             nextId(route, "happy_path"),
    route,
    method,
    path,
    category:       "happy_path",
    description:    `${route} — valid payload`,
    payload:        { ...base },
    headers:        { "Content-Type": "application/json", ...headers },
    expectedStatus: method === "POST" ? 201 : 200,
  })

  // ── One invalid case per field ───────────────────────────────────────────────
  for (const field of dto.fields) {
    const fieldCases = invalidCasesForField(field)

    for (const fc of fieldCases) {
      const payload = buildPayloadForInvalidCase(base, dto, field.name, fc.value)

      cases.push({
        id:             nextId(route, fc.category, field.name),
        route,
        method,
        path,
        category:       fc.category,
        description:    `${route} — ${fc.description}`,
        payload,
        headers:        { "Content-Type": "application/json", ...headers },
        expectedStatus: 400,
      })
    }
  }

  return cases
}

/**
 * Builds a payload where one field has an invalid value and all others are valid.
 * Handles the `required_missing` case by omitting the key entirely.
 */
function buildPayloadForInvalidCase(
  _base: Record<string, unknown>,
  dto: DTOSchema,
  targetField: string,
  invalidValue: unknown
): Record<string, unknown> {
  // Start from a fresh valid payload for all OTHER required fields
  const payload: Record<string, unknown> = {}

  for (const field of dto.fields) {
    if (field.rules.some(r => r.kind === "optional")) continue  // skip optional fields
    if (field.name === targetField) continue                     // skip — we set it below
    payload[field.name] = validValue(field)
  }

  // Apply the invalid value (undefined = omit the key entirely)
  if (invalidValue !== undefined) {
    payload[targetField] = invalidValue
  }

  return payload
}
