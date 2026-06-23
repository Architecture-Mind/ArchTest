import { invalidCasesForField } from "../invalid-cases"
import type { FieldSchema } from "../../enricher/types"

function field(name: string, type: FieldSchema["type"], ...kinds: Array<{ kind: string; value?: unknown }>): FieldSchema {
  return { name, type, rules: kinds as FieldSchema["rules"] }
}

describe("invalidCasesForField", () => {
  describe("required / null", () => {
    it("generates required_missing and null_value for required fields", () => {
      const cases = invalidCasesForField(field("name", "string", { kind: "required" }))
      expect(cases.some(c => c.category === "required_missing")).toBe(true)
      expect(cases.some(c => c.category === "null_value")).toBe(true)
    })

    it("does not generate required_missing for optional field", () => {
      const cases = invalidCasesForField(field("bio", "string", { kind: "optional" }))
      expect(cases.some(c => c.category === "required_missing")).toBe(false)
    })
  })

  describe("isIn", () => {
    it("generates invalid_format case with __INVALID_OPTION__", () => {
      const cases = invalidCasesForField(field("status", "string", { kind: "required" }, { kind: "isIn", value: ["active", "inactive"] }))
      const fmt = cases.find(c => c.category === "invalid_format")
      expect(fmt?.value).toBe("__INVALID_OPTION__")
    })

    it("generates wrong_type case when allowed list is non-empty", () => {
      const cases = invalidCasesForField(field("status", "string", { kind: "required" }, { kind: "isIn", value: ["active"] }))
      expect(cases.some(c => c.category === "wrong_type")).toBe(true)
    })

    it("returns early after isIn (no other cases appended)", () => {
      const cases = invalidCasesForField(field("status", "string", { kind: "required" }, { kind: "isIn", value: [] }))
      // Only required_missing, null_value, invalid_format — no string boundary cases
      expect(cases.some(c => c.description.includes("number instead of string"))).toBe(false)
    })
  })

  describe("ethereumAddress", () => {
    it("generates 3 invalid_format cases", () => {
      const cases = invalidCasesForField(field("wallet", "string", { kind: "required" }, { kind: "ethereumAddress" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(3)
    })
  })

  describe("phone", () => {
    it("generates 3 invalid_format cases", () => {
      const cases = invalidCasesForField(field("phone", "string", { kind: "required" }, { kind: "phone" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(3)
    })
  })

  describe("date", () => {
    it("generates 3 invalid_format cases", () => {
      const cases = invalidCasesForField(field("createdAt", "string", { kind: "required" }, { kind: "date" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(3)
    })
  })

  describe("alphanumeric", () => {
    it("generates 3 invalid_format cases", () => {
      const cases = invalidCasesForField(field("code", "string", { kind: "required" }, { kind: "alphanumeric" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(3)
    })
  })

  describe("numberString", () => {
    it("generates 3 invalid_format cases", () => {
      const cases = invalidCasesForField(field("zip", "string", { kind: "required" }, { kind: "numberString" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(3)
    })
  })

  describe("email", () => {
    it("generates 5 invalid_format cases and returns early", () => {
      const cases = invalidCasesForField(field("email", "string", { kind: "required" }, { kind: "email" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBe(5)
      // Should not produce wrong_type cases for email
      expect(cases.some(c => c.description.includes("number instead of string"))).toBe(false)
    })
  })

  describe("url", () => {
    it("generates invalid_format cases for url and returns early", () => {
      const cases = invalidCasesForField(field("link", "string", { kind: "required" }, { kind: "url" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBeGreaterThan(0)
    })
  })

  describe("uuid", () => {
    it("generates invalid_format cases for uuid and returns early", () => {
      const cases = invalidCasesForField(field("id", "string", { kind: "required" }, { kind: "uuid" }))
      const fmt = cases.filter(c => c.category === "invalid_format")
      expect(fmt.length).toBeGreaterThan(0)
    })
  })

  describe("number", () => {
    it("generates boundary_min case when min is set", () => {
      const cases = invalidCasesForField(field("age", "number", { kind: "required" }, { kind: "integer" }, { kind: "min", value: 18 }))
      const bc = cases.find(c => c.category === "boundary_min" && c.description.includes("age"))
      expect(bc?.value).toBe(17)
    })

    it("generates boundary_max case when max is set", () => {
      const cases = invalidCasesForField(field("age", "number", { kind: "required" }, { kind: "integer" }, { kind: "max", value: 100 }))
      const bc = cases.find(c => c.category === "boundary_max")
      expect(bc?.value).toBe(101)
    })

    it("generates wrong_type (string) for number field", () => {
      const cases = invalidCasesForField(field("count", "number", { kind: "required" }))
      expect(cases.some(c => c.category === "wrong_type" && c.value === "not-a-number")).toBe(true)
    })

    it("generates wrong_type (float) for integer field", () => {
      const cases = invalidCasesForField(field("count", "number", { kind: "required" }, { kind: "integer" }))
      expect(cases.some(c => c.category === "wrong_type" && c.value === 1.5)).toBe(true)
    })

    it("generates boundary_min for positive rule (zero and negative)", () => {
      const cases = invalidCasesForField(field("n", "number", { kind: "required" }, { kind: "positive" }))
      expect(cases.some(c => c.value === 0)).toBe(true)
      expect(cases.some(c => c.value === -1)).toBe(true)
    })

    it("generates boundary_max for negative rule (zero)", () => {
      const cases = invalidCasesForField(field("n", "number", { kind: "required" }, { kind: "negative" }))
      expect(cases.some(c => c.value === 0)).toBe(true)
    })
  })

  describe("string", () => {
    it("generates boundary_min for minLength", () => {
      const cases = invalidCasesForField(field("name", "string", { kind: "required" }, { kind: "minLength", value: 3 }))
      const bc = cases.find(c => c.category === "boundary_min")
      expect(String(bc?.value).length).toBe(2)
    })

    it("generates boundary_max for maxLength", () => {
      const cases = invalidCasesForField(field("name", "string", { kind: "required" }, { kind: "maxLength", value: 10 }))
      const bc = cases.find(c => c.category === "boundary_max")
      expect(String(bc?.value).length).toBe(11)
    })

    it("generates wrong_type cases (number and boolean) for string field", () => {
      const cases = invalidCasesForField(field("name", "string", { kind: "required" }))
      expect(cases.some(c => c.category === "wrong_type" && c.value === 12345)).toBe(true)
      expect(cases.some(c => c.category === "wrong_type" && c.value === true)).toBe(true)
    })

    it("generates invalid_format for empty string on required field", () => {
      const cases = invalidCasesForField(field("name", "string", { kind: "required" }))
      expect(cases.some(c => c.category === "invalid_format" && c.value === "")).toBe(true)
    })

    it("does not generate empty string case for optional string field", () => {
      const cases = invalidCasesForField(field("bio", "string", { kind: "optional" }))
      expect(cases.some(c => c.value === "")).toBe(false)
    })

    it("skips boundary_min when minLength is 0", () => {
      const cases = invalidCasesForField(field("tag", "string", { kind: "required" }, { kind: "minLength", value: 0 }))
      expect(cases.some(c => c.category === "boundary_min")).toBe(false)
    })
  })

  describe("boolean", () => {
    it("generates wrong_type cases for boolean rule", () => {
      const cases = invalidCasesForField(field("active", "boolean", { kind: "required" }, { kind: "boolean" }))
      expect(cases.some(c => c.value === "true")).toBe(true)
      expect(cases.some(c => c.value === 1)).toBe(true)
    })

    it("generates wrong_type cases for boolean type", () => {
      const cases = invalidCasesForField(field("active", "boolean", { kind: "required" }))
      expect(cases.some(c => c.value === "true")).toBe(true)
    })
  })

  describe("no matching type", () => {
    it("returns empty cases array for unknown type with no format rules", () => {
      const cases = invalidCasesForField(field("data", "unknown", { kind: "optional" }))
      // Only required_missing and null_value if required — neither here since optional
      expect(cases.filter(c => c.category !== "required_missing" && c.category !== "null_value")).toHaveLength(0)
    })
  })
})
