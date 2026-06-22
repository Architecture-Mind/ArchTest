import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import type { ContractSnapshot } from "./types"

const DEFAULT_FILENAME = "contract.json"
const DEFAULT_DIR      = ".archtest"

export interface StoreOptions {
  /** Absolute path to the project being analyzed */
  projectRoot: string
  /** Override the snapshot file path */
  file?: string
}

function resolvePath(opts: StoreOptions): string {
  return opts.file ?? join(opts.projectRoot, DEFAULT_DIR, DEFAULT_FILENAME)
}

export function saveSnapshot(snapshot: ContractSnapshot, opts: StoreOptions): string {
  const filePath = resolvePath(opts)
  const dir      = dirname(filePath)

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8")
  return filePath
}

export function loadSnapshot(opts: StoreOptions): ContractSnapshot | null {
  const filePath = resolvePath(opts)
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(filePath, "utf-8")
    return JSON.parse(raw) as ContractSnapshot
  } catch {
    return null
  }
}

export function snapshotExists(opts: StoreOptions): boolean {
  return existsSync(resolvePath(opts))
}

export function snapshotPath(opts: StoreOptions): string {
  return resolvePath(opts)
}
