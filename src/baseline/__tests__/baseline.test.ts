import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { saveBaseline, loadBaseline, baselinePath } from "../index"
import type { LintResult } from "../../linter/types"

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "archtest-baseline-"))
}

const SAMPLE_ISSUES: LintResult[] = [
  { severity: "high", code: "L003", route: "POST /users",  message: "no auth guard" },
  { severity: "warn", code: "L002", route: "POST /auth",   message: "weak password", field: "password" },
  { severity: "info", code: "L005", route: "POST /orders", message: "enum hint",     field: "status" },
]

describe("baseline — save and load", () => {
  let dir: string

  beforeEach(() => { dir = tmpDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("saves baseline to default .archtest/lint-baseline.json path", () => {
    const opts  = { projectRoot: dir }
    const saved = saveBaseline(SAMPLE_ISSUES, opts)
    expect(saved).toContain("lint-baseline.json")

    const loaded = loadBaseline(opts)
    expect(loaded).not.toBeNull()
  })

  it("restores all issues exactly", () => {
    const opts = { projectRoot: dir }
    saveBaseline(SAMPLE_ISSUES, opts)
    const loaded = loadBaseline(opts)!
    expect(loaded.issues).toHaveLength(SAMPLE_ISSUES.length)
    expect(loaded.issues[0].code).toBe("L003")
    expect(loaded.issues[1].field).toBe("password")
  })

  it("records capturedAt timestamp", () => {
    const before = Date.now()
    saveBaseline(SAMPLE_ISSUES, { projectRoot: dir })
    const after  = Date.now()
    const loaded = loadBaseline({ projectRoot: dir })!
    const ts = new Date(loaded.capturedAt).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it("saves to custom file path when file option is set", () => {
    const file = join(dir, "my-baseline.json")
    const opts  = { projectRoot: dir, file }
    saveBaseline(SAMPLE_ISSUES, opts)
    const loaded = loadBaseline(opts)
    expect(loaded).not.toBeNull()
    expect(loaded!.issues).toHaveLength(SAMPLE_ISSUES.length)
  })

  it("creates .archtest directory if it does not exist", () => {
    const newDir = join(dir, "nested", "project")
    const opts   = { projectRoot: newDir }
    expect(() => saveBaseline(SAMPLE_ISSUES, opts)).not.toThrow()
    expect(loadBaseline(opts)).not.toBeNull()
  })

  it("returns null when no baseline exists", () => {
    expect(loadBaseline({ projectRoot: dir })).toBeNull()
  })

  it("returns null for malformed JSON", () => {
    const { writeFileSync, mkdirSync } = require("fs")
    const dir2 = tmpDir()
    const p    = join(dir2, ".archtest")
    mkdirSync(p, { recursive: true })
    writeFileSync(join(p, "lint-baseline.json"), "not json", "utf8")
    expect(loadBaseline({ projectRoot: dir2 })).toBeNull()
    rmSync(dir2, { recursive: true, force: true })
  })

  it("baselinePath respects custom file option", () => {
    const customFile = "/tmp/custom.json"
    expect(baselinePath({ projectRoot: dir, file: customFile })).toBe(customFile)
  })
})

describe("baseline — new-only filtering logic", () => {
  it("issue in baseline does not appear in new-only results", () => {
    const baseline = SAMPLE_ISSUES
    const current  = [...SAMPLE_ISSUES, { severity: "high" as const, code: "L007", route: "GET /admin", message: "no auth" }]

    const baselineKeys = new Set(baseline.map(r => `${r.code}|${r.route}|${r.field ?? ""}|${r.message}`))
    const newOnly = current.filter(r => !baselineKeys.has(`${r.code}|${r.route}|${r.field ?? ""}|${r.message}`))

    expect(newOnly).toHaveLength(1)
    expect(newOnly[0].code).toBe("L007")
  })

  it("returns all results when baseline is empty", () => {
    const baselineKeys = new Set<string>()
    const current = SAMPLE_ISSUES
    const newOnly = current.filter(r => !baselineKeys.has(`${r.code}|${r.route}|${r.field ?? ""}|${r.message}`))
    expect(newOnly).toHaveLength(SAMPLE_ISSUES.length)
  })
})
