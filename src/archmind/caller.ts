import { spawnSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"
import { ZodError } from "zod"
import { TraceJsonOutputSchema, FindingsJsonOutputSchema } from "./schemas"
import type { TraceJsonOutput, FindingsJsonOutput } from "../types"

export interface CallerOptions {
  /**
   * Path to archmind binary.
   * Defaults to auto-resolve: node_modules first, then PATH.
   */
  bin?: string
  /** Absolute path to the project being scanned. */
  projectRoot: string
}

/**
 * Resolves the archmind binary path.
 * Priority:
 *   1. Explicit `bin` option (--archmind-bin flag or ARCHMIND_BIN env)
 *   2. Local node_modules (installed as dependency of archtest)
 *   3. Global PATH
 */
function resolveBin(explicit?: string): string {
  if (explicit) return explicit

  // Walk up from this file to find node_modules/@kidkender/archmind.
  // __dirname is dist/ after build, so ../node_modules is the project root.
  const candidates = [
    join(__dirname, "../node_modules/@kidkender/archmind/dist/index.cjs"),
    join(__dirname, "../../node_modules/@kidkender/archmind/dist/index.cjs"),
    join(__dirname, "../../../node_modules/@kidkender/archmind/dist/index.cjs"),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return "archmind"  // fallback: expect on PATH
}

export class ArchmindCaller {
  private readonly bin: string
  private readonly projectRoot: string

  constructor(opts: CallerOptions) {
    this.bin         = resolveBin(opts.bin)
    this.projectRoot = opts.projectRoot
  }

  /** Run `archmind trace --project <root> --json` and return validated output. */
  trace(): TraceJsonOutput {
    const raw = this.run(["trace", "--project", this.projectRoot, "--json"])
    const parsed: unknown = JSON.parse(raw)
    try {
      return TraceJsonOutputSchema.parse(parsed) as unknown as TraceJsonOutput
    } catch (err) {
      if (err instanceof ZodError) throw new ArchmindFormatError("trace", err)
      throw err
    }
  }

  /** Run `archmind findings --project <root> --json` and return validated output. */
  findings(): FindingsJsonOutput {
    // findings exits with code 1 when issues found — that's expected, not an error
    const raw = this.run(["findings", "--project", this.projectRoot, "--json"], { allowNonZero: true })
    const parsed: unknown = JSON.parse(raw)
    try {
      return FindingsJsonOutputSchema.parse(parsed) as unknown as FindingsJsonOutput
    } catch (err) {
      if (err instanceof ZodError) throw new ArchmindFormatError("findings", err)
      throw err
    }
  }

  private run(args: string[], opts: { allowNonZero?: boolean } = {}): string {
    // .js / .cjs files can't be executed directly on Windows — wrap with node
    const isScript = /\.(c?js)$/i.test(this.bin)
    const cmd      = isScript ? "node" : this.bin
    const cmdArgs  = isScript ? [this.bin, ...args] : args

    const result = spawnSync(cmd, cmdArgs, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024, // 50 MB — large projects
    })

    if (result.error) {
      throw new ArchmindNotFoundError(this.bin, result.error)
    }

    const exitCode = result.status ?? 0
    if (exitCode !== 0 && !opts.allowNonZero) {
      const stderr = result.stderr?.trim() ?? ""
      throw new ArchmindRunError(args, exitCode, stderr)
    }

    const stdout = result.stdout?.trim() ?? ""
    if (!stdout) {
      throw new ArchmindRunError(args, exitCode, "empty output from archmind")
    }

    return stdout
  }
}

export class ArchmindNotFoundError extends Error {
  constructor(bin: string, cause: Error) {
    super(
      `Cannot find archmind binary ("${bin}").\n` +
      `Try reinstalling: npm install -g @kidkender/archtest\n` +
      `Cause: ${cause.message}`
    )
    this.name = "ArchmindNotFoundError"
  }
}

export class ArchmindRunError extends Error {
  constructor(args: string[], code: number, detail: string) {
    super(`archmind ${args.join(" ")} exited with code ${code}: ${detail}`)
    this.name = "ArchmindRunError"
  }
}

export class ArchmindFormatError extends Error {
  constructor(command: string, cause: ZodError) {
    const firstIssue = cause.issues[0]
    const path = firstIssue?.path.join(".") || "(root)"
    const msg  = firstIssue?.message ?? "unknown"
    super(
      `archmind ${command} output does not match expected format.\n` +
      `  Field "${path}": ${msg}\n` +
      `This may indicate an archmind version incompatibility.\n` +
      `Run: archmind ${command} --json | head -5 to inspect the raw output.`
    )
    this.name = "ArchmindFormatError"
  }
}
