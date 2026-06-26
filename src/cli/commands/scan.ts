import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"

export async function runScan(flags: Record<string, string>): Promise<void> {
  const projectRoot      = requireProject(flags)
  const bin              = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const frameworkOverride = flags["framework"]

  console.log(`Scanning: ${projectRoot}`)

  let result
  try {
    result = await scanProject({ projectRoot: resolve(projectRoot), bin, framework: frameworkOverride })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { framework, graphs, findings } = result

  if ("json" in flags) {
    console.log(JSON.stringify(
      { framework, routes_found: graphs.length, findings_found: findings.length, graphs, findings },
      null,
      2
    ))
    return
  }

  console.log(`Framework : ${framework}`)
  console.log(`Routes    : ${graphs.length}`)
  console.log(`Findings  : ${findings.length}`)
  console.log()

  if (graphs.length === 0) {
    console.log("No routes found. Make sure --project points to the project root.")
    return
  }

  console.log("Routes discovered:")
  for (const g of graphs) {
    console.log(`  ${g.method.padEnd(7)} ${g.path.padEnd(45)} (${g.nodes.length} nodes)`)
  }

  if (findings.length > 0) {
    console.log()
    console.log(`Security findings (${findings.length}):`)
    for (const { route, finding } of findings) {
      const sev = finding.severity.toUpperCase().padEnd(8)
      console.log(`  [${sev}] ${route} — ${finding.type}`)
    }
  }
}

function requireProject(flags: Record<string, string>): string {
  const p = flags["project"]
  if (!p) {
    console.error("Error: --project <path> is required")
    process.exit(2)
  }
  return p
}
