import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  loadConfig,
  isRuleDisabled,
  isResultIgnored,
  applyConfigSeverity,
} from "../index"

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "archtest-config-"))
}

function writeConfig(dir: string, content: object): void {
  writeFileSync(join(dir, "archtest.config.json"), JSON.stringify(content), "utf8")
}

describe("loadConfig", () => {
  let dir: string
  beforeEach(() => { dir = tmpDir() })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it("returns empty object when no config file exists", () => {
    expect(loadConfig(dir)).toEqual({})
  })

  it("loads archtest.config.json at project root", () => {
    writeConfig(dir, { rules: { L009: "off" } })
    const cfg = loadConfig(dir)
    expect(cfg.rules?.["L009"]).toBe("off")
  })

  it("loads from .archtest/config.json as fallback", () => {
    mkdirSync(join(dir, ".archtest"))
    writeFileSync(join(dir, ".archtest", "config.json"), JSON.stringify({ rules: { L010: "off" } }), "utf8")
    const cfg = loadConfig(dir)
    expect(cfg.rules?.["L010"]).toBe("off")
  })

  it("prefers archtest.config.json over .archtest/config.json", () => {
    writeConfig(dir, { rules: { L009: "error" } })
    mkdirSync(join(dir, ".archtest"))
    writeFileSync(join(dir, ".archtest", "config.json"), JSON.stringify({ rules: { L009: "off" } }), "utf8")
    const cfg = loadConfig(dir)
    expect(cfg.rules?.["L009"]).toBe("error")
  })

  it("returns empty object for malformed JSON", () => {
    writeFileSync(join(dir, "archtest.config.json"), "{ bad json", "utf8")
    expect(loadConfig(dir)).toEqual({})
  })
})

describe("isRuleDisabled", () => {
  it("returns true when rule is set to off", () => {
    expect(isRuleDisabled("L009", { rules: { L009: "off" } })).toBe(true)
  })

  it("returns false when rule is set to another severity", () => {
    expect(isRuleDisabled("L009", { rules: { L009: "error" } })).toBe(false)
  })

  it("returns false when rule is not in config", () => {
    expect(isRuleDisabled("L009", {})).toBe(false)
  })

  it("returns false when rules is undefined", () => {
    expect(isRuleDisabled("L009", { ignore: [] })).toBe(false)
  })
})

describe("isResultIgnored", () => {
  it("ignores result matching rule and route", () => {
    const result = { code: "L009", route: "GET /users" }
    expect(isResultIgnored(result, { ignore: [{ rule: "L009", route: "GET /users" }] })).toBe(true)
  })

  it("does not ignore result when route does not match", () => {
    const result = { code: "L009", route: "GET /orders" }
    expect(isResultIgnored(result, { ignore: [{ rule: "L009", route: "GET /users" }] })).toBe(false)
  })

  it("ignores result matching rule only (no route filter)", () => {
    const result = { code: "L009", route: "GET /anything" }
    expect(isResultIgnored(result, { ignore: [{ rule: "L009" }] })).toBe(true)
  })

  it("does not ignore result when rule does not match", () => {
    const result = { code: "L003", route: "GET /users" }
    expect(isResultIgnored(result, { ignore: [{ rule: "L009" }] })).toBe(false)
  })

  it("returns false when ignore list is empty", () => {
    const result = { code: "L009", route: "GET /users" }
    expect(isResultIgnored(result, { ignore: [] })).toBe(false)
  })

  it("returns false when no ignore key in config", () => {
    const result = { code: "L009", route: "GET /users" }
    expect(isResultIgnored(result, {})).toBe(false)
  })
})

describe("applyConfigSeverity", () => {
  it("maps error → high", () => {
    expect(applyConfigSeverity({ code: "L005", severity: "info" }, { rules: { L005: "error" } })).toBe("high")
  })

  it("maps warning → warn", () => {
    expect(applyConfigSeverity({ code: "L003", severity: "high" }, { rules: { L003: "warning" } })).toBe("warn")
  })

  it("maps info → info", () => {
    expect(applyConfigSeverity({ code: "L005", severity: "warn" }, { rules: { L005: "info" } })).toBe("info")
  })

  it("passes through high → high", () => {
    expect(applyConfigSeverity({ code: "L003", severity: "info" }, { rules: { L003: "high" } })).toBe("high")
  })

  it("returns original severity when rule not in config", () => {
    expect(applyConfigSeverity({ code: "L003", severity: "high" }, {})).toBe("high")
  })

  it("returns original severity when rule is off (disabled — should be filtered before this)", () => {
    expect(applyConfigSeverity({ code: "L003", severity: "high" }, { rules: { L003: "off" } })).toBe("high")
  })
})
