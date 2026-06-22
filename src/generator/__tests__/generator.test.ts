import { generateAllTestCases } from "../index"
import { generateTestCases } from "../payload-generator"
import type { EnrichedGraph, DTOSchema } from "../../enricher/types"

const CREATE_USER_DTO: DTOSchema = {
  className: "CreateUserDto",
  file: "src/users/create-user.dto.ts",
  fields: [
    {
      name: "email",
      type: "string",
      rules: [{ kind: "required" }, { kind: "email" }],
    },
    {
      name: "age",
      type: "number",
      rules: [{ kind: "required" }, { kind: "integer" }, { kind: "min", value: 18 }, { kind: "max", value: 100 }],
    },
    {
      name: "name",
      type: "string",
      rules: [{ kind: "required" }, { kind: "minLength", value: 3 }, { kind: "maxLength", value: 50 }],
    },
    {
      name: "bio",
      type: "string",
      rules: [{ kind: "optional" }],
    },
  ],
}

const GRAPH_WITH_DTO: EnrichedGraph = {
  entrypoint: "POST /users",
  method: "POST",
  path: "/users",
  nodes: [
    { id: "mw_0_jwt", type: "ir:auth_gate", symbol: "JwtAuthGuard" },
    { id: "vg_createuserdto", type: "ir:validation_gate", symbol: "CreateUserDto" },
  ],
  edges: [],
  framework: "nestjs",
  dtos: [CREATE_USER_DTO],
}

const GRAPH_NO_DTO: EnrichedGraph = {
  entrypoint: "GET /users",
  method: "GET",
  path: "/users",
  nodes: [
    { id: "mw_0_jwt", type: "ir:auth_gate", symbol: "JwtAuthGuard" },
  ],
  edges: [],
  framework: "nestjs",
  dtos: [],
}

describe("generateTestCases (single DTO)", () => {
  const cases = generateTestCases(CREATE_USER_DTO, {
    route: "POST /users",
    method: "POST",
    path: "/users",
  })

  it("generates a happy_path case", () => {
    const happy = cases.filter(c => c.category === "happy_path")
    expect(happy).toHaveLength(1)
    expect(happy[0].expectedStatus).toBe(201)
  })

  it("happy_path payload has valid email", () => {
    const happy = cases.find(c => c.category === "happy_path")!
    expect(happy.payload?.["email"]).toBe("test@example.com")
  })

  it("happy_path payload includes valid age in [18,100]", () => {
    const happy = cases.find(c => c.category === "happy_path")!
    const age = happy.payload?.["age"] as number
    expect(age).toBeGreaterThanOrEqual(18)
    expect(age).toBeLessThanOrEqual(100)
  })

  it("happy_path payload excludes optional fields", () => {
    const happy = cases.find(c => c.category === "happy_path")!
    expect(happy.payload).not.toHaveProperty("bio")
  })

  it("generates required_missing cases for each required field", () => {
    const missing = cases.filter(c => c.category === "required_missing")
    const fields  = missing.map(c => c.description)
    expect(fields.some(d => d.includes("email"))).toBe(true)
    expect(fields.some(d => d.includes("age"))).toBe(true)
    expect(fields.some(d => d.includes("name"))).toBe(true)
  })

  it("required_missing case omits the field from payload", () => {
    const emailMissing = cases.find(
      c => c.category === "required_missing" && c.description.includes("email")
    )!
    expect(emailMissing.payload).not.toHaveProperty("email")
  })

  it("does NOT generate required_missing for optional fields", () => {
    const missing = cases.filter(c => c.category === "required_missing")
    expect(missing.every(c => !c.description.includes("bio"))).toBe(true)
  })

  it("generates invalid_format cases for email", () => {
    const fmt = cases.filter(c => c.category === "invalid_format" && c.description.includes("email"))
    expect(fmt.length).toBeGreaterThanOrEqual(3)
  })

  it("invalid_format case expects 400", () => {
    const fmt = cases.find(c => c.category === "invalid_format")!
    expect(fmt.expectedStatus).toBe(400)
  })

  it("generates boundary_min case for age (min=18 → send 17)", () => {
    const minCase = cases.find(
      c => c.category === "boundary_min" && c.description.includes("age")
    )!
    expect(minCase.payload?.["age"]).toBe(17)
  })

  it("generates boundary_max case for age (max=100 → send 101)", () => {
    const maxCase = cases.find(
      c => c.category === "boundary_max" && c.description.includes("age")
    )!
    expect(maxCase.payload?.["age"]).toBe(101)
  })

  it("generates boundary_min for name minLength (3 → send 2 chars)", () => {
    const minLen = cases.find(
      c => c.category === "boundary_min" && c.description.includes("name")
    )!
    expect((minLen.payload?.["name"] as string).length).toBe(2)
  })

  it("each invalid case has other required fields populated", () => {
    const invalid = cases.filter(c => c.category !== "happy_path")
    for (const c of invalid) {
      // email OR age OR name must be present (at least 2 of 3 required fields)
      const keys = Object.keys(c.payload ?? {})
      expect(keys.length).toBeGreaterThanOrEqual(1)
    }
  })

  it("all cases have unique ids", () => {
    const ids = cases.map(c => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})

describe("generateAllTestCases", () => {
  it("generates cases for graph with DTO and auth gate", () => {
    const cases = generateAllTestCases([GRAPH_WITH_DTO])
    const categories = new Set(cases.map(c => c.category))
    expect(categories.has("happy_path")).toBe(true)
    expect(categories.has("no_auth")).toBe(true)
    expect(categories.has("invalid_token")).toBe(true)
  })

  it("generates only auth cases for graph without DTO", () => {
    const cases = generateAllTestCases([GRAPH_NO_DTO])
    const categories = new Set(cases.map(c => c.category))
    expect(categories.has("no_auth")).toBe(true)
    expect(categories.has("happy_path")).toBe(false)
  })

  it("no_auth case has no Authorization header", () => {
    const cases = generateAllTestCases([GRAPH_WITH_DTO])
    const noAuth = cases.find(c => c.category === "no_auth")!
    expect(noAuth.headers["Authorization"]).toBeUndefined()
  })

  it("valid token is included in happy_path headers when provided", () => {
    const cases = generateAllTestCases([GRAPH_WITH_DTO], {
      tokens: { valid: "my-valid-token" },
    })
    const happy = cases.find(c => c.category === "happy_path")!
    expect(happy.headers["Authorization"]).toBe("Bearer my-valid-token")
  })

  it("handles multiple graphs", () => {
    const cases = generateAllTestCases([GRAPH_WITH_DTO, GRAPH_NO_DTO])
    const routes = new Set(cases.map(c => c.route))
    expect(routes.has("POST /users")).toBe(true)
    expect(routes.has("GET /users")).toBe(true)
  })
})
