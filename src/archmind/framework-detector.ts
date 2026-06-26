import { existsSync, readFileSync } from "fs"
import { join } from "path"
import type { Framework } from "../types"

/**
 * Detects the framework of a project from filesystem artifacts.
 * Priority: nest-cli.json → package.json (@nestjs/core) → composer.json (laravel/framework)
 */
export function detectFramework(projectRoot: string): Framework {
  if (existsSync(join(projectRoot, "nest-cli.json"))) {
    return "nestjs"
  }

  const pkgPath = join(projectRoot, "package.json")
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>
      const deps = {
        ...(pkg["dependencies"] as Record<string, string> | undefined),
        ...(pkg["devDependencies"] as Record<string, string> | undefined),
      }
      if ("@nestjs/core" in deps) return "nestjs"
    } catch {
      // malformed package.json — fall through
    }
  }

  const composerPath = join(projectRoot, "composer.json")
  if (existsSync(composerPath)) {
    try {
      const composer = JSON.parse(readFileSync(composerPath, "utf-8")) as Record<string, unknown>
      const require = composer["require"] as Record<string, string> | undefined
      if (require?.["laravel/framework"] || require?.["laravel/lumen-framework"]) {
        return "laravel"
      }
    } catch {
      // malformed composer.json — fall through
    }
  }

  return "unknown"
}
