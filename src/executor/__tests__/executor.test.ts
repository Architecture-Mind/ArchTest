import { createServer } from "http"
import type { Server } from "http"
import { executeOne } from "../http-executor"
import { runAll } from "../runner"
import type { TestCase } from "../../generator/types"

// ── Mini HTTP server for testing ─────────────────────────────────────────────

let server: Server
let baseUrl: string

beforeAll(done => {
  server = createServer((req, res) => {
    let body = ""
    req.on("data", chunk => { body += chunk })
    req.on("end", () => {
      const url    = req.url ?? "/"
      const method = req.method ?? "GET"
      const auth   = req.headers["authorization"]

      // POST /users — validate JSON body
      if (method === "POST" && url === "/users") {
        if (!auth) {
          res.writeHead(401).end(JSON.stringify({ message: "Unauthorized" }))
          return
        }
        try {
          const payload = JSON.parse(body || "{}")
          if (!payload.email || !payload.name) {
            res.writeHead(400).end(JSON.stringify({ message: "Validation failed" }))
            return
          }
          res.writeHead(201).end(JSON.stringify({ id: 1, ...payload }))
        } catch {
          res.writeHead(400).end(JSON.stringify({ message: "Invalid JSON" }))
        }
        return
      }

      // GET /users — public
      if (method === "GET" && url === "/users") {
        res.writeHead(200).end(JSON.stringify([]))
        return
      }

      // Catch-all
      res.writeHead(404).end(JSON.stringify({ message: "Not found" }))
    })
  })

  server.listen(0, "127.0.0.1", () => {
    const addr = server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${addr.port}`
    done()
  })
})

afterAll(done => { server.close(done) })

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCase(overrides: Partial<TestCase>): TestCase {
  return {
    id:             "test-1",
    route:          "POST /users",
    method:         "POST",
    path:           "/users",
    category:       "happy_path",
    description:    "valid request",
    payload:        { email: "a@b.com", name: "Alice" },
    headers:        { Authorization: "Bearer token123" },
    expectedStatus: 201,
    ...overrides,
  }
}

// ── executeOne ────────────────────────────────────────────────────────────────

describe("executeOne", () => {
  it("returns pass when status matches expected", async () => {
    const result = await executeOne(makeCase({}), { baseUrl, timeoutMs: 3000 })
    expect(result.status).toBe("pass")
    expect(result.actualStatus).toBe(201)
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it("returns fail when status doesn't match expected", async () => {
    const result = await executeOne(
      makeCase({ expectedStatus: 200 }),  // server returns 201
      { baseUrl, timeoutMs: 3000 }
    )
    expect(result.status).toBe("fail")
    expect(result.error).toContain("expected 200, got 201")
  })

  it("returns pass for 400 when payload is invalid", async () => {
    const result = await executeOne(
      makeCase({ payload: { email: "bad" }, expectedStatus: 400 }),
      { baseUrl, timeoutMs: 3000 }
    )
    expect(result.status).toBe("pass")
    expect(result.actualStatus).toBe(400)
  })

  it("returns pass for 401 when no auth token", async () => {
    const result = await executeOne(
      makeCase({ headers: {}, expectedStatus: 401 }),
      { baseUrl, timeoutMs: 3000 }
    )
    expect(result.status).toBe("pass")
    expect(result.actualStatus).toBe(401)
  })

  it("captures response body", async () => {
    const result = await executeOne(makeCase({}), { baseUrl, timeoutMs: 3000 })
    expect(result.actualBody).not.toBeNull()
    expect((result.actualBody as Record<string, unknown>)["email"]).toBe("a@b.com")
  })

  it("returns error on timeout", async () => {
    const result = await executeOne(
      makeCase({}),
      { baseUrl, timeoutMs: 1 }  // 1ms — guaranteed to timeout
    )
    expect(result.status).toBe("error")
    expect(result.error).toContain("timeout")
  })

  it("returns error when server is unreachable", async () => {
    const result = await executeOne(
      makeCase({}),
      { baseUrl: "http://127.0.0.1:1", timeoutMs: 3000 }
    )
    expect(result.status).toBe("error")
    expect(result.actualStatus).toBeNull()
  })

  it("works for GET request without body", async () => {
    const result = await executeOne(
      makeCase({ method: "GET", path: "/users", payload: undefined, expectedStatus: 200 }),
      { baseUrl, timeoutMs: 3000 }
    )
    expect(result.status).toBe("pass")
    expect(result.actualStatus).toBe(200)
  })
})

// ── runAll ────────────────────────────────────────────────────────────────────

describe("runAll", () => {
  const cases: TestCase[] = [
    makeCase({ id: "1" }),
    makeCase({ id: "2", payload: { email: "bad" }, expectedStatus: 400 }),
    makeCase({ id: "3", headers: {}, expectedStatus: 401 }),
  ]

  it("returns correct summary counts", async () => {
    const summary = await runAll(cases, { baseUrl, timeoutMs: 3000, concurrency: 2 })
    expect(summary.total).toBe(3)
    expect(summary.passed).toBe(3)
    expect(summary.failed).toBe(0)
    expect(summary.errors).toBe(0)
  })

  it("summary contains all results", async () => {
    const summary = await runAll(cases, { baseUrl, timeoutMs: 3000 })
    expect(summary.results).toHaveLength(3)
  })

  it("calls onProgress for each test", async () => {
    const calls: number[] = []
    await runAll(cases, { baseUrl, timeoutMs: 3000 }, (_r, index) => {
      calls.push(index)
    })
    expect(calls).toHaveLength(3)
    expect(calls).toContain(1)
    expect(calls).toContain(2)
    expect(calls).toContain(3)
  })

  it("records durationMs on summary", async () => {
    const summary = await runAll(cases, { baseUrl, timeoutMs: 3000 })
    expect(summary.durationMs).toBeGreaterThan(0)
  })

  it("handles empty test list", async () => {
    const summary = await runAll([], { baseUrl, timeoutMs: 3000 })
    expect(summary.total).toBe(0)
    expect(summary.passed).toBe(0)
  })
})
