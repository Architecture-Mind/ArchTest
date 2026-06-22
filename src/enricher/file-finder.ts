import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative } from "path"

export interface FoundFile {
  /** Absolute path */
  abs: string
  /** Path relative to project root */
  rel: string
  content: string
}

const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", "coverage", ".next"])

/**
 * Recursively collects all .ts files under projectRoot, excluding common non-source dirs.
 */
export function findTsFiles(projectRoot: string): FoundFile[] {
  const results: FoundFile[] = []
  collect(projectRoot, projectRoot, results)
  return results
}

function collect(dir: string, root: string, out: FoundFile[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue

    const abs = join(dir, entry)
    let stat
    try {
      stat = statSync(abs)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      collect(abs, root, out)
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts") && !entry.endsWith(".spec.ts") && !entry.endsWith(".test.ts")) {
      try {
        const content = readFileSync(abs, "utf-8")
        out.push({ abs, rel: relative(root, abs), content })
      } catch {
        // skip unreadable files
      }
    }
  }
}

/**
 * Builds a map of className → FoundFile by scanning all TS files for class declarations.
 * Returns only files that export at least one class.
 */
export function buildClassIndex(files: FoundFile[]): Map<string, FoundFile> {
  const index = new Map<string, FoundFile>()
  const classPattern = /export\s+class\s+(\w+)/g

  for (const file of files) {
    let match
    classPattern.lastIndex = 0
    while ((match = classPattern.exec(file.content)) !== null) {
      const className = match[1]
      if (!index.has(className)) {
        index.set(className, file)
      }
    }
  }

  return index
}
