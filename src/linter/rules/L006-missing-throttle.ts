import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const AUTH_PATH_RE = /\/(auth|login|signin|register|signup|password|token|forgot|reset)/i
const THROTTLE_RE  = /throttle|rateLimit|rate_limit/i

function hasThrottle(g: EnrichedGraph): boolean {
  return g.nodes.some(n =>
    n.type === "ir:throttle" || THROTTLE_RE.test(n.symbol)
  )
}

export const L006: LintRule = {
  code: "L006",
  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []
    for (const g of graphs) {
      if (!AUTH_PATH_RE.test(g.path)) continue
      if (hasThrottle(g)) continue
      results.push({
        severity: "warn",
        code:     "L006",
        route:    `${g.method} ${g.path}`,
        message:  `auth-sensitive route has no rate-limiting guard`,
      })
    }
    return results
  },
}
