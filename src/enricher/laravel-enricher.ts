import { parseFormRequests } from "@kidkender/archmind-laravel-parser"
import type { DTOSchema, EnrichedGraph } from "./types"
import type { ExecutionGraph } from "../types"

export interface EnrichOptions {
  projectRoot: string
}

export function enrichGraphs(graphs: ExecutionGraph[], opts: EnrichOptions): EnrichedGraph[] {
  const { index } = parseFormRequests(opts.projectRoot)
  return graphs.map(g => enrichGraph(g, index))
}

function enrichGraph(graph: ExecutionGraph, dtoIndex: Map<string, DTOSchema>): EnrichedGraph {
  const dtos = graph.nodes
    .filter(n => n.type === "ir:validation_gate" && n.symbol)
    .map(n => dtoIndex.get(n.symbol))
    .filter((d): d is DTOSchema => d !== undefined)

  return {
    entrypoint: graph.entrypoint,
    method:     graph.method,
    path:       graph.path,
    nodes:      graph.nodes,
    edges:      graph.edges,
    framework:  graph.framework,
    dtos,
  }
}
