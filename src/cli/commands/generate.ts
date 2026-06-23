import { resolve, join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { generateAllTestCases } from "../../generator/index"
import { generateJestFiles } from "../../codegen/jest-writer"

const RESET = "\x1b[0m"
const DIM   = "\x1b[90m"
const BOLD  = "\x1b[1m"
const GREEN = "\x1b[32m"

export async function runGenerate(flags: Record<string, string>): Promise<void> {
  const projectRoot = requireProject(flags)
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const outputDir   = flags["output"] ?? ".archtest/generated"
  const baseUrl     = flags["base-url"] ?? "http://localhost:3000"
  const isJson      = "json" in flags

  const absProject = resolve(projectRoot)
  const absOutput  = resolve(outputDir)

  if (!isJson) {
    console.log(`Scanning : ${absProject}`)
    console.log(`Output   : ${absOutput}\n`)
  }

  // ── 1. Scan ──────────────────────────────────────────────────────────────────
  let scanResult
  try {
    scanResult = await scanProject({ projectRoot: absProject, bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  const { framework, graphs } = scanResult

  // ── 2. Enrich ────────────────────────────────────────────────────────────────
  const enriched = enrichGraphs(graphs, { projectRoot: absProject })

  // ── 3. Generate test cases ───────────────────────────────────────────────────
  const cases = generateAllTestCases(enriched)

  // ── 4. Write Jest files ──────────────────────────────────────────────────────
  const files = generateJestFiles(cases, {
    defaultBaseUrl: baseUrl,
    generatedBy: `archtest generate --project ${projectRoot}`,
  })

  if (isJson) {
    const output = {
      framework,
      routes:     enriched.length,
      cases:      cases.length,
      files:      [...files.keys()],
      output_dir: absOutput,
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  if (files.size === 0) {
    console.log("No routes found — nothing to generate.")
    console.log(`Try running: ${DIM}archtest analyze --project ${projectRoot}${RESET}`)
    return
  }

  // Write files to disk
  mkdirSync(absOutput, { recursive: true })

  for (const [filename, content] of files) {
    const outPath = join(absOutput, filename)
    writeFileSync(outPath, content, "utf8")
    console.log(`  ${GREEN}✓${RESET} ${filename}  ${DIM}(${content.split("\n").length} lines)${RESET}`)
  }

  console.log()
  console.log(`${BOLD}Generated${RESET} ${files.size} spec file(s) → ${absOutput}`)
  console.log()
  console.log(`Run tests with:`)
  console.log(`  ${DIM}API_BASE_URL=http://localhost:3000 npx jest ${absOutput}${RESET}`)
}

function requireProject(flags: Record<string, string>): string {
  const p = flags["project"]
  if (!p) {
    console.error("Error: --project <path> is required")
    process.exit(2)
  }
  return p
}
