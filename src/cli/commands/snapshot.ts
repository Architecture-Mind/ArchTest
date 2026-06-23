import { resolve } from "path"
import { scanProject } from "../../archmind/scanner"
import { enrichGraphs } from "../../enricher/index"
import { captureSnapshot } from "../../snapshot/capture"
import { saveSnapshot, loadSnapshot, snapshotPath } from "../../snapshot/store"
import { diffSnapshots } from "../../snapshot/diff"
import type { ContractDiff, Change, RouteDiff } from "../../snapshot/types"

const BOLD  = "\x1b[1m"
const RESET = "\x1b[0m"
const RED   = "\x1b[31m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const DIM   = "\x1b[90m"

type Subcommand = "save" | "diff" | "approve"

export async function runSnapshot(sub: string | undefined, flags: Record<string, string>): Promise<void> {
  const subcommand = sub as Subcommand | undefined
  if (!subcommand || !["save", "diff", "approve"].includes(subcommand)) {
    console.error("Usage: archtest snapshot <save|diff|approve> --project <path>")
    process.exit(2)
  }

  const projectRoot = requireProject(flags)
  const bin         = flags["archmind-bin"] ?? process.env["ARCHMIND_BIN"]
  const isJson      = "json" in flags
  const storeOpts   = { projectRoot: resolve(projectRoot), file: flags["file"] }

  if (subcommand === "save" || subcommand === "approve") {
    await runSave(resolve(projectRoot), bin, storeOpts, isJson)
    return
  }

  if (subcommand === "diff") {
    await runDiff(resolve(projectRoot), bin, storeOpts, isJson)
    return
  }
}

// ── save / approve ────────────────────────────────────────────────────────────

async function runSave(
  projectRoot: string,
  bin: string | undefined,
  storeOpts: { projectRoot: string; file?: string },
  isJson: boolean
): Promise<void> {
  if (!isJson) console.log(`Scanning: ${projectRoot}\n`)

  const { framework, graphs } = await scan(projectRoot, bin)
  const enriched = enrichGraphs(graphs, { projectRoot })
  const snapshot = captureSnapshot(enriched, framework)
  const filePath = saveSnapshot(snapshot, storeOpts)

  if (isJson) {
    console.log(JSON.stringify({ saved: filePath, routes: snapshot.routes.length }, null, 2))
    return
  }

  console.log(`${GREEN}✓${RESET} Contract snapshot saved: ${DIM}${filePath}${RESET}`)
  console.log()
  console.log(`  Framework : ${snapshot.framework}`)
  console.log(`  Routes    : ${snapshot.routes.length}`)
  console.log(`  DTOs      : ${snapshot.routes.filter(r => r.request).length}`)
  console.log(`  Captured  : ${snapshot.capturedAt}`)
  console.log()
  console.log(`${DIM}Commit ${filePath} to track contract changes in git.${RESET}`)
}

// ── diff ──────────────────────────────────────────────────────────────────────

async function runDiff(
  projectRoot: string,
  bin: string | undefined,
  storeOpts: { projectRoot: string; file?: string },
  isJson: boolean
): Promise<void> {
  const baseline = loadSnapshot(storeOpts)
  if (!baseline) {
    const path = snapshotPath(storeOpts)
    console.error(`No snapshot found at: ${path}`)
    console.error(`Run: archtest snapshot save --project ${projectRoot}`)
    process.exit(1)
  }

  if (!isJson) console.log(`Scanning: ${projectRoot}\n`)

  const { framework, graphs } = await scan(projectRoot, bin)
  const enriched = enrichGraphs(graphs, { projectRoot })
  const current  = captureSnapshot(enriched, framework)
  const diff     = diffSnapshots(baseline, current)

  if (isJson) {
    console.log(JSON.stringify(diff, null, 2))
    process.exit(diff.hasBreakingChanges ? 1 : 0)
  }

  printDiff(diff)
  process.exit(diff.hasBreakingChanges ? 1 : 0)
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function printDiff(diff: ContractDiff): void {
  const hasAny = diff.addedRoutes.length > 0 ||
                 diff.removedRoutes.length > 0 ||
                 diff.changedRoutes.length > 0

  if (!hasAny) {
    console.log(`${GREEN}✓ No contract changes detected${RESET}`)
    return
  }

  // Removed routes
  for (const route of diff.removedRoutes) {
    console.log(`${RED}✗ BREAKING  ROUTE REMOVED   ${route}${RESET}`)
  }

  // Added routes
  for (const route of diff.addedRoutes) {
    console.log(`${GREEN}+           ROUTE ADDED     ${route}${RESET}`)
  }

  // Changed routes
  for (const routeDiff of diff.changedRoutes) {
    printRouteDiff(routeDiff)
  }

  console.log()

  if (diff.hasBreakingChanges) {
    console.log(`${RED}${BOLD}Breaking changes detected.${RESET}`)
    console.log(`${DIM}Run: archtest snapshot approve --project . to accept these changes.${RESET}`)
  } else {
    console.log(`${YELLOW}Non-breaking changes detected.${RESET}`)
    console.log(`${DIM}Run: archtest snapshot approve --project . to update the baseline.${RESET}`)
  }
}

function printRouteDiff(routeDiff: RouteDiff): void {
  const prefix = routeDiff.breaking ? `${RED}✗ BREAKING ${RESET}` : `${YELLOW}~          ${RESET}`
  console.log()
  console.log(`${prefix} ${BOLD}${routeDiff.route}${RESET}`)

  for (const change of routeDiff.changes) {
    printChange(change)
  }
}

function printChange(change: Change): void {
  const b = (v: unknown) => v !== undefined ? String(v) : "(none)"

  switch (change.kind) {
    case "auth_added":
      console.log(`  ${RED}[BREAKING]${RESET} auth added: ${change.after?.join(", ")}`)
      break
    case "auth_removed":
      console.log(`  ${RED}[BREAKING]${RESET} auth removed: was ${change.before?.join(", ")}`)
      break
    case "guard_changed":
      console.log(`  ${DIM}[info]${RESET}     guards changed: ${change.before?.join(",")} → ${change.after?.join(",")}`)
      break
    case "field_added":
      if (change.breaking) {
        console.log(`  ${RED}[BREAKING]${RESET} required field added: ${BOLD}${change.field}${RESET}`)
      } else {
        console.log(`  ${GREEN}[ok]${RESET}       optional field added: ${change.field}`)
      }
      break
    case "field_removed":
      console.log(`  ${RED}[BREAKING]${RESET} field removed: ${BOLD}${change.field}${RESET}`)
      break
    case "type_changed":
      console.log(`  ${RED}[BREAKING]${RESET} ${change.field} type: ${b(change.before)} → ${b(change.after)}`)
      break
    case "rule_changed":
      if (change.breaking) {
        console.log(`  ${RED}[BREAKING]${RESET} ${change.field}.${change.rule}: ${b(change.before)} → ${b(change.after)}`)
      } else {
        console.log(`  ${DIM}[loosened]${RESET} ${change.field}.${change.rule}: ${b(change.before)} → ${b(change.after)}`)
      }
      break
  }
}

// ── Shared scan helper ────────────────────────────────────────────────────────

async function scan(projectRoot: string, bin: string | undefined) {
  try {
    return await scanProject({ projectRoot, bin })
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
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
