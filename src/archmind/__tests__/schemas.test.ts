import { TraceJsonOutputSchema, FindingsJsonOutputSchema } from "../schemas"

const VALID_GRAPH = {
  entrypoint:  "GET /users",
  method:      "GET",
  path:        "/users",
  nodes:       [{ id: "n1", type: "ir:handler", symbol: "UserController.findAll" }],
  edges:       [{ from: "n1", to: "n2", relation: "calls", traceability: "static" }],
  annotations: [],
}

const VALID_TRACE = {
  framework:    "nestjs",
  routes_found: 1,
  graphs:       [VALID_GRAPH],
}

describe("TraceJsonOutputSchema", () => {
  it("accepts a valid trace output", () => {
    expect(() => TraceJsonOutputSchema.parse(VALID_TRACE)).not.toThrow()
  })

  it("preserves extra fields on graphs (loose schema)", () => {
    const withExtra = {
      ...VALID_TRACE,
      graphs: [{ ...VALID_GRAPH, ir_ver: "1.0.0", framework: "nestjs" }],
    }
    const result = TraceJsonOutputSchema.parse(withExtra)
    expect((result.graphs[0] as Record<string, unknown>)["ir_ver"]).toBe("1.0.0")
  })

  it("rejects output missing the graphs field", () => {
    const { graphs: _, ...noGraphs } = VALID_TRACE
    expect(() => TraceJsonOutputSchema.parse(noGraphs)).toThrow()
  })

  it("rejects output where graphs is not an array", () => {
    expect(() => TraceJsonOutputSchema.parse({ ...VALID_TRACE, graphs: "not-an-array" })).toThrow()
  })

  it("rejects a graph missing the method field", () => {
    const { method: _, ...noMethod } = VALID_GRAPH
    expect(() =>
      TraceJsonOutputSchema.parse({ ...VALID_TRACE, graphs: [noMethod] })
    ).toThrow()
  })

  it("rejects a graph missing annotations", () => {
    const { annotations: _, ...noAnnotations } = VALID_GRAPH
    expect(() =>
      TraceJsonOutputSchema.parse({ ...VALID_TRACE, graphs: [noAnnotations] })
    ).toThrow()
  })

  it("rejects output missing framework", () => {
    const { framework: _, ...noFramework } = VALID_TRACE
    expect(() => TraceJsonOutputSchema.parse(noFramework)).toThrow()
  })
})

describe("FindingsJsonOutputSchema", () => {
  const VALID_FINDINGS = [
    {
      route:   "POST /users",
      finding: { type: "missing_authorization", severity: "high", summary: "No auth gate" },
    },
  ]

  it("accepts a valid findings array", () => {
    expect(() => FindingsJsonOutputSchema.parse(VALID_FINDINGS)).not.toThrow()
  })

  it("accepts an empty findings array", () => {
    expect(() => FindingsJsonOutputSchema.parse([])).not.toThrow()
  })

  it("accepts findings with optional fields", () => {
    const withOptionals = [
      {
        route:   "POST /login",
        finding: {
          type:            "missing_rate_limit",
          severity:        "warn",
          confidence:      "HIGH",
          recommendations: ["Add throttle guard"],
        },
      },
    ]
    expect(() => FindingsJsonOutputSchema.parse(withOptionals)).not.toThrow()
  })

  it("rejects a finding missing route", () => {
    expect(() =>
      FindingsJsonOutputSchema.parse([{ finding: { type: "x", severity: "high" } }])
    ).toThrow()
  })

  it("rejects a finding missing severity", () => {
    expect(() =>
      FindingsJsonOutputSchema.parse([{ route: "/x", finding: { type: "x" } }])
    ).toThrow()
  })

  it("rejects non-array findings output", () => {
    expect(() => FindingsJsonOutputSchema.parse({ route: "/x" })).toThrow()
  })
})
