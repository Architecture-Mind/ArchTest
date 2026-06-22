// IR types mirrored from @archmind/protocol — no hard dependency needed
export interface ExecutionNode {
  id: string
  type: string
  symbol: string
  file?: string
  args?: string[]
  role?: string
  detail?: string
}

export interface ExecutionEdge {
  from: string
  to: string
  relation: string
  traceability: string
  mechanism?: string
}

export interface ExecutionGraph {
  entrypoint: string
  method: string
  path: string
  nodes: ExecutionNode[]
  edges: ExecutionEdge[]
  framework?: string
  ir_ver?: string
}

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
  graphs: ExecutionGraph[]
}

// Output shape of `archmind findings --json`
export type FindingsJsonOutput = RouteFinding[]

export type Framework = "laravel" | "nestjs" | "unknown"
