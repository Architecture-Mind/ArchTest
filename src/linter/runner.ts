import type { EnrichedGraph } from "../enricher/types"
import type { LintResult } from "./types"
import { L001 } from "./rules/L001-missing-validation"
import { L002 } from "./rules/L002-weak-password"
import { L003 } from "./rules/L003-unprotected-write"
import { L004 } from "./rules/L004-no-dto-on-write"
import { L005 } from "./rules/L005-enum-hint"

const ALL_RULES = [L001, L002, L003, L004, L005]

export function runLint(graphs: EnrichedGraph[]): LintResult[] {
  return ALL_RULES.flatMap(rule => rule.run(graphs))
}
