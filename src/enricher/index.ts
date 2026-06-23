import type { ExecutionGraph } from "../types"
import type { EnrichedGraph } from "./types"
import { enrichGraphs as nestjsEnrich } from "./nestjs-enricher"
import { enrichGraphs as laravelEnrich } from "./laravel-enricher"

export interface EnrichOptions {
  projectRoot: string
  framework?: string
}

export function enrichGraphs(graphs: ExecutionGraph[], opts: EnrichOptions): EnrichedGraph[] {
  if (opts.framework === "laravel") {
    return laravelEnrich(graphs, { projectRoot: opts.projectRoot })
  }
  return nestjsEnrich(graphs, { projectRoot: opts.projectRoot })
}
