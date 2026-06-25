import { z } from "zod"

// ── Shared sub-schemas (looseObject allows extra fields from future protocol versions) ──

const ExecutionNodeSchema = z.looseObject({
  id:     z.string(),
  type:   z.string(),
  symbol: z.string(),
})

const ExecutionEdgeSchema = z.looseObject({
  from:         z.string(),
  to:           z.string(),
  relation:     z.string(),
  traceability: z.string(),
})

const GraphAnnotationSchema = z.looseObject({
  type:        z.string(),
  description: z.string(),
  nodes:       z.array(z.string()).optional(),
  severity:    z.string().optional(),
  fix:         z.string().optional(),
  confidence:  z.string().optional(),
  evidence:    z.array(z.string()).optional(),
})

const ExecutionGraphSchema = z.looseObject({
  entrypoint:  z.string(),
  method:      z.string(),
  path:        z.string(),
  nodes:       z.array(ExecutionNodeSchema),
  edges:       z.array(ExecutionEdgeSchema),
  annotations: z.array(GraphAnnotationSchema),
})

// ── Top-level output schemas ──────────────────────────────────────────────────

export const TraceJsonOutputSchema = z.object({
  framework:    z.string(),
  routes_found: z.number(),
  graphs:       z.array(ExecutionGraphSchema),
})

const FindingSchema = z.looseObject({
  type:            z.string(),
  severity:        z.string(),
  confidence:      z.string().optional(),
  summary:         z.string().optional(),
  evidence:        z.unknown().optional(),
  recommendations: z.array(z.string()).optional(),
})

export const FindingsJsonOutputSchema = z.array(
  z.object({
    route:   z.string(),
    finding: FindingSchema,
  })
)
