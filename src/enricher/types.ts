// Field-level validation types — sourced from @kidkender/archmind-protocol
export type {
  RuleKind,
  ValidationRule,
  FieldType,
  FieldSchema,
  DTOSchema,
} from "@kidkender/archmind-protocol"

// EnrichedGraph is archtest-specific: an IR graph enriched with resolved DTOSchemas
import type { DTOSchema } from "@kidkender/archmind-protocol"
import type { ExecutionNode, ExecutionEdge } from "@kidkender/archmind-protocol"

export interface EnrichedGraph {
  entrypoint: string
  method:     string
  path:       string
  nodes:      ExecutionNode[]
  edges:      ExecutionEdge[]
  framework?: string
  /** DTOs resolved from ir:validation_gate nodes */
  dtos:       DTOSchema[]
}
