import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { resolve, join } from "path"
import type { LintResult } from "../linter/types"

export interface LintBaseline {
  capturedAt: string
  issues:     LintResult[]
}

export interface BaselineOptions {
  projectRoot: string
  file?:       string
}

export function baselinePath(opts: BaselineOptions): string {
  if (opts.file) return resolve(opts.file)
  return join(resolve(opts.projectRoot), ".archtest", "lint-baseline.json")
}

export function saveBaseline(issues: LintResult[], opts: BaselineOptions): string {
  const path = baselinePath(opts)
  const dir  = path.substring(0, path.lastIndexOf("/"))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const baseline: LintBaseline = {
    capturedAt: new Date().toISOString(),
    issues,
  }
  writeFileSync(path, JSON.stringify(baseline, null, 2), "utf8")
  return path
}

export function loadBaseline(opts: BaselineOptions): LintBaseline | null {
  const path = baselinePath(opts)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LintBaseline
  } catch {
    return null
  }
}
