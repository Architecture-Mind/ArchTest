export type RuleKind =
  | "required"
  | "optional"
  | "email"
  | "url"
  | "uuid"
  | "min"
  | "max"
  | "minLength"
  | "maxLength"
  | "integer"
  | "positive"
  | "negative"
  | "boolean"
  | "array"
  | "arrayMinSize"
  | "arrayMaxSize"
  | "enum"
  | "regex"

export interface ValidationRule {
  kind: RuleKind
  value?: number | string | string[]
}

export type FieldType = "string" | "number" | "boolean" | "object" | "array" | "unknown"

export interface FieldSchema {
  name: string
  type: FieldType
  rules: ValidationRule[]
}

export interface DTOSchema {
  className: string
  /** Relative path to the source file inside the scanned project */
  file: string
  fields: FieldSchema[]
}

export interface EnrichedGraph {
  entrypoint: string
  method: string
  path: string
  nodes: import("../types").ExecutionNode[]
  edges: import("../types").ExecutionEdge[]
  framework?: string
  /** DTOs bound to this route's validation_gate nodes */
  dtos: DTOSchema[]
}
