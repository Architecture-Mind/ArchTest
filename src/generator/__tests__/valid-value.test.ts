import { validValue, validPayload } from "../valid-value"
import type { FieldSchema } from "../../enricher/types"

function field(name: string, type: FieldSchema["type"], ...kinds: Array<{ kind: string; value?: unknown }>): FieldSchema {
  return { name, type, rules: kinds as FieldSchema["rules"] }
}

describe("validValue", () => {
  it("returns valid email for email rule", () => {
    const v = validValue(field("email", "string", { kind: "email" }))
    expect(v).toMatch(/@/)
  })

  it("returns valid URL for url rule", () => {
    const v = validValue(field("link", "string", { kind: "url" }))
    expect(String(v)).toMatch(/^https?:\/\//)
  })

  it("returns valid UUID for uuid rule", () => {
    const v = validValue(field("id", "string", { kind: "uuid" }))
    expect(String(v)).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("returns valid Ethereum address for ethereumAddress rule", () => {
    const v = validValue(field("wallet", "string", { kind: "ethereumAddress" }))
    expect(String(v)).toMatch(/^0x[0-9a-fA-F]+$/)
  })

  it("returns valid phone for phone rule", () => {
    const v = validValue(field("phone", "string", { kind: "phone" }))
    expect(String(v)).toMatch(/^\+/)
  })

  it("returns ISO date string for date rule", () => {
    const v = validValue(field("createdAt", "string", { kind: "date" }))
    expect(String(v)).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it("returns alphanumeric string for alphanumeric rule", () => {
    const v = validValue(field("code", "string", { kind: "alphanumeric" }))
    expect(String(v)).toMatch(/^[a-zA-Z0-9]+$/)
  })

  it("returns numeric string for numberString rule", () => {
    const v = validValue(field("zipCode", "string", { kind: "numberString" }))
    expect(String(v)).toMatch(/^\d+$/)
  })

  describe("isIn", () => {
    it("returns first allowed value when array is provided", () => {
      const v = validValue(field("status", "string", { kind: "isIn", value: ["active", "inactive"] }))
      expect(v).toBe("active")
    })

    it("returns fallback when allowed array is empty", () => {
      const v = validValue(field("status", "string", { kind: "isIn", value: [] }))
      expect(String(v)).toContain("status")
    })
  })

  it("returns true for boolean rule", () => {
    expect(validValue(field("active", "boolean", { kind: "boolean" }))).toBe(true)
  })

  it("returns true for boolean type without rule", () => {
    expect(validValue(field("active", "boolean"))).toBe(true)
  })

  it("returns array with one item for array rule", () => {
    const v = validValue(field("tags", "array", { kind: "array" }))
    expect(Array.isArray(v)).toBe(true)
    expect((v as unknown[]).length).toBeGreaterThanOrEqual(1)
  })

  it("respects arrayMinSize", () => {
    const v = validValue(field("tags", "array", { kind: "array" }, { kind: "arrayMinSize", value: 3 }))
    expect((v as unknown[]).length).toBeGreaterThanOrEqual(3)
  })

  it("returns positive number for positive rule", () => {
    const v = validValue(field("count", "number", { kind: "positive" }))
    expect(Number(v)).toBeGreaterThan(0)
  })

  it("returns negative number for negative rule", () => {
    const v = validValue(field("offset", "number", { kind: "negative" }))
    expect(Number(v)).toBeLessThan(0)
  })

  it("returns midpoint for number with min and max", () => {
    const v = validValue(field("age", "number", { kind: "integer" }, { kind: "min", value: 18 }, { kind: "max", value: 100 }))
    expect(Number(v)).toBeGreaterThanOrEqual(18)
    expect(Number(v)).toBeLessThanOrEqual(100)
  })

  it("returns min+1 when only min is set", () => {
    expect(validValue(field("score", "number", { kind: "integer" }, { kind: "min", value: 5 }))).toBe(6)
  })

  it("returns max-1 when only max is set", () => {
    expect(validValue(field("score", "number", { kind: "integer" }, { kind: "max", value: 10 }))).toBe(9)
  })

  it("returns number in valid range for number type without constraints", () => {
    expect(validValue(field("count", "number"))).toBe(1)
  })

  it("returns string of minLength for minLength rule", () => {
    const v = validValue(field("code", "string", { kind: "minLength", value: 6 }))
    expect(String(v).length).toBeGreaterThanOrEqual(6)
  })

  it("returns string within maxLength for maxLength rule", () => {
    const v = validValue(field("code", "string", { kind: "maxLength", value: 5 }))
    expect(String(v).length).toBeLessThanOrEqual(5)
  })

  it("returns enum sentinel for enum rule", () => {
    const v = validValue(field("role", "unknown", { kind: "enum", value: "UserRole" }))
    expect(String(v)).toContain("UserRole")
  })

  it("returns default sentinel string for unknown field", () => {
    const v = validValue(field("someField", "unknown"))
    expect(String(v)).toContain("someField")
  })
})

describe("validPayload", () => {
  it("includes required fields, excludes optional ones", () => {
    const fields: FieldSchema[] = [
      field("name", "string", { kind: "required" }),
      field("bio",  "string", { kind: "optional" }),
    ]
    const payload = validPayload(fields)
    expect(payload).toHaveProperty("name")
    expect(payload).not.toHaveProperty("bio")
  })
})
