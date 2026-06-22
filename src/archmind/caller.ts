import { spawnSync } from "child_process"
import type { TraceJsonOutput, FindingsJsonOutput } from "../types"

export interface CallerOptions {
  /** Path to archmind binary. Defaults to "archmind" (expects it on PATH). */
  bin?: string
  /** Absolute path to the project being scanned. */
  projectRoot: string
}

export class ArchmindCaller {
  private readonly bin: string
  private readonly projectRoot: string

  constructor(opts: CallerOptions) {
    this.bin         = opts.bin ?? "archmind"
    this.projectRoot = opts.projectRoot
  }

  /** Run `archmind trace --project <root> --json` and return parsed output. */
  trace(): TraceJsonOutput {
    const raw = this.run(["trace", "--project", this.projectRoot, "--json"])
    return JSON.parse(raw) as TraceJsonOutput
  }

  /** Run `archmind findings --project <root> --json` and return parsed output. */
  findings(): FindingsJsonOutput {
    // findings exits with code 1 when issues found — that's expected, not an error
    const raw = this.run(["findings", "--project", this.projectRoot, "--json"], { allowNonZero: true })
    return JSON.parse(raw) as FindingsJsonOutput
  }

  private run(args: string[], opts: { allowNonZero?: boolean } = {}): string {
    const result = spawnSync(this.bin, args, {
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
      `Cannot find "${bin}" on PATH.\n` +
      `Install it: npm install -g @kidkender/archmind\n` +
      `Or set ARCHMIND_BIN env to its absolute path.\n` +
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
