import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export const L003: LintRule = {
  code: "L003",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      if (!WRITE_METHODS.has(g.method.toUpperCase())) continue
      const hasAuth = g.nodes.some(n => n.type === "ir:auth_gate")
      if (!hasAuth) {
        results.push({
          severity: "high",
          code:     "L003",
          route:    `${g.method} ${g.path}`,
          message:  `${g.method} route has no auth guard`,
        })
      }
    }
    return results
  },
}
