import { findTsFiles, buildClassIndex } from "./file-finder"
import { parseDTOFile } from "./dto-parser"
import type { DTOSchema, EnrichedGraph } from "./types"
import type { ExecutionGraph } from "../types"

const VALIDATION_GATE_TYPE = "ir:validation_gate"

export interface EnrichOptions {
  projectRoot: string
}

/**
 * Takes raw graphs from archmind and enriches each one with DTO field-level schemas
 * by scanning the project's TypeScript source files for class-validator annotations.
 */
export function enrichGraphs(graphs: ExecutionGraph[], opts: EnrichOptions): EnrichedGraph[] {
  const dtoIndex = buildDTOIndex(opts.projectRoot)
  return graphs.map(g => enrichGraph(g, dtoIndex))
}

function enrichGraph(graph: ExecutionGraph, dtoIndex: Map<string, DTOSchema>): EnrichedGraph {
  const dtoNames = extractDTONames(graph)
  const dtos = dtoNames
    .map(name => dtoIndex.get(name))
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

/** Finds all DTO class names referenced by ir:validation_gate nodes in a graph. */
function extractDTONames(graph: ExecutionGraph): string[] {
  return graph.nodes
    .filter(n => n.type === VALIDATION_GATE_TYPE && n.symbol)
    .map(n => n.symbol)
}

/** Scans the project once and builds a className → DTOSchema index. */
function buildDTOIndex(projectRoot: string): Map<string, DTOSchema> {
  const files  = findTsFiles(projectRoot)
  const classIndex = buildClassIndex(files)
  const dtoIndex   = new Map<string, DTOSchema>()

  for (const [className, file] of classIndex) {
    // Only parse files that look like DTOs — skip controllers, modules, guards, etc.
    if (!looksLikeDTO(file.content, className)) continue

    const schemas = parseDTOFile(file.content, file.rel)
    for (const schema of schemas) {
      dtoIndex.set(schema.className, schema)
    }
  }

  return dtoIndex
}

/**
 * Heuristic: a file likely contains a DTO if it imports from class-validator
 * or has class-validator decorators in use.
 */
function looksLikeDTO(content: string, _className: string): boolean {
  return (
    content.includes("class-validator") ||
    content.includes("@IsNotEmpty") ||
    content.includes("@IsString") ||
    content.includes("@IsEmail") ||
    content.includes("@IsInt") ||
    content.includes("@IsNumber") ||
    content.includes("@IsBoolean") ||
    content.includes("@Min(") ||
    content.includes("@Max(") ||
    content.includes("@MinLength") ||
    content.includes("@MaxLength") ||
    content.includes("@IsOptional") ||
    content.includes("@IsEnum") ||
    content.includes("@IsIn(") ||
    content.includes("@Length(") ||
    content.includes("@IsDate") ||
    content.includes("@IsPhoneNumber") ||
    content.includes("@IsEthereumAddress") ||
    content.includes("@IsAlphanumeric") ||
    content.includes("@IsNumberString") ||
    content.includes("@ArrayNotEmpty") ||
    content.includes("@IsUUID") ||
    content.includes("@IsUrl") ||
    content.includes("@Matches(")
  )
}
