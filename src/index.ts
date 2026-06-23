import { runScan } from "./cli/commands/scan"
import { runAnalyze } from "./cli/commands/analyze"
import { runSnapshot } from "./cli/commands/snapshot"
import { runGenerate } from "./cli/commands/generate"
import { runRun } from "./cli/commands/run"

function parseFlags(rawArgs: string[]): { flags: Record<string, string>; positional: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i]
    if (arg.startsWith("--")) {
      const key  = arg.slice(2)
      const next = rawArgs[i + 1]
      if (next && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = ""
      }
    } else {
      positional.push(arg)
    }
  }

  return { flags, positional }
}

function printHelp(): void {
  console.log([
    "",
    "archtest — code-first API contract intelligence",
    "",
    "Commands:",
    "  archtest analyze --project <path>",
    "    Discover routes, extract validation rules, show generated test cases",
    "    No server required — pure static analysis",
    "    Options: --route <filter>  --json  --archmind-bin <path>",
    "",
    "  archtest snapshot <save|diff|approve> --project <path>",
    "    Track API contract changes across commits",
    "    save    — capture current contract as baseline",
    "    diff    — compare current contract vs saved baseline",
    "    approve — accept current contract as new baseline",
    "",
    "  archtest generate --project <path>",
    "    Generate Jest .spec.ts test files from the contract",
    "    Options:",
    "      --output <dir>        Output directory (default: .archtest/generated)",
    "      --base-url <url>      Default server URL in generated files",
    "      --json                Output metadata as JSON instead of writing files",
    "",
    "  archtest run --project <path> --base-url <url>",
    "    Execute generated test cases against a running server",
    "    Options:",
    "      --base-url <url>      Running server URL (required)",
    "      --token <jwt>         Auth token for happy-path requests",
    "      --timeout <ms>        Per-request timeout, default 5000",
    "      --concurrency <n>     Parallel requests, default 5",
    "      --json                Output results as JSON",
    "",
    "  archtest scan --project <path>",
    "    Low-level: show routes + security findings only",
    "",
    "Environment:",
    "  ARCHMIND_BIN   Path to archmind binary (default: archmind on PATH)",
    "",
    "Examples:",
    "  archtest analyze  --project ./my-nestjs-app",
    "  archtest snapshot save --project ./my-nestjs-app",
    "  archtest snapshot diff --project ./my-nestjs-app",
    "  archtest generate --project ./my-nestjs-app --output ./tests/contract",
    "  archtest run      --project ./my-nestjs-app --base-url http://localhost:3000",
    "",
  ].join("\n"))
}

async function main(): Promise<void> {
  const args    = process.argv.slice(2)
  const command = args[0]

  if (!command || command === "--help" || command === "-h") {
    printHelp()
    process.exit(0)
  }

  const { flags, positional } = parseFlags(args.slice(1))

  if (command === "scan") {
    await runScan(flags)
    return
  }

  if (command === "analyze") {
    await runAnalyze(flags)
    return
  }

  if (command === "snapshot") {
    await runSnapshot(positional[0], flags)
    return
  }

  if (command === "generate") {
    await runGenerate(flags)
    return
  }

  if (command === "run") {
    await runRun(flags)
    return
  }

  console.error(`Unknown command: ${command}`)
  console.error(`Run archtest --help for usage.`)
  process.exit(1)
}

main().catch((err: unknown) => {
  console.error("Fatal:", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
