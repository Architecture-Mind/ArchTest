import { buildFuzzCases } from "../runner"
import type { EnrichedGraph } from "../../enricher/types"
import type { DTOSchema } from "../../enricher/types"

function graph(method: string, path: string, dtos: DTOSchema[]): EnrichedGraph {
  return { entrypoint: `${method} ${path}`, method, path, nodes: [], edges: [], framework: "nestjs", dtos }
}

function dto(className: string, fields: DTOSchema["fields"]): DTOSchema {
  return { className, file: "test.dto.ts", fields }
}

function field(name: string, type: DTOSchema["fields"][0]["type"]): DTOSchema["fields"][0] {
  return { name, type, rules: [{ kind: "required" }] }
}

describe("fuzz coverage tracking", () => {
  const graphs = [
    graph("POST", "/login", [
      dto("LoginDto", [field("email", "string"), field("password", "string")]),
    ]),
    graph("POST", "/items", [
      dto("CreateItemDto", [field("name", "string"), field("price", "number")]),
    ]),
  ]

  // buildFuzzCases covers the case generation; coverage is computed in runFuzz.
  // Here we verify the cases have the right structure for coverage computation.

  it("generates cases for every DTO field", () => {
    const cases = buildFuzzCases(graphs)
    const emailCases    = cases.filter(c => c.route === "POST /login"    && c.fuzzField === "email")
    const passwordCases = cases.filter(c => c.route === "POST /login"    && c.fuzzField === "password")
    const nameCases     = cases.filter(c => c.route === "POST /items"    && c.fuzzField === "name")
    const priceCases    = cases.filter(c => c.route === "POST /items"    && c.fuzzField === "price")

    expect(emailCases.length).toBeGreaterThan(0)
    expect(passwordCases.length).toBeGreaterThan(0)
    expect(nameCases.length).toBeGreaterThan(0)
    expect(priceCases.length).toBeGreaterThan(0)
  })

  it("each case has fuzzField and fuzzCategory set", () => {
    const cases = buildFuzzCases(graphs)
    for (const c of cases) {
      expect(typeof c.fuzzField).toBe("string")
      expect(c.fuzzField.length).toBeGreaterThan(0)
      expect(typeof c.fuzzCategory).toBe("string")
      expect(c.fuzzCategory.length).toBeGreaterThan(0)
    }
  })

  it("produces multiple fuzz categories per field", () => {
    const cases = buildFuzzCases(graphs)
    const emailCategories = [...new Set(
      cases.filter(c => c.fuzzField === "email").map(c => c.fuzzCategory)
    )]
    expect(emailCategories.length).toBeGreaterThan(3)
  })

  it("number fields get different fuzz values than string fields", () => {
    const cases = buildFuzzCases(graphs)
    const nameCategories  = new Set(cases.filter(c => c.fuzzField === "name").map(c => c.fuzzCategory))
    const priceCategories = new Set(cases.filter(c => c.fuzzField === "price").map(c => c.fuzzCategory))
    // number fields should have overflow_number / extreme_number; string fields should have very_long_string
    expect(priceCategories.has("overflow_number") || priceCategories.has("extreme_number")).toBe(true)
    expect(nameCategories.has("very_long_string")).toBe(true)
  })

  it("each case payload has the fuzz value in the correct field", () => {
    const cases = buildFuzzCases(graphs)
    for (const c of cases) {
      if (c.fuzzCategory === "undefined") {
        expect(Object.prototype.hasOwnProperty.call(c.payload, c.fuzzField)).toBe(false)
      } else {
        expect(Object.prototype.hasOwnProperty.call(c.payload, c.fuzzField)).toBe(true)
      }
    }
  })

  it("other fields in payload keep valid values while one is fuzzed", () => {
    const cases = buildFuzzCases(graphs)
    const emailFuzzCases = cases.filter(c => c.route === "POST /login" && c.fuzzField === "email")
    for (const c of emailFuzzCases) {
      // password field should still have a valid value (not undefined)
      if (c.fuzzCategory !== "undefined") {
        expect(Object.prototype.hasOwnProperty.call(c.payload, "password")).toBe(true)
      }
    }
  })
})
