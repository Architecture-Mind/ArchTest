import { runLint } from "../runner"
import type { EnrichedGraph, DTOSchema } from "../../enricher/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function graph(
  method: string,
  path: string,
  opts: {
    withAuth?:    boolean
    dtos?:        DTOSchema[]
    hasValidGate?: boolean
  } = {}
): EnrichedGraph {
  const nodes: EnrichedGraph["nodes"] = []

  if (opts.withAuth) {
    nodes.push({ id: "auth_0", type: "ir:auth_gate", symbol: "JwtAuthGuard" })
  }
  if (opts.hasValidGate !== false && (opts.dtos ?? []).length > 0) {
    nodes.push({ id: "vg_0", type: "ir:validation_gate", symbol: opts.dtos![0].className })
  }

  return {
    entrypoint: `${method} ${path}`,
    method,
    path,
    nodes,
    edges: [],
    framework: "nestjs",
    dtos: opts.dtos ?? [],
  }
}

function dto(className: string, fields: DTOSchema["fields"] = []): DTOSchema {
  return { className, file: "test.dto.ts", fields }
}

function field(name: string, ...kinds: string[]): DTOSchema["fields"][0] {
  return {
    name,
    type: "string",
    rules: kinds.map(k => ({ kind: k as never })),
  }
}

// ── L001 — Missing validation ─────────────────────────────────────────────────

describe("L001 — missing DTO fields", () => {
  it("flags route whose DTO has no fields", () => {
    const graphs = [graph("POST", "/users", { dtos: [dto("CreateUserDto", [])] })]
    const results = runLint(graphs)
    expect(results.some(r => r.code === "L001" && r.route === "POST /users")).toBe(true)
  })

  it("does not flag route with validated fields", () => {
    const graphs = [graph("POST", "/users", {
      dtos: [dto("CreateUserDto", [field("email", "required", "email")])],
    })]
    const results = runLint(graphs)
    expect(results.some(r => r.code === "L001")).toBe(false)
  })

  it("severity is warn", () => {
    const graphs = [graph("POST", "/users", { dtos: [dto("EmptyDto")] })]
    const r = runLint(graphs).find(r => r.code === "L001")!
    expect(r.severity).toBe("warn")
  })
})

// ── L002 — Weak password ──────────────────────────────────────────────────────

describe("L002 — weak password field", () => {
  it("flags password field with no minLength", () => {
    const graphs = [graph("POST", "/auth/register", {
      dtos: [dto("RegisterDto", [field("password", "required")])],
    })]
    const results = runLint(graphs)
    expect(results.some(r => r.code === "L002" && r.field === "password")).toBe(true)
  })

  it("does not flag password field that has minLength", () => {
    const graphs = [graph("POST", "/auth/register", {
      dtos: [dto("RegisterDto", [{
        name: "password", type: "string",
        rules: [{ kind: "required" }, { kind: "minLength", value: 8 }],
      }])],
    })]
    expect(runLint(graphs).some(r => r.code === "L002")).toBe(false)
  })

  it("also flags fields named passwd and secret", () => {
    const graphs = [graph("POST", "/auth", {
      dtos: [dto("Dto", [field("passwd", "required"), field("secret", "required")])],
    })]
    const codes = runLint(graphs).filter(r => r.code === "L002").map(r => r.field)
    expect(codes).toContain("passwd")
    expect(codes).toContain("secret")
  })

  it("severity is warn", () => {
    const graphs = [graph("POST", "/auth", {
      dtos: [dto("Dto", [field("password", "required")])],
    })]
    expect(runLint(graphs).find(r => r.code === "L002")!.severity).toBe("warn")
  })
})

// ── L003 — Unprotected write route ───────────────────────────────────────────

describe("L003 — unprotected write route", () => {
  it("flags DELETE route with no auth", () => {
    const graphs = [graph("DELETE", "/users/:id")]
    expect(runLint(graphs).some(r => r.code === "L003" && r.route === "DELETE /users/:id")).toBe(true)
  })

  it("flags POST, PUT, PATCH routes with no auth", () => {
    const graphs = [
      graph("POST",  "/items"),
      graph("PUT",   "/items/:id"),
      graph("PATCH", "/items/:id"),
    ]
    const codes = runLint(graphs).filter(r => r.code === "L003").map(r => r.route)
    expect(codes).toContain("POST /items")
    expect(codes).toContain("PUT /items/:id")
    expect(codes).toContain("PATCH /items/:id")
  })

  it("does not flag write route that has auth gate", () => {
    const graphs = [graph("DELETE", "/users/:id", { withAuth: true })]
    expect(runLint(graphs).some(r => r.code === "L003")).toBe(false)
  })

  it("does not flag GET route with no auth", () => {
    const graphs = [graph("GET", "/public/items")]
    expect(runLint(graphs).some(r => r.code === "L003")).toBe(false)
  })

  it("severity is high", () => {
    const graphs = [graph("DELETE", "/users/:id")]
    expect(runLint(graphs).find(r => r.code === "L003")!.severity).toBe("high")
  })
})

// ── L004 — No DTO on write route ─────────────────────────────────────────────

describe("L004 — no DTO on write route", () => {
  it("flags POST route with no DTO at all", () => {
    const graphs = [graph("POST", "/orders")]
    expect(runLint(graphs).some(r => r.code === "L004" && r.route === "POST /orders")).toBe(true)
  })

  it("does not flag POST route that has a DTO with fields", () => {
    const graphs = [graph("POST", "/orders", {
      dtos: [dto("CreateOrderDto", [field("item", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L004")).toBe(false)
  })

  it("does not flag GET route with no DTO", () => {
    const graphs = [graph("GET", "/orders")]
    expect(runLint(graphs).some(r => r.code === "L004")).toBe(false)
  })

  it("severity is high", () => {
    const graphs = [graph("POST", "/orders")]
    expect(runLint(graphs).find(r => r.code === "L004")!.severity).toBe("high")
  })
})

// ── L005 — Enum hint ──────────────────────────────────────────────────────────

describe("L005 — enum field without constraint", () => {
  it("flags field named 'status' with no isIn or enum rule", () => {
    const graphs = [graph("POST", "/orders", {
      dtos: [dto("Dto", [field("status", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L005" && r.field === "status")).toBe(true)
  })

  it("flags fields named role and type too", () => {
    const graphs = [graph("POST", "/users", {
      dtos: [dto("Dto", [field("role", "required"), field("type", "required")])],
    })]
    const fields = runLint(graphs).filter(r => r.code === "L005").map(r => r.field)
    expect(fields).toContain("role")
    expect(fields).toContain("type")
  })

  it("does not flag if field has isIn rule", () => {
    const graphs = [graph("POST", "/orders", {
      dtos: [dto("Dto", [{
        name: "status", type: "string",
        rules: [{ kind: "required" }, { kind: "isIn", value: ["active"] }],
      }])],
    })]
    expect(runLint(graphs).some(r => r.code === "L005")).toBe(false)
  })

  it("does not flag if field has enum rule", () => {
    const graphs = [graph("POST", "/orders", {
      dtos: [dto("Dto", [{
        name: "status", type: "string",
        rules: [{ kind: "required" }, { kind: "enum", value: "StatusEnum" }],
      }])],
    })]
    expect(runLint(graphs).some(r => r.code === "L005")).toBe(false)
  })

  it("severity is info", () => {
    const graphs = [graph("POST", "/orders", {
      dtos: [dto("Dto", [field("status", "required")])],
    })]
    expect(runLint(graphs).find(r => r.code === "L005")!.severity).toBe("info")
  })
})

// ── Multiple issues on same route ─────────────────────────────────────────────

describe("multiple issues", () => {
  it("can report multiple different codes for the same route", () => {
    // POST route: no auth, has DTO but password is weak
    const graphs = [graph("POST", "/auth/register", {
      dtos: [dto("RegisterDto", [field("password", "required")])],
    })]
    const results = runLint(graphs)
    const codes = results.map(r => r.code)
    expect(codes).toContain("L002")  // weak password
    expect(codes).toContain("L003")  // no auth on POST
  })
})
