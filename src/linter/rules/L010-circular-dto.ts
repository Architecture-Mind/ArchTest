import type { LintRule, LintResult } from "../types"
import type { EnrichedGraph } from "../../enricher/types"
import type { DTOSchema } from "../../enricher/types"

export const L010: LintRule = {
  code: "L010",

  explain: {
    why:  "Two DTOs reference each other in their field types, creating a circular dependency. When the serializer traverses these objects it enters an infinite loop.",
    risk: ["Stack overflow / process crash during serialization", "Infinite loop in class-transformer or JSON.stringify", "Non-obvious at compile time — only manifests at runtime"],
    fix:  "Break the cycle by using a flat response DTO for one side, or annotate one field with @Exclude() / use a depth limiter in the serializer.",
  },

  run(graphs: EnrichedGraph[]): LintResult[] {
    const results: LintResult[] = []

    // Collect all DTOs across all routes, deduplicated by class name
    const dtoMap = new Map<string, DTOSchema>()
    for (const g of graphs) {
      for (const dto of g.dtos) {
        if (!dtoMap.has(dto.className)) dtoMap.set(dto.className, dto)
      }
    }

    const reported = new Set<string>()

    for (const [nameA, dtoA] of dtoMap) {
      for (const fieldA of dtoA.fields) {
        const nameB = fieldA.type
        const dtoB  = dtoMap.get(nameB)
        if (!dtoB) continue

        // Check if B references back to A
        const backRef = dtoB.fields.find(f => f.type === nameA)
        if (!backRef) continue

        const key = [nameA, nameB].sort().join("<->")
        if (reported.has(key)) continue
        reported.add(key)

        // Find which routes involve these DTOs to produce useful route labels
        const affectedRoutes = graphs
          .filter(g => g.dtos.some(d => d.className === nameA || d.className === nameB))
          .map(g => `${g.method} ${g.path}`)

        const route = affectedRoutes[0] ?? `${nameA} / ${nameB}`

        results.push({
          severity: "info",
          code:     "L010",
          route,
          message:  `circular DTO reference: ${nameA}.${fieldA.name} ↔ ${nameB}.${backRef.name} — may cause infinite serialization`,
        })
      }
    }

    return results
  },
}
