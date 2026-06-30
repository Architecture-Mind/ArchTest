import type { EnrichedGraph } from "../enricher/types"

export type LintSeverity = "high" | "warn" | "info"

export interface LintResult {
  severity: LintSeverity
  code:     string
  route:    string
  field?:   string
  message:  string
}

export interface ExplainInfo {
  why:  string
  risk: string[]
  fix:  string
}

export interface LintRule {
  code:     string
  explain?: ExplainInfo
  run(graphs: EnrichedGraph[]): LintResult[]
}
