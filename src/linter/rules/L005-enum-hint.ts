import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const ENUM_HINT_NAMES = ["status", "role", "type", "state", "kind", "category", "mode"]

export const L005: LintRule = {
  code: "L005",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      for (const dto of g.dtos) {
        for (const field of dto.fields) {
          if (!ENUM_HINT_NAMES.includes(field.name.toLowerCase())) continue
          const hasEnumConstraint = field.rules.some(
            r => r.kind === "isIn" || r.kind === "enum"
          )
          if (!hasEnumConstraint) {
            results.push({
              severity: "info",
              code:     "L005",
              route:    `${g.method} ${g.path}`,
              field:    field.name,
              message:  `field "${field.name}" looks like an enum but has no IsIn/IsEnum constraint`,
            })
          }
        }
      }
    }
    return results
  },
}
