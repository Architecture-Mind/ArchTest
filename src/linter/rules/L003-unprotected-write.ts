import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

export const L003: LintRule = {
  code: "L003",

  explain: {
    why:  "A write route (POST/PUT/PATCH/DELETE) with no auth guard is accessible to unauthenticated users. Any caller can mutate or delete data.",
    risk: ["Unauthenticated data mutation", "Mass deletion / data corruption", "IDOR if resource IDs are guessable"],
    fix:  "Add @UseGuards(JwtAuthGuard) (or equivalent) above the route or controller.",
  },

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
