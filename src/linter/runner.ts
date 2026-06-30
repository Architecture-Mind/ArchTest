import type { EnrichedGraph } from "../enricher/types"
import type { LintResult } from "./types"
import type { ArchtestConfig } from "../config/index"
import { isRuleDisabled, isResultIgnored, applyConfigSeverity } from "../config/index"
import { L001 } from "./rules/L001-missing-validation"
import { L002 } from "./rules/L002-weak-password"
import { L003 } from "./rules/L003-unprotected-write"
import { L004 } from "./rules/L004-no-dto-on-write"
import { L005 } from "./rules/L005-enum-hint"
import { L006 } from "./rules/L006-missing-throttle"
import { L007 } from "./rules/L007-admin-no-auth"
import { L008 } from "./rules/L008-entity-leak"
import { L009 } from "./rules/L009-missing-pagination"
import { L010 } from "./rules/L010-circular-dto"

export const ALL_RULES = [L001, L002, L003, L004, L005, L006, L007, L008, L009, L010]

export function runLint(graphs: EnrichedGraph[], config: ArchtestConfig = {}): LintResult[] {
  return ALL_RULES
    .filter(rule => !isRuleDisabled(rule.code, config))
    .flatMap(rule => rule.run(graphs))
    .filter(result => !isResultIgnored(result, config))
    .map(result => ({ ...result, severity: applyConfigSeverity(result, config) }))
}
