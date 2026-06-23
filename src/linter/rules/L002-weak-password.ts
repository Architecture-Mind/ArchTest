import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const PASSWORD_NAMES = ["password", "passwd", "secret"]

export const L002: LintRule = {
  code: "L002",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      for (const dto of g.dtos) {
        for (const field of dto.fields) {
          if (!PASSWORD_NAMES.includes(field.name.toLowerCase())) continue
          const hasMinLength = field.rules.some(r => r.kind === "minLength")
          if (!hasMinLength) {
            results.push({
              severity: "warn",
              code:     "L002",
              route:    `${g.method} ${g.path}`,
              field:    field.name,
              message:  `field "${field.name}" has no minLength constraint`,
            })
          }
        }
      }
    }
    return results
  },
}
