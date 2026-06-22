import { ArchmindCaller } from "./caller"
import type { ExecutionGraph, RouteFinding, Framework } from "../types"

export interface ScanResult {
  framework: Framework
  graphs: ExecutionGraph[]
  findings: RouteFinding[]
}

export interface ScanOptions {
  projectRoot: string
  bin?: string
}

/**
 * Scans a project by calling archmind CLI and returns merged graphs + findings.
 */
export async function scanProject(opts: ScanOptions): Promise<ScanResult> {
  const caller = new ArchmindCaller({ projectRoot: opts.projectRoot, bin: opts.bin })

  const [traceOutput, findingsOutput] = await Promise.all([
    Promise.resolve(caller.trace()),
    Promise.resolve(caller.findings()),
  ])

  return {
    framework: traceOutput.framework as Framework,
    graphs:    traceOutput.graphs,
    findings:  findingsOutput,
  }
}
