import { readFileSync, existsSync } from "fs"
import { resolve, join } from "path"
import type { LintSeverity } from "../linter/types"

export type RuleSeverityConfig = LintSeverity | "error" | "warning" | "off"

export interface IgnoreEntry {
  rule:   string
  route?: string
}

export interface ArchtestConfig {
  rules?:  Record<string, RuleSeverityConfig>
  ignore?: IgnoreEntry[]
}

const CONFIG_FILES = ["archtest.config.json", ".archtest/config.json"]

export function loadConfig(projectRoot: string): ArchtestConfig {
  for (const name of CONFIG_FILES) {
    const p = join(resolve(projectRoot), name)
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as ArchtestConfig
      } catch {
        // malformed config — ignore
      }
    }
  }
  return {}
}

export function isRuleDisabled(code: string, config: ArchtestConfig): boolean {
  return config.rules?.[code] === "off"
}

export function isResultIgnored(result: { code: string; route: string }, config: ArchtestConfig): boolean {
  if (!config.ignore) return false
  return config.ignore.some(entry => {
    if (entry.rule !== result.code) return false
    if (entry.route && entry.route !== result.route) return false
    return true
  })
}

export function applyConfigSeverity(
  result: { code: string; severity: LintSeverity },
  config: ArchtestConfig
): LintSeverity {
  const override = config.rules?.[result.code]
  if (!override || override === "off") return result.severity
  if (override === "error") return "high"
  if (override === "warning") return "warn"
  if (override === "high" || override === "warn" || override === "info") return override
  return result.severity
}
