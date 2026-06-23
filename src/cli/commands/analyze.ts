import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { generateAllTestCases } from "../../generator/index"
import type { EnrichedGraph } from "../../enricher/types"
import type { TestCase } from "../../generator/types"

const SEVERITY_COLOR: Record<string, string> = {
  critical: "\x1b[31m",
  high:     "\x1b[31m",
  medium:   "\x1b[33m",
  low:      "\x1b[36m",
  info:     "\x1b[90m",
}
const RESET = "\x1b[0m"
const DIM   = "\x1b[90m"
const BOLD  = "\x1b[1m"

export async function runAnalyze(flags: Record<string, string>): Promise<void> {
  const projectRoot = requireProject(flags)
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const isJson      = "json" in flags
  const routeFilter = flags["route"]

  if (!isJson) console.log(`Scanning: ${resolve(projectRoot)}\n`)

  // ── 1. Scan ─────────────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: resolve(projectRoot), bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { framework, graphs, findings } = scanResult

  // ── 2. Enrich ────────────────────────────────────────────────────────────────
  let enriched = enrichGraphs(graphs, { projectRoot: resolve(projectRoot), framework })

  if (routeFilter) {
    const needle = routeFilter.toLowerCase()
    enriched = enriched.filter(g =>
      `${g.method} ${g.path}`.toLowerCase().includes(needle) ||
      g.path.toLowerCase().includes(needle)
    )
  }

  // ── 3. Generate ──────────────────────────────────────────────────────────────
  const allCases = generateAllTestCases(enriched)

  // ── 4. Output ────────────────────────────────────────────────────────────────
  if (isJson) {
    const output = {
      framework,
      routes:      enriched.length,
      dtos:        enriched.reduce((n, g) => n + g.dtos.length, 0),
      rules:       countRules(enriched),
      total_cases: allCases.length,
      findings:    findings.length,
      routes_detail: enriched.map(g => ({
        route:    `${g.method} ${g.path}`,
        dtos:     g.dtos.map(d => d.className),
        cases:    allCases.filter(c => c.route === `${g.method} ${g.path}`).length,
        has_auth: g.nodes.some(n => n.type === "ir:auth_gate" || n.type === "ir:authz_check"),
      })),
      cases: allCases,
      findings_detail: findings,
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  // ── Human-readable output ────────────────────────────────────────────────────
  const totalRules = countRules(enriched)
  const totalDTOs  = enriched.reduce((n, g) => n + g.dtos.length, 0)

  console.log(`${BOLD}Framework${RESET} : ${framework}`)
  console.log(`${BOLD}Routes${RESET}    : ${graphs.length}`)
  console.log(`${BOLD}DTOs${RESET}      : ${totalDTOs}`)
  console.log(`${BOLD}Rules${RESET}     : ${totalRules} validation rules`)
  console.log(`${BOLD}Cases${RESET}     : ${allCases.length} generated`)

  if (findings.length > 0) {
    console.log(`${BOLD}Findings${RESET}  : ${findings.length}`)
  }

  console.log()

  // Per-route breakdown
  for (const graph of enriched) {
    const route     = `${graph.method} ${graph.path}`
    const cases     = allCases.filter(c => c.route === route)
    const hasAuth   = graph.nodes.some(n => n.type === "ir:auth_gate" || n.type === "ir:authz_check")
    const authLabel = hasAuth ? `${DIM} [auth]${RESET}` : ""

    console.log(`  ${BOLD}${route}${RESET}${authLabel}  ${DIM}(${cases.length} cases)${RESET}`)

    if (graph.dtos.length === 0 && !hasAuth) {
      console.log(`    ${DIM}no DTO or auth gate found${RESET}`)
      console.log()
      continue
    }

    // Group cases by category for display
    printCaseGroups(cases)

    // Route-level findings
    const routeFindings = findings.filter(f => f.route === route)
    for (const { finding } of routeFindings) {
      const color  = SEVERITY_COLOR[finding.severity.toLowerCase()] ?? ""
      const sev    = finding.severity.toUpperCase().padEnd(8)
      console.log(`    ${color}[${sev}]${RESET} ${finding.type}`)
      if (finding.summary) console.log(`    ${DIM}         ${finding.summary}${RESET}`)
    }

    console.log()
  }

  // Summary footer
  console.log(`${DIM}─────────────────────────────────────────────${RESET}`)
  if (findings.some(f => ["critical", "high"].includes(f.finding.severity.toLowerCase()))) {
    console.log(`\x1b[31m${findings.filter(f => ["critical", "high"].includes(f.finding.severity.toLowerCase())).length} high/critical finding(s) detected${RESET}`)
  }
  console.log(`\nTo execute against a server: ${DIM}archtest run --project ${projectRoot} --base-url <url>${RESET}`)
  console.log(`To save contract snapshot:   ${DIM}archtest snapshot save --project ${projectRoot}${RESET}`)
}

function printCaseGroups(cases: TestCase[]): void {
  const groups = new Map<string, TestCase[]>()
  for (const c of cases) {
    const key = c.category
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }

  const ORDER = [
    "happy_path",
    "required_missing",
    "null_value",
    "invalid_format",
    "boundary_min",
    "boundary_max",
    "wrong_type",
    "no_auth",
    "invalid_token",
  ]

  for (const category of ORDER) {
    const group = groups.get(category)
    if (!group) continue

    if (category === "happy_path") {
      console.log(`    \x1b[32m✓${RESET} happy path`)
      continue
    }

    if (group.length === 1) {
      console.log(`    \x1b[31m✗${RESET} ${group[0].description.replace(/^[^—]+— /, "")}`)
    } else {
      // Summarize multiple cases of same category
      const label = categoryLabel(category)
      console.log(`    \x1b[31m✗${RESET} ${label} × ${group.length}`)
      for (const c of group.slice(0, 3)) {
        console.log(`      ${DIM}· ${c.description.replace(/^[^—]+— /, "")}${RESET}`)
      }
      if (group.length > 3) {
        console.log(`      ${DIM}· ... and ${group.length - 3} more${RESET}`)
      }
    }
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    required_missing: "required field missing",
    null_value:       "null value",
    invalid_format:   "invalid format",
    boundary_min:     "below minimum boundary",
    boundary_max:     "above maximum boundary",
    wrong_type:       "wrong type",
    no_auth:          "no auth token",
    invalid_token:    "invalid auth token",
  }
  return labels[category] ?? category
}

function countRules(graphs: EnrichedGraph[]): number {
  return graphs.reduce((total, g) =>
    total + g.dtos.reduce((n, dto) =>
      n + dto.fields.reduce((r, f) => r + f.rules.length, 0), 0
    ), 0
  )
}

function requireProject(flags: Record<string, string>): string {
  const p = flags["project"]
  if (!p) {
    console.error("Error: --project <path> is required")
    process.exit(2)
  }
  return p
}
