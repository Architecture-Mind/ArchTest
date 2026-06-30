import type { TestCase } from "../generator/types"

export interface FuzzCase extends Omit<TestCase, "category"> {
  category:     "fuzz"
  fuzzField:    string
  fuzzCategory: string
}

export interface FuzzResult {
  fuzzCase:    FuzzCase
  status:      "crash" | "unexpected_ok" | "ok"
  actualStatus?: number
  durationMs:  number
  error?:      string
}

export interface FieldCoverage {
  route:            string
  field:            string
  totalPayloads:    number
  categoriesFuzzed: string[]
  crashes:          number
  bypasses:         number
}

export interface FuzzSummary {
  baseUrl:       string
  startedAt:     string
  durationMs:    number
  total:         number
  crashes:       number
  results:       FuzzResult[]
  fieldCoverage: FieldCoverage[]
  coveragePct:   number
}
