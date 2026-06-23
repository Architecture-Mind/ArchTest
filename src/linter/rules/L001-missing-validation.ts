import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

export const L001: LintRule = {
  code: "L001",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      for (const dto of g.dtos) {
        if (dto.fields.length === 0) {
          results.push({
            severity: "warn",
            code:     "L001",
            route:    `${g.method} ${g.path}`,
            message:  `DTO ${dto.className} has no validated fields`,
          })
        }
      }
    }
    return results
  },
}
