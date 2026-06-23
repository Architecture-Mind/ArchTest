// Core IR types — sourced from @kidkender/archmind-protocol
// Re-exported with archtest-local aliases for backward compatibility.
export type {
  ExecutionNode,
  ExecutionEdge,
} from "@kidkender/archmind-protocol"

// Protocol uses IntermediateExecutionGraph; archtest calls it ExecutionGraph
export type { IntermediateExecutionGraph as ExecutionGraph } from "@kidkender/archmind-protocol"

// ── Archtest-specific types (not in protocol) ─────────────────────────────────

export interface Finding {
  type: string
  severity: string
  confidence?: string
  summary?: string
  evidence?: unknown
  recommendations?: string[]
}

export interface RouteFinding {
  route: string
  finding: Finding
}

// Output shape of `archmind trace --json`
export interface TraceJsonOutput {
  framework: string
  routes_found: number
  graphs: import("@kidkender/archmind-protocol").IntermediateExecutionGraph[]
}

// Output shape of `archmind findings --json`
export type FindingsJsonOutput = RouteFinding[]

export type Framework = "laravel" | "nestjs" | "unknown"
