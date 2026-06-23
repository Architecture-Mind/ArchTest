import type { EnrichedGraph } from "../enricher/types"

export type LintSeverity = "high" | "warn" | "info"

export interface LintResult {
  severity: LintSeverity
  code:     string   // "L001"
  route:    string   // "POST /users"
  field?:   string   // undefined for route-level issues
  message:  string
}

export interface LintRule {
  code: string
  run(graphs: EnrichedGraph[]): LintResult[]
}
