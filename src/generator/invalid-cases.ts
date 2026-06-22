import type { FieldSchema } from "../enricher/types"
import type { TestCategory } from "./types"

export interface InvalidCase {
  category: TestCategory
  description: string
  /** The invalid value to put on this field */
  value: unknown
}

/**
 * Returns all invalid test cases for a single field.
 * Each case describes ONE violation — the caller keeps other fields valid.
 */
export function invalidCasesForField(field: FieldSchema): InvalidCase[] {
  const cases: InvalidCase[] = []
  const rules = field.rules

  const has = (kind: string) => rules.some(r => r.kind === kind)
  const get = (kind: string): number | undefined => {
    const v = rules.find(r => r.kind === kind)?.value
    return typeof v === "number" ? v : undefined
  }

  const isRequired = has("required") && !has("optional")

  // --- required_missing ---
  if (isRequired) {
    cases.push({
      category: "required_missing",
      description: `${field.name} is missing`,
      value: undefined,  // caller omits the key
    })
  }

  // --- null_value ---
  if (isRequired) {
    cases.push({
      category: "null_value",
      description: `${field.name} is null`,
      value: null,
    })
  }

  // --- invalid_format (email) ---
  if (has("email")) {
    for (const bad of ["not-an-email", "abc@", "@domain.com", "plain-string", ""]) {
      cases.push({
        category: "invalid_format",
        description: `${field.name} has invalid email: "${bad}"`,
        value: bad,
      })
    }
    return cases  // email field: format cases cover the type too
  }

  // --- invalid_format (url) ---
  if (has("url")) {
    for (const bad of ["not-a-url", "ftp://", "http//missing-colon", ""]) {
      cases.push({
        category: "invalid_format",
        description: `${field.name} has invalid url: "${bad}"`,
        value: bad,
      })
    }
    return cases
  }

  // --- invalid_format (uuid) ---
  if (has("uuid")) {
    for (const bad of ["not-a-uuid", "12345", "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"]) {
      cases.push({
        category: "invalid_format",
        description: `${field.name} has invalid uuid: "${bad}"`,
        value: bad,
      })
    }
    return cases
  }

  // --- number / integer boundaries ---
  if (has("integer") || has("positive") || has("negative") || field.type === "number") {
    const min = get("min")
    const max = get("max")

    if (min != null) {
      cases.push({
        category: "boundary_min",
        description: `${field.name} below min (${min - 1})`,
        value: min - 1,
      })
    }
    if (max != null) {
      cases.push({
        category: "boundary_max",
        description: `${field.name} above max (${max + 1})`,
        value: max + 1,
      })
    }
    if (has("positive")) {
      cases.push({
        category: "boundary_min",
        description: `${field.name} is zero (not positive)`,
        value: 0,
      })
      cases.push({
        category: "boundary_min",
        description: `${field.name} is negative`,
        value: -1,
      })
    }
    if (has("negative")) {
      cases.push({
        category: "boundary_max",
        description: `${field.name} is zero (not negative)`,
        value: 0,
      })
    }
    // Wrong type for number fields
    cases.push({
      category: "wrong_type",
      description: `${field.name} is a string instead of number`,
      value: "not-a-number",
    })
    if (has("integer")) {
      cases.push({
        category: "wrong_type",
        description: `${field.name} is a float (not integer)`,
        value: 1.5,
      })
    }
    return cases
  }

  // --- string boundaries ---
  if (field.type === "string" || has("minLength") || has("maxLength")) {
    const minLen = get("minLength")
    const maxLen = get("maxLength")

    if (minLen != null && minLen > 0) {
      cases.push({
        category: "boundary_min",
        description: `${field.name} too short (${minLen - 1} chars)`,
        value: "a".repeat(minLen - 1),
      })
    }
    if (maxLen != null) {
      cases.push({
        category: "boundary_max",
        description: `${field.name} too long (${maxLen + 1} chars)`,
        value: "a".repeat(maxLen + 1),
      })
    }

    // Wrong type
    cases.push({
      category: "wrong_type",
      description: `${field.name} is a number instead of string`,
      value: 12345,
    })
    cases.push({
      category: "wrong_type",
      description: `${field.name} is a boolean instead of string`,
      value: true,
    })

    // Empty string for required string fields
    if (isRequired) {
      cases.push({
        category: "invalid_format",
        description: `${field.name} is empty string`,
        value: "",
      })
    }
    return cases
  }

  // --- boolean wrong type ---
  if (has("boolean") || field.type === "boolean") {
    cases.push({
      category: "wrong_type",
      description: `${field.name} is a string instead of boolean`,
      value: "true",
    })
    cases.push({
      category: "wrong_type",
      description: `${field.name} is a number instead of boolean`,
      value: 1,
    })
    return cases
  }

  return cases
}
