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

  it("flags field named role", () => {
    const graphs = [graph("POST", "/users", {
      dtos: [dto("Dto", [field("role", "required")])],
    })]
    const fields = runLint(graphs).filter(r => r.code === "L005").map(r => r.field)
    expect(fields).toContain("role")
  })

  it("does not flag field named 'type' (too generic, excluded)", () => {
    const graphs = [graph("POST", "/events", {
      dtos: [dto("Dto", [field("type", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L005" && r.field === "type")).toBe(false)
  })

  it("does not flag field named 'kind' (too generic, excluded)", () => {
    const graphs = [graph("POST", "/items", {
      dtos: [dto("Dto", [field("kind", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L005" && r.field === "kind")).toBe(false)
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

// ── L006 — Missing throttle on auth-sensitive routes ─────────────────────────

describe("L006 — missing throttle on auth route", () => {
  it("flags POST /auth/login with no throttle node", () => {
    const graphs = [graph("POST", "/auth/login")]
    expect(runLint(graphs).some(r => r.code === "L006" && r.route === "POST /auth/login")).toBe(true)
  })

  it("flags routes matching /register, /signin, /password, /token", () => {
    const paths = ["/auth/register", "/auth/signin", "/users/password/reset", "/oauth/token"]
    const graphs = paths.map(p => graph("POST", p))
    const flagged = runLint(graphs).filter(r => r.code === "L006").map(r => r.route)
    expect(flagged).toContain("POST /auth/register")
    expect(flagged).toContain("POST /auth/signin")
    expect(flagged).toContain("POST /users/password/reset")
    expect(flagged).toContain("POST /oauth/token")
  })

  it("does not flag when a throttle node is present", () => {
    const g: EnrichedGraph = {
      ...graph("POST", "/auth/login"),
      nodes: [{ id: "t0", type: "ir:throttle", symbol: "ThrottleGuard" }],
    }
    expect(runLint([g]).some(r => r.code === "L006")).toBe(false)
  })

  it("does not flag when symbol matches throttle pattern", () => {
    const g: EnrichedGraph = {
      ...graph("POST", "/auth/login"),
      nodes: [{ id: "t0", type: "ir:middleware", symbol: "RateLimitGuard" }],
    }
    expect(runLint([g]).some(r => r.code === "L006")).toBe(false)
  })

  it("does not flag non-auth routes", () => {
    const graphs = [graph("POST", "/products"), graph("GET", "/users")]
    expect(runLint(graphs).some(r => r.code === "L006")).toBe(false)
  })

  it("severity is warn", () => {
    const graphs = [graph("POST", "/auth/login")]
    expect(runLint(graphs).find(r => r.code === "L006")!.severity).toBe("warn")
  })
})

// ── L007 — Admin/privileged route without auth ────────────────────────────────

describe("L007 — privileged route without auth", () => {
  it("flags GET /admin/users with no auth gate", () => {
    const graphs = [graph("GET", "/admin/users")]
    expect(runLint(graphs).some(r => r.code === "L007" && r.route === "GET /admin/users")).toBe(true)
  })

  it("flags routes matching /internal, /management, /backoffice, /system", () => {
    const paths = ["/internal/health-check", "/management/users", "/backoffice/orders", "/system/config"]
    const graphs = paths.map(p => graph("GET", p))
    const flagged = runLint(graphs).filter(r => r.code === "L007").map(r => r.route)
    expect(flagged).toContain("GET /internal/health-check")
    expect(flagged).toContain("GET /management/users")
    expect(flagged).toContain("GET /backoffice/orders")
    expect(flagged).toContain("GET /system/config")
  })

  it("does not flag privileged route that has auth gate", () => {
    const graphs = [graph("GET", "/admin/users", { withAuth: true })]
    expect(runLint(graphs).some(r => r.code === "L007")).toBe(false)
  })

  it("does not flag when authz_check node is present", () => {
    const g: EnrichedGraph = {
      ...graph("GET", "/admin/users"),
      nodes: [{ id: "a0", type: "ir:authz_check", symbol: "AdminGuard" }],
    }
    expect(runLint([g]).some(r => r.code === "L007")).toBe(false)
  })

  it("does not flag non-privileged routes regardless of auth", () => {
    const graphs = [graph("GET", "/products"), graph("POST", "/orders")]
    expect(runLint(graphs).some(r => r.code === "L007")).toBe(false)
  })

  it("severity is high", () => {
    const graphs = [graph("GET", "/admin/dashboard")]
    expect(runLint(graphs).find(r => r.code === "L007")!.severity).toBe("high")
  })
})

// ── L008 — Entity leak ───────────────────────────────────────────────────────

describe("L008 — entity returned directly", () => {
  function graphWithEntity(path: string, entitySymbol: string, withTransformer = false): EnrichedGraph {
    const nodes: EnrichedGraph["nodes"] = [
      { id: "e0", type: "ir:entity_return", symbol: entitySymbol },
    ]
    if (withTransformer) {
      nodes.push({ id: "t0", type: "ir:response_transformer", symbol: "UserResponse" })
    }
    return { entrypoint: `GET ${path}`, method: "GET", path, nodes, edges: [], framework: "nestjs", dtos: [] }
  }

  it("flags route that returns entity with no response transformer", () => {
    const graphs = [graphWithEntity("/users/:id", "User")]
    expect(runLint(graphs).some(r => r.code === "L008" && r.route === "GET /users/:id")).toBe(true)
  })

  it("does not flag when response transformer is present", () => {
    const graphs = [graphWithEntity("/users/:id", "User", true)]
    expect(runLint(graphs).some(r => r.code === "L008")).toBe(false)
  })

  it("does not flag when serializer node is present", () => {
    const g: EnrichedGraph = {
      ...graphWithEntity("/users/:id", "User"),
      nodes: [
        { id: "e0", type: "ir:entity_return", symbol: "User" },
        { id: "s0", type: "ir:serializer", symbol: "UserSerializer" },
      ],
    }
    expect(runLint([g]).some(r => r.code === "L008")).toBe(false)
  })

  it("does not flag route with no entity_return node", () => {
    const graphs = [graph("GET", "/users/:id")]
    expect(runLint(graphs).some(r => r.code === "L008")).toBe(false)
  })

  it("message names the entity symbol", () => {
    const graphs = [graphWithEntity("/users/:id", "UserEntity")]
    const r = runLint(graphs).find(r => r.code === "L008")!
    expect(r.message).toContain("UserEntity")
  })

  it("message mentions sensitive field when DTO contains one", () => {
    const g: EnrichedGraph = {
      ...graphWithEntity("/users/:id", "User"),
      dtos: [dto("User", [field("password", "required")])],
    }
    const r = runLint([g]).find(r => r.code === "L008")!
    expect(r.message).toContain("password")
  })

  it("severity is high", () => {
    const graphs = [graphWithEntity("/users/:id", "User")]
    expect(runLint(graphs).find(r => r.code === "L008")!.severity).toBe("high")
  })
})

// ── L009 — Missing pagination ─────────────────────────────────────────────────

describe("L009 — missing pagination on list route", () => {
  it("flags GET list route with no pagination fields or paginator", () => {
    const graphs = [graph("GET", "/users")]
    expect(runLint(graphs).some(r => r.code === "L009" && r.route === "GET /users")).toBe(true)
  })

  it("flags GET /orders with no pagination", () => {
    const graphs = [graph("GET", "/orders")]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(true)
  })

  it("does not flag single-resource route GET /users/:id", () => {
    const graphs = [graph("GET", "/users/:id")]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag single-resource route GET /posts/{id}", () => {
    const graphs = [graph("GET", "/posts/{id}")]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag when DTO has 'limit' field", () => {
    const graphs = [graph("GET", "/users", {
      dtos: [dto("QueryDto", [field("limit", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag when DTO has 'page' field", () => {
    const graphs = [graph("GET", "/users", {
      dtos: [dto("QueryDto", [field("page", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag when DTO has 'cursor' field", () => {
    const graphs = [graph("GET", "/users", {
      dtos: [dto("QueryDto", [field("cursor", "required")])],
    })]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag when ir:paginator node is present", () => {
    const g: EnrichedGraph = {
      ...graph("GET", "/users"),
      nodes: [{ id: "p0", type: "ir:paginator", symbol: "Paginate" }],
    }
    expect(runLint([g]).some(r => r.code === "L009")).toBe(false)
  })

  it("does not flag POST routes", () => {
    const graphs = [graph("POST", "/users")]
    expect(runLint(graphs).some(r => r.code === "L009")).toBe(false)
  })

  it("severity is warn", () => {
    const graphs = [graph("GET", "/users")]
    expect(runLint(graphs).find(r => r.code === "L009")!.severity).toBe("warn")
  })
})

// ── L010 — Circular DTO ───────────────────────────────────────────────────────

describe("L010 — circular DTO reference", () => {
  type AnyType = DTOSchema["fields"][0]["type"]

  function circularGraph(): EnrichedGraph {
    return {
      entrypoint: "GET /feed",
      method:     "GET",
      path:       "/feed",
      nodes:      [],
      edges:      [],
      framework:  "nestjs",
      dtos: [
        {
          className: "UserDto",
          file: "user.dto.ts",
          fields: [{ name: "posts", type: "PostDto" as AnyType, rules: [] }],
        },
        {
          className: "PostDto",
          file: "post.dto.ts",
          fields: [{ name: "author", type: "UserDto" as AnyType, rules: [] }],
        },
      ],
    }
  }

  it("flags circular reference between two DTOs", () => {
    expect(runLint([circularGraph()]).some(r => r.code === "L010")).toBe(true)
  })

  it("message names both DTOs", () => {
    const r = runLint([circularGraph()]).find(r => r.code === "L010")!
    expect(r.message).toContain("UserDto")
    expect(r.message).toContain("PostDto")
  })

  it("does not report the same pair twice", () => {
    const results = runLint([circularGraph()]).filter(r => r.code === "L010")
    expect(results.length).toBe(1)
  })

  it("does not flag DTO that references unknown class", () => {
    const g: EnrichedGraph = {
      entrypoint: "GET /items",
      method: "GET",
      path: "/items",
      nodes: [], edges: [], framework: "nestjs",
      dtos: [{
        className: "ItemDto",
        file: "item.dto.ts",
        fields: [{ name: "category", type: "CategoryDto" as AnyType, rules: [] }],
      }],
    }
    expect(runLint([g]).some(r => r.code === "L010")).toBe(false)
  })

  it("does not flag non-circular reference", () => {
    const g: EnrichedGraph = {
      entrypoint: "GET /items",
      method: "GET",
      path: "/items",
      nodes: [], edges: [], framework: "nestjs",
      dtos: [
        { className: "ItemDto", file: "a.ts", fields: [{ name: "cat",  type: "CatDto" as AnyType, rules: [] }] },
        { className: "CatDto",  file: "b.ts", fields: [{ name: "name", type: "string",             rules: [] }] },
      ],
    }
    expect(runLint([g]).some(r => r.code === "L010")).toBe(false)
  })

  it("severity is info", () => {
    const r = runLint([circularGraph()]).find(r => r.code === "L010")!
    expect(r.severity).toBe("info")
  })
})

// ── Config — rule disable, severity override, ignore ─────────────────────────

describe("config — rule disable", () => {
  it("skips a rule when config sets it to off", () => {
    const graphs = [graph("POST", "/orders")]
    const results = runLint(graphs, { rules: { L004: "off" } })
    expect(results.some(r => r.code === "L004")).toBe(false)
  })

  it("still runs other rules when one is disabled", () => {
    const graphs = [graph("DELETE", "/items")]
    const results = runLint(graphs, { rules: { L004: "off" } })
    expect(results.some(r => r.code === "L003")).toBe(true)
  })
})

describe("config — severity override", () => {
  it("overrides severity to high when config sets rule to error", () => {
    const graphs = [graph("POST", "/orders", { dtos: [dto("Dto", [field("status", "required")])] })]
    const r = runLint(graphs, { rules: { L005: "error" } }).find(r => r.code === "L005")!
    expect(r.severity).toBe("high")
  })

  it("overrides severity to warn when config sets rule to warning", () => {
    const graphs = [graph("POST", "/orders")]
    const r = runLint(graphs, { rules: { L003: "warning" } }).find(r => r.code === "L003")!
    expect(r.severity).toBe("warn")
  })

  it("overrides severity to info when config sets rule to info", () => {
    const graphs = [graph("DELETE", "/items")]
    const r = runLint(graphs, { rules: { L003: "info" } }).find(r => r.code === "L003")!
    expect(r.severity).toBe("info")
  })
})

describe("config — ignore list", () => {
  it("suppresses a result that matches rule + route", () => {
    const graphs = [graph("GET", "/users"), graph("GET", "/orders")]
    const results = runLint(graphs, { ignore: [{ rule: "L009", route: "GET /users" }] })
    expect(results.some(r => r.code === "L009" && r.route === "GET /users")).toBe(false)
    expect(results.some(r => r.code === "L009" && r.route === "GET /orders")).toBe(true)
  })

  it("suppresses all results for a rule when no route specified", () => {
    const graphs = [graph("GET", "/users"), graph("GET", "/orders")]
    const results = runLint(graphs, { ignore: [{ rule: "L009" }] })
    expect(results.some(r => r.code === "L009")).toBe(false)
  })

  it("does not suppress results for other rules", () => {
    const graphs = [graph("DELETE", "/items")]
    const results = runLint(graphs, { ignore: [{ rule: "L009" }] })
    expect(results.some(r => r.code === "L003")).toBe(true)
  })
})

// ── explain — all rules have explain info ─────────────────────────────────────

describe("explain — rules expose why/risk/fix", () => {
  it("all rules have explain info", () => {
    const { ALL_RULES } = require("../runner")
    for (const rule of ALL_RULES) {
      expect(rule.explain).toBeDefined()
      expect(typeof rule.explain.why).toBe("string")
      expect(Array.isArray(rule.explain.risk)).toBe(true)
      expect(typeof rule.explain.fix).toBe("string")
    }
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
    expect(codes).toContain("L006")  // no throttle on auth route
  })
})
