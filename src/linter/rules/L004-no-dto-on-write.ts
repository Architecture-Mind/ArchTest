import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"])

export const L004: LintRule = {
  code: "L004",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      if (!BODY_METHODS.has(g.method.toUpperCase())) continue
      const hasValidatedDto = g.dtos.some(d => d.fields.length > 0)
      if (!hasValidatedDto) {
        results.push({
          severity: "high",
          code:     "L004",
          route:    `${g.method} ${g.path}`,
          message:  `${g.method} route accepts body but has no DTO validation`,
        })
      }
    }
    return results
  },
}
