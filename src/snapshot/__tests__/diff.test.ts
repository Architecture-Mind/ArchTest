import { diffSnapshots } from "../diff"
import { captureSnapshot } from "../capture"
import type { ContractSnapshot } from "../types"
import type { EnrichedGraph, DTOSchema } from "../../enricher/types"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnapshot(routes: ContractSnapshot["routes"]): ContractSnapshot {
  return { version: "1.0", capturedAt: "2026-01-01T00:00:00.000Z", framework: "nestjs", routes }
}

function makeGraph(
  method: string,
  path: string,
  fields: Array<{ name: string; rules: string[] }> = [],
  withAuth = false
): EnrichedGraph {
  return {
    entrypoint: `${method} ${path}`,
    method,
    path,
    nodes: withAuth
      ? [{ id: "mw_0", type: "ir:auth_gate", symbol: "JwtAuthGuard" }]
      : [],
    edges: [],
    framework: "nestjs",
    dtos: fields.length > 0
      ? [{
          className: "TestDto",
          file: "test.dto.ts",
          fields: fields.map(f => ({
            name: f.name,
            type: "string" as const,
            rules: f.rules.map(r => {
              const [kind, val] = r.split(":")
              return (val !== undefined
                ? { kind, value: isNaN(Number(val)) ? val : Number(val) }
                : { kind }) as DTOSchema["fields"][0]["rules"][0]
            }),
          })),
        }] as DTOSchema[]
      : [] as DTOSchema[],
  }
}

// ── captureSnapshot ───────────────────────────────────────────────────────────

describe("captureSnapshot", () => {
  it("captures routes sorted by method + path", () => {
    const graphs = [
      makeGraph("POST", "/users"),
      makeGraph("GET",  "/users"),
    ]
    const snap = captureSnapshot(graphs, "nestjs")
    expect(snap.routes[0].path).toBe("/users")
    expect(snap.routes[0].method).toBe("GET")
  })

  it("captures auth gate presence", () => {
    const graph = makeGraph("POST", "/users", [], true)
    const snap  = captureSnapshot([graph], "nestjs")
    expect(snap.routes[0].auth.required).toBe(true)
    expect(snap.routes[0].auth.guards).toContain("JwtAuthGuard")
  })

  it("captures field-level validation rules", () => {
    const graph = makeGraph("POST", "/users", [
      { name: "email", rules: ["required", "email"] },
      { name: "age",   rules: ["required", "min:18", "max:100"] },
    ])
    const snap   = captureSnapshot([graph], "nestjs")
    const fields = snap.routes[0].request!.fields
    expect(fields).toHaveLength(2)

    const age = fields.find(f => f.name === "age")!
    const min = age.rules.find(r => r.kind === "min")
    expect(min?.value).toBe(18)
  })
})

// ── diffSnapshots — no change ─────────────────────────────────────────────────

describe("diffSnapshots — identical snapshots", () => {
  it("returns no changes", () => {
    const snap = makeSnapshot([{
      method: "POST", path: "/users",
      topology: [], auth: { required: false, guards: [] },
      request: { dtoClass: "CreateUserDto", fields: [
        { name: "email", type: "string", rules: [{ kind: "required" }, { kind: "email" }] },
      ]},
    }])
    const diff = diffSnapshots(snap, snap)
    expect(diff.hasBreakingChanges).toBe(false)
    expect(diff.addedRoutes).toHaveLength(0)
    expect(diff.removedRoutes).toHaveLength(0)
    expect(diff.changedRoutes).toHaveLength(0)
  })
})

// ── Route-level changes ───────────────────────────────────────────────────────

describe("diffSnapshots — route changes", () => {
  it("detects added route (non-breaking)", () => {
    const base    = makeSnapshot([])
    const current = makeSnapshot([
      { method: "POST", path: "/users", topology: [], auth: { required: false, guards: [] } },
    ])
    const diff = diffSnapshots(base, current)
    expect(diff.addedRoutes).toContain("POST /users")
    expect(diff.hasBreakingChanges).toBe(false)
  })

  it("detects removed route (breaking)", () => {
    const base = makeSnapshot([
      { method: "POST", path: "/users", topology: [], auth: { required: false, guards: [] } },
    ])
    const diff = diffSnapshots(base, makeSnapshot([]))
    expect(diff.removedRoutes).toContain("POST /users")
    expect(diff.hasBreakingChanges).toBe(true)
  })
})

// ── Auth changes ──────────────────────────────────────────────────────────────

describe("diffSnapshots — auth changes", () => {
  const noAuth: ContractSnapshot["routes"][0] = {
    method: "POST", path: "/users", topology: [],
    auth: { required: false, guards: [] },
  }
  const withAuth: ContractSnapshot["routes"][0] = {
    method: "POST", path: "/users", topology: [],
    auth: { required: true, guards: ["JwtAuthGuard"] },
  }

  it("detects auth added (breaking)", () => {
    const diff = diffSnapshots(makeSnapshot([noAuth]), makeSnapshot([withAuth]))
    const route = diff.changedRoutes[0]
    expect(route.breaking).toBe(true)
    const change = route.changes.find(c => c.kind === "auth_added")
    expect(change).toBeDefined()
  })

  it("detects auth removed (breaking)", () => {
    const diff = diffSnapshots(makeSnapshot([withAuth]), makeSnapshot([noAuth]))
    const route = diff.changedRoutes[0]
    expect(route.breaking).toBe(true)
    const change = route.changes.find(c => c.kind === "auth_removed")
    expect(change).toBeDefined()
  })

  it("detects guard_changed when guards differ (non-breaking)", () => {
    const auth1: ContractSnapshot["routes"][0] = {
      method: "POST", path: "/users", topology: [],
      auth: { required: true, guards: ["JwtAuthGuard"] },
    }
    const auth2: ContractSnapshot["routes"][0] = {
      method: "POST", path: "/users", topology: [],
      auth: { required: true, guards: ["RolesGuard"] },
    }
    const diff = diffSnapshots(makeSnapshot([auth1]), makeSnapshot([auth2]))
    const route = diff.changedRoutes[0]
    expect(route.breaking).toBe(false)
    const change = route.changes.find(c => c.kind === "guard_changed")
    expect(change).toBeDefined()
  })
})

// ── Field changes ─────────────────────────────────────────────────────────────

describe("diffSnapshots — field changes", () => {
  type RequestFields = NonNullable<ContractSnapshot["routes"][0]["request"]>["fields"]
  function routeWithFields(fields: RequestFields): ContractSnapshot["routes"][0] {
    return {
      method: "POST", path: "/users", topology: [],
      auth: { required: false, guards: [] },
      request: { dtoClass: "CreateUserDto", fields },
    }
  }

  const emailField = { name: "email", type: "string", rules: [{ kind: "required" }, { kind: "email" }] }
  const ageField   = { name: "age",   type: "number", rules: [{ kind: "required" }, { kind: "min", value: 18 }, { kind: "max", value: 100 }] }

  it("detects removed required field (breaking)", () => {
    const base    = makeSnapshot([routeWithFields([emailField, ageField])])
    const current = makeSnapshot([routeWithFields([emailField])])
    const diff    = diffSnapshots(base, current)
    expect(diff.hasBreakingChanges).toBe(true)
    const change = diff.changedRoutes[0].changes.find(c => c.kind === "field_removed")
    expect((change as { field: string }).field).toBe("age")
  })

  it("detects added required field (breaking)", () => {
    const base    = makeSnapshot([routeWithFields([emailField])])
    const current = makeSnapshot([routeWithFields([emailField, ageField])])
    const diff    = diffSnapshots(base, current)
    expect(diff.hasBreakingChanges).toBe(true)
    const change = diff.changedRoutes[0].changes.find(c => c.kind === "field_added")
    expect(change).toBeDefined()
    expect((change as { breaking: boolean }).breaking).toBe(true)
  })

  it("detects added optional field (non-breaking)", () => {
    const optionalField = { name: "bio", type: "string", rules: [{ kind: "optional" }] }
    const base    = makeSnapshot([routeWithFields([emailField])])
    const current = makeSnapshot([routeWithFields([emailField, optionalField])])
    const diff    = diffSnapshots(base, current)
    expect(diff.hasBreakingChanges).toBe(false)
    const change = diff.changedRoutes[0]?.changes.find(c => c.kind === "field_added")
    expect((change as { breaking: boolean } | undefined)?.breaking).toBe(false)
  })

  it("detects field type changed (breaking)", () => {
    const before = { name: "age", type: "string", rules: [{ kind: "required" }] }
    const after  = { name: "age", type: "number", rules: [{ kind: "required" }] }
    const diff   = diffSnapshots(
      makeSnapshot([routeWithFields([before])]),
      makeSnapshot([routeWithFields([after])])
    )
    expect(diff.hasBreakingChanges).toBe(true)
    const change = diff.changedRoutes[0].changes.find(c => c.kind === "type_changed")
    expect(change).toBeDefined()
  })
})

// ── Rule-level changes ────────────────────────────────────────────────────────

describe("diffSnapshots — rule changes", () => {
  function routeWithAge(minVal: number, maxVal: number): ContractSnapshot["routes"][0] {
    return {
      method: "POST", path: "/users", topology: [],
      auth: { required: false, guards: [] },
      request: {
        dtoClass: "Dto",
        fields: [{ name: "age", type: "number", rules: [
          { kind: "required" },
          { kind: "min", value: minVal },
          { kind: "max", value: maxVal },
        ]}],
      },
    }
  }

  it("detects min increased (breaking) — gte=18 → gte=21", () => {
    const diff = diffSnapshots(
      makeSnapshot([routeWithAge(18, 100)]),
      makeSnapshot([routeWithAge(21, 100)])
    )
    expect(diff.hasBreakingChanges).toBe(true)
    const route  = diff.changedRoutes[0]
    const change = route.changes.find(c => c.kind === "rule_changed" && (c as { rule: string }).rule === "min")
    expect(change).toBeDefined()
    expect((change as { breaking: boolean }).breaking).toBe(true)
    expect((change as { before: number }).before).toBe(18)
    expect((change as { after: number }).after).toBe(21)
  })

  it("detects min decreased (non-breaking) — gte=21 → gte=18", () => {
    const diff = diffSnapshots(
      makeSnapshot([routeWithAge(21, 100)]),
      makeSnapshot([routeWithAge(18, 100)])
    )
    const route  = diff.changedRoutes[0]
    const change = route.changes.find(c => c.kind === "rule_changed" && (c as { rule: string }).rule === "min")
    expect((change as { breaking: boolean }).breaking).toBe(false)
    expect(diff.hasBreakingChanges).toBe(false)
  })

  it("detects max decreased (breaking) — max=100 → max=50", () => {
    const diff = diffSnapshots(
      makeSnapshot([routeWithAge(18, 100)]),
      makeSnapshot([routeWithAge(18, 50)])
    )
    expect(diff.hasBreakingChanges).toBe(true)
    const change = diff.changedRoutes[0].changes.find(
      c => c.kind === "rule_changed" && (c as { rule: string }).rule === "max"
    )
    expect((change as { breaking: boolean }).breaking).toBe(true)
  })

  it("detects max increased (non-breaking) — max=50 → max=100", () => {
    const diff = diffSnapshots(
      makeSnapshot([routeWithAge(18, 50)]),
      makeSnapshot([routeWithAge(18, 100)])
    )
    const change = diff.changedRoutes[0]?.changes.find(
      c => c.kind === "rule_changed" && (c as { rule: string }).rule === "max"
    )
    expect((change as { breaking: boolean } | undefined)?.breaking).toBe(false)
    expect(diff.hasBreakingChanges).toBe(false)
  })

  it("detects rule added — adding email constraint is breaking", () => {
    type RequestFields = NonNullable<ContractSnapshot["routes"][0]["request"]>["fields"]
    function routeWithFields(fields: RequestFields): ContractSnapshot["routes"][0] {
      return {
        method: "POST", path: "/users", topology: [],
        auth: { required: false, guards: [] },
        request: { dtoClass: "Dto", fields },
      }
    }
    const base    = makeSnapshot([routeWithFields([{ name: "email", type: "string", rules: [{ kind: "required" }] }])])
    const current = makeSnapshot([routeWithFields([{ name: "email", type: "string", rules: [{ kind: "required" }, { kind: "email" }] }])])
    const diff = diffSnapshots(base, current)
    const change = diff.changedRoutes[0]?.changes.find(
      c => c.kind === "rule_changed" && (c as { rule: string }).rule === "email"
    )
    expect(change).toBeDefined()
    expect((change as { breaking: boolean }).breaking).toBe(true)
  })

  it("detects rule removed — removing min constraint is non-breaking", () => {
    type RequestFields = NonNullable<ContractSnapshot["routes"][0]["request"]>["fields"]
    function routeWithFields(fields: RequestFields): ContractSnapshot["routes"][0] {
      return {
        method: "POST", path: "/users", topology: [],
        auth: { required: false, guards: [] },
        request: { dtoClass: "Dto", fields },
      }
    }
    const base    = makeSnapshot([routeWithFields([{ name: "age", type: "number", rules: [{ kind: "required" }, { kind: "min", value: 18 }] }])])
    const current = makeSnapshot([routeWithFields([{ name: "age", type: "number", rules: [{ kind: "required" }] }])])
    const diff = diffSnapshots(base, current)
    const change = diff.changedRoutes[0]?.changes.find(
      c => c.kind === "rule_changed" && (c as { rule: string }).rule === "min"
    )
    expect(change).toBeDefined()
    expect((change as { breaking: boolean }).breaking).toBe(false)
    expect(diff.hasBreakingChanges).toBe(false)
  })

  it("treats optional→required change as breaking (adding required rule)", () => {
    type RequestFields = NonNullable<ContractSnapshot["routes"][0]["request"]>["fields"]
    function routeWithFields(fields: RequestFields): ContractSnapshot["routes"][0] {
      return {
        method: "POST", path: "/users", topology: [],
        auth: { required: false, guards: [] },
        request: { dtoClass: "Dto", fields },
      }
    }
    // Field was optional, now required — breaking because existing clients may not send it
    const base    = makeSnapshot([routeWithFields([{ name: "tag", type: "string", rules: [{ kind: "optional" }] }])])
    const current = makeSnapshot([routeWithFields([{ name: "tag", type: "string", rules: [{ kind: "required" }] }])])
    const diff = diffSnapshots(base, current)
    const change = diff.changedRoutes[0]?.changes.find(
      c => c.kind === "rule_changed" && (c as { rule: string }).rule === "required"
    )
    expect(change).toBeDefined()
    expect((change as { breaking: boolean }).breaking).toBe(true)
    expect(diff.hasBreakingChanges).toBe(true)
  })
})
