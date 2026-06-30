import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const PASSWORD_NAMES = ["password", "passwd", "secret"]

export const L002: LintRule = {
  code: "L002",

  explain: {
    why:  "Password / secret fields with no minLength constraint allow empty strings, single characters, or trivially guessable values to pass validation.",
    risk: ["Weak credentials accepted and stored", "Brute-force attacks succeed faster", "Downstream auth bugs if empty password is treated as valid"],
    fix:  "Add @MinLength(8) (or your policy minimum) to the password field.",
  },

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
