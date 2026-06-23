import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"
import { parseLaravelRequests } from "./laravel-parser"
import type { DTOSchema, EnrichedGraph } from "./types"
import type { ExecutionGraph } from "../types"

const SKIP_DIRS = new Set(["vendor", "node_modules", ".git", "storage", "bootstrap/cache"])

export interface EnrichOptions {
  projectRoot: string
}

export function enrichGraphs(graphs: ExecutionGraph[], opts: EnrichOptions): EnrichedGraph[] {
  const dtoIndex = buildLaravelDTOIndex(opts.projectRoot)
  return graphs.map(g => enrichGraph(g, dtoIndex))
}

function enrichGraph(graph: ExecutionGraph, dtoIndex: Map<string, DTOSchema>): EnrichedGraph {
  const dtoNames = graph.nodes
    .filter(n => n.type === "ir:validation_gate" && n.symbol)
    .map(n => n.symbol as string)

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

function buildLaravelDTOIndex(projectRoot: string): Map<string, DTOSchema> {
  const index = new Map<string, DTOSchema>()
  const phpFiles = findPhpFiles(projectRoot)

  for (const { abs, rel, content } of phpFiles) {
    if (!content.includes("FormRequest")) continue
    const schemas = parseLaravelRequests(content, rel)
    for (const schema of schemas) {
      index.set(schema.className, schema)
    }
  }

  return index
}

interface PhpFile { abs: string; rel: string; content: string }

function findPhpFiles(projectRoot: string): PhpFile[] {
  const results: PhpFile[] = []
  collect(projectRoot, projectRoot, results)
  return results
}

function collect(dir: string, root: string, out: PhpFile[]): void {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const abs = join(dir, entry)
    try {
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        collect(abs, root, out)
      } else if (entry.endsWith(".php")) {
        const content = readFileSync(abs, "utf-8")
        out.push({ abs, rel: relative(root, abs), content })
      }
    } catch { continue }
  }
}
