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

  explain: {
    why:  "Auth-sensitive routes (login, register, password reset) without rate limiting are vulnerable to brute-force and credential-stuffing attacks.",
    risk: ["Brute-force of user passwords at high RPS", "Account enumeration via timing differences", "OTP / token bypass by rapid guessing"],
    fix:  "Add @Throttle({ limit: 5, ttl: 60 }) to the route or controller (NestJS throttler), or configure rate limiting in your API gateway.",
  },

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
