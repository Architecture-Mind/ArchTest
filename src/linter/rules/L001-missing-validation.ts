import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

export const L001: LintRule = {
  code: "L001",

  explain: {
    why:  "A DTO with no validated fields means any payload passes through without inspection. Class-validator only validates decorated properties.",
    risk: ["Arbitrary data accepted and persisted", "Type coercion vulnerabilities", "Unexpected fields stored in the database"],
    fix:  "Add at least one class-validator decorator (e.g. @IsString(), @IsEmail()) to each field that should be constrained.",
  },

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
