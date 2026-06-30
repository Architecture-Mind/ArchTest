import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"

const SENSITIVE_FIELDS = ["password", "passwd", "secret", "salt", "refreshtoken", "refresh_token", "privatekey", "private_key", "ssn", "creditcard", "credit_card"]

function hasSensitiveField(g: EnrichedGraph): string | undefined {
  for (const dto of g.dtos) {
    for (const f of dto.fields) {
      if (SENSITIVE_FIELDS.includes(f.name.toLowerCase())) return f.name
    }
  }
  return undefined
}

export const L008: LintRule = {
  code: "L008",

  explain: {
    why:  "Route returns a database entity directly without going through a response DTO. All entity fields — including sensitive ones — are serialized into the HTTP response.",
    risk: ["password / salt / secret fields exposed to client", "Internal flags and metadata leaked", "Bypasses DTO filtering and @Exclude() decorators on the entity"],
    fix:  "Create a dedicated response DTO (e.g. UserResponse) and map the entity to it before returning.",
  },

  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []

    for (const g of graphs) {
      const hasEntityReturn   = g.nodes.some(n => n.type === "ir:entity_return")
      const hasTransformer    = g.nodes.some(n => n.type === "ir:response_transformer" || n.type === "ir:serializer")

      if (!hasEntityReturn || hasTransformer) continue

      const entityNode  = g.nodes.find(n => n.type === "ir:entity_return")
      const entityName  = entityNode?.symbol ?? "entity"
      const sensitiveField = hasSensitiveField(g)

      const detail = sensitiveField
        ? `sensitive field "${sensitiveField}" may leak`
        : "sensitive fields may leak"

      results.push({
        severity: "high",
        code:     "L008",
        route:    `${g.method} ${g.path}`,
        message:  `route returns ${entityName} directly — ${detail}`,
      })
    }

    return results
  },
}
