import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const PAGINATION_FIELDS = new Set([
  "limit", "offset", "page", "cursor", "per_page", "perpage",
  "take", "skip", "pagesize", "page_size", "after", "before",
])

// Matches routes that clearly address a single resource: /users/:id  /posts/{id}
const SINGLE_RESOURCE_RE = /\/[:{][^/}]+}?$/

function hasPaginationField(g: EnrichedGraph): boolean {
  return g.dtos.some(dto =>
    dto.fields.some(f => PAGINATION_FIELDS.has(f.name.toLowerCase()))
  )
}

export const L009: LintRule = {
  code: "L009",

  explain: {
    why:  "GET route appears to return a collection but has no pagination parameters. A single large table can return millions of rows and exhaust server memory or saturate the network.",
    risk: ["Out-of-memory crash under load", "Unintentional full data dump", "Slow response times for large datasets"],
    fix:  "Add a query DTO with 'limit' / 'offset' (or 'page' / 'cursor') fields and apply them before querying the database.",
  },

  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []

    for (const g of graphs) {
      if (g.method.toUpperCase() !== "GET") continue
      if (SINGLE_RESOURCE_RE.test(g.path))   continue

      const hasPaginator = g.nodes.some(n => n.type === "ir:paginator")
      if (hasPaginator)          continue
      if (hasPaginationField(g)) continue

      results.push({
        severity: "warn",
        code:     "L009",
        route:    `${g.method} ${g.path}`,
        message:  `list route has no pagination — potential large dataset exposure`,
      })
    }

    return results
  },
}
