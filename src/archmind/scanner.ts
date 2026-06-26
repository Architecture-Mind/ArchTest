import { ArchmindCaller } from "./caller"
import { detectFramework } from "./framework-detector"
import type { ExecutionGraph, RouteFinding, Framework } from "../types"

export interface ScanResult {
  framework: Framework
  graphs: ExecutionGraph[]
  findings: RouteFinding[]
}

export interface ScanOptions {
  projectRoot: string
  bin?: string
  /** Explicit framework override. Skips auto-detection when provided. */
  framework?: string
}

export async function scanProject(opts: ScanOptions): Promise<ScanResult> {
  const caller = new ArchmindCaller({ projectRoot: opts.projectRoot, bin: opts.bin })

  const [traceOutput, findingsOutput] = await Promise.all([
    Promise.resolve(caller.trace()),
    Promise.resolve(caller.findings()),
  ])

  return {
    framework: resolveFramework(opts.framework, opts.projectRoot, traceOutput.framework),
    graphs:    traceOutput.graphs,
    findings:  findingsOutput,
  }
}

function resolveFramework(explicit: string | undefined, projectRoot: string, cliOutput: string): Framework {
  if (explicit) {
    const normalized = explicit.toLowerCase()
    if (normalized === "nestjs" || normalized === "laravel") return normalized as Framework
  }

  const detected = detectFramework(projectRoot)
  if (detected !== "unknown") return detected

  const cli = cliOutput.toLowerCase()
  if (cli === "nestjs" || cli === "laravel") return cli as Framework

  return "unknown"
}
