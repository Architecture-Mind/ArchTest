import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const PRIVILEGED_PATH_RE = /\/(admin|internal|management|backoffice|back-office|system|superuser)/i

function hasAuthGate(g: EnrichedGraph): boolean {
  return g.nodes.some(n => n.type === "ir:auth_gate" || n.type === "ir:authz_check")
}

export const L007: LintRule = {
  code: "L007",

  explain: {
    why:  "Routes under privileged paths (/admin, /internal, /management, etc.) have no auth guard. Any unauthenticated caller can reach administrative functionality.",
    risk: ["Full admin access without credentials", "User data exposure", "Destructive operations available to public"],
    fix:  "Add @UseGuards(JwtAuthGuard, RolesGuard) and @Roles('admin') to the controller or route.",
  },

  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      if (!PRIVILEGED_PATH_RE.test(g.path)) continue
      if (hasAuthGate(g)) continue
      results.push({
        severity: "high",
        code:     "L007",
        route:    `${g.method} ${g.path}`,
        message:  `privileged route has no auth gate`,
      })
    }
    return results
  },
}
