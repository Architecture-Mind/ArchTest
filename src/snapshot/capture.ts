import type { EnrichedGraph } from "../enricher/types"
import type {
  ContractSnapshot,
  RouteContract,
  AuthContract,
  RequestContract,
  FieldContract,
  RuleContract,
} from "./types"

const AUTH_NODE_TYPES = new Set(["ir:auth_gate", "ir:authz_check"])

/**
 * Converts EnrichedGraph[] into a ContractSnapshot.
 * This is the "source of truth" representation saved to disk.
 */
export function captureSnapshot(
  graphs: EnrichedGraph[],
  framework: string
): ContractSnapshot {
  const routes: RouteContract[] = graphs
    .map(captureRoute)
    .sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`))

  return {
    version:    "1.0",
    capturedAt: new Date().toISOString(),
    framework,
    routes,
  }
}

function captureRoute(graph: EnrichedGraph): RouteContract {
  const authNodes = graph.nodes.filter(n => AUTH_NODE_TYPES.has(n.type))

  const auth: AuthContract = {
    required: authNodes.length > 0,
    guards:   authNodes.map(n => n.symbol).filter(Boolean),
  }

  const topology = [...new Set(graph.nodes.map(n => n.type))].sort()

  const route: RouteContract = {
    method: graph.method,
    path:   graph.path,
    topology,
    auth,
  }

  // Attach first DTO found (one DTO per route in MVP)
  if (graph.dtos.length > 0) {
    const dto = graph.dtos[0]
    const fields: FieldContract[] = dto.fields.map(f => ({
      name:  f.name,
      type:  f.type,
      rules: f.rules.map((r): RuleContract => ({
        kind:  r.kind,
        ...(r.value !== undefined && { value: r.value }),
      })),
    }))

    const request: RequestContract = { dtoClass: dto.className, fields }
    route.request = request
  }

  return route
}
