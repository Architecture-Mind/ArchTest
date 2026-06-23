import type { FieldSchema } from "../enricher/types"

/**
 * Generates a single valid value for a field that satisfies all its validation rules.
 */
export function validValue(field: FieldSchema): unknown {
  const rules = field.rules

  const has = (kind: string) => rules.some(r => r.kind === kind)
  const get = (kind: string): number | string | string[] | undefined =>
    rules.find(r => r.kind === kind)?.value

  // Format-specific values
  if (has("email"))           return "test@example.com"
  if (has("url"))             return "https://example.com"
  if (has("uuid"))            return "550e8400-e29b-41d4-a716-446655440000"
  if (has("ethereumAddress")) return "0x742d35Cc6634C0532925a3b8D4C9b4C5A91B7CF"
  if (has("phone"))           return "+84901234567"
  if (has("date"))            return "2024-01-15T00:00:00.000Z"
  if (has("alphanumeric"))    return "abc123"
  if (has("numberString"))    return "12345"

  // Allowed-values list — pick the first entry
  if (has("isIn")) {
    const allowed = rules.find(r => r.kind === "isIn")?.value
    if (Array.isArray(allowed) && allowed.length > 0) return allowed[0]
    return `test_${field.name}`
  }

  // Boolean
  if (has("boolean") || field.type === "boolean") return true

  // Array
  if (has("array") || field.type === "array") {
    const minSize = get("arrayMinSize") as number | undefined
    const count   = minSize != null ? Math.max(minSize, 1) : 1
    return Array.from({ length: count }, () => "item")
  }

  // Number / integer
  if (has("integer") || has("positive") || has("negative") || field.type === "number") {
    const min = get("min") as number | undefined
    const max = get("max") as number | undefined
    if (has("positive")) return 1
    if (has("negative")) return -1
    if (min != null && max != null) return Math.floor((min + max) / 2)
    if (min != null) return min + 1
    if (max != null) return max - 1
    return 1
  }

  // String
  const minLen = get("minLength") as number | undefined
  const maxLen = get("maxLength") as number | undefined

  if (minLen != null || maxLen != null) {
    const target = minLen != null
      ? Math.max(minLen, 1)
      : Math.min(maxLen! - 1, 10)
    return "a".repeat(target)
  }

  // Enum — return the class name placeholder; generator treats it as a sentinel
  if (has("enum")) return `__ENUM__${get("enum") as string}__VALID__`

  // Default string
  return `test_${field.name}`
}

/**
 * Generates a valid payload object for all required fields of a DTO.
 */
export function validPayload(fields: FieldSchema[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    if (!field.rules.some(r => r.kind === "optional")) {
      payload[field.name] = validValue(field)
    }
  }
  return payload
}
