import type {
  ContractSnapshot,
  RouteContract,
  FieldContract,
  RuleContract,
  ContractDiff,
  RouteDiff,
  Change,
  FieldRuleChange,
} from "./types"

/**
 * Breaking change rules:
 *
 * BREAKING:
 *   - Route removed
 *   - Required field added
 *   - Field removed
 *   - Field type changed
 *   - min/minLength increased  (tightened constraint)
 *   - max/maxLength decreased  (tightened constraint)
 *   - optional → required
 *   - auth removed             (security regression)
 *   - auth added               (breaks unauthenticated clients)
 *
 * NON-BREAKING:
 *   - Route added
 *   - Optional field added
 *   - required → optional      (loosened)
 *   - min/minLength decreased  (loosened)
 *   - max/maxLength increased  (loosened)
 */
export function diffSnapshots(
  baseline: ContractSnapshot,
  current: ContractSnapshot
): ContractDiff {
  const baseMap    = indexRoutes(baseline.routes)
  const currentMap = indexRoutes(current.routes)

  const addedRoutes   = [...currentMap.keys()].filter(k => !baseMap.has(k))
  const removedRoutes = [...baseMap.keys()].filter(k => !currentMap.has(k))

  const changedRoutes: RouteDiff[] = []

  for (const [key, currentRoute] of currentMap) {
    const baseRoute = baseMap.get(key)
    if (!baseRoute) continue  // new route, already in addedRoutes

    const changes = diffRoute(baseRoute, currentRoute)
    if (changes.length > 0) {
      changedRoutes.push({
        route:   key,
        breaking: changes.some(c => c.breaking),
        changes,
      })
    }
  }

  const hasBreakingChanges =
    removedRoutes.length > 0 ||
    changedRoutes.some(r => r.breaking)

  return { hasBreakingChanges, addedRoutes, removedRoutes, changedRoutes }
}

function indexRoutes(routes: RouteContract[]): Map<string, RouteContract> {
  return new Map(routes.map(r => [`${r.method} ${r.path}`, r]))
}

function diffRoute(base: RouteContract, current: RouteContract): Change[] {
  const changes: Change[] = []

  // ── Auth changes ─────────────────────────────────────────────────────────────
  if (base.auth.required !== current.auth.required) {
    changes.push({
      kind:    current.auth.required ? "auth_added" : "auth_removed",
      breaking: true,
      before:  base.auth.guards,
      after:   current.auth.guards,
    })
  } else if (base.auth.required && current.auth.required) {
    const baseGuards    = base.auth.guards.slice().sort().join(",")
    const currentGuards = current.auth.guards.slice().sort().join(",")
    if (baseGuards !== currentGuards) {
      changes.push({
        kind:     "guard_changed",
        breaking: false,
        before:   base.auth.guards,
        after:    current.auth.guards,
      })
    }
  }

  // ── Field changes ─────────────────────────────────────────────────────────────
  const baseFields    = indexFields(base.request?.fields    ?? [])
  const currentFields = indexFields(current.request?.fields ?? [])

  // Removed fields
  for (const [name, baseField] of baseFields) {
    if (!currentFields.has(name)) {
      changes.push({ kind: "field_removed", field: name, breaking: true })
      continue
    }

    const curField = currentFields.get(name)!

    // Type changed
    if (baseField.type !== curField.type) {
      changes.push({
        kind:     "type_changed",
        field:    name,
        before:   baseField.type,
        after:    curField.type,
        breaking: true,
      })
    }

    // Rule changes
    changes.push(...diffRules(name, baseField, curField))
  }

  // Added fields
  for (const [name, curField] of currentFields) {
    if (!baseFields.has(name)) {
      const required = curField.rules.some(r => r.kind === "required") &&
                       !curField.rules.some(r => r.kind === "optional")
      changes.push({ kind: "field_added", field: name, required, breaking: required })
    }
  }

  return changes
}

function indexFields(fields: FieldContract[]): Map<string, FieldContract> {
  return new Map(fields.map(f => [f.name, f]))
}

function diffRules(
  fieldName: string,
  base: FieldContract,
  current: FieldContract
): FieldRuleChange[] {
  const changes: FieldRuleChange[] = []
  const baseRules    = indexRules(base.rules)
  const currentRules = indexRules(current.rules)

  // All rule kinds present in either version
  const allKinds = new Set([...baseRules.keys(), ...currentRules.keys()])

  for (const kind of allKinds) {
    const bRule = baseRules.get(kind)
    const cRule = currentRules.get(kind)

    // Rule added
    if (!bRule && cRule) {
      changes.push({
        kind:     "rule_changed",
        field:    fieldName,
        rule:     kind,
        before:   undefined,
        after:    cRule.value,
        breaking: isNewRuleBreaking(kind, cRule.value),
      })
      continue
    }

    // Rule removed
    if (bRule && !cRule) {
      changes.push({
        kind:     "rule_changed",
        field:    fieldName,
        rule:     kind,
        before:   bRule.value,
        after:    undefined,
        breaking: false,  // removing a constraint is never breaking
      })
      continue
    }

    // Rule value changed
    if (bRule && cRule && !valuesEqual(bRule.value, cRule.value)) {
      changes.push({
        kind:     "rule_changed",
        field:    fieldName,
        rule:     kind,
        before:   bRule.value,
        after:    cRule.value,
        breaking: isRuleChangeBreaking(kind, bRule.value, cRule.value),
      })
    }
  }

  return changes
}

function indexRules(rules: RuleContract[]): Map<string, RuleContract> {
  return new Map(rules.map(r => [r.kind, r]))
}

/**
 * Is tightening a constraint breaking?
 * Breaking if: min/minLength increased, max/maxLength decreased, required added.
 */
function isRuleChangeBreaking(
  kind: string,
  before: RuleContract["value"],
  after: RuleContract["value"]
): boolean {
  if (kind === "required" || kind === "optional") return true  // required↔optional always notable

  const b = typeof before === "number" ? before : undefined
  const a = typeof after  === "number" ? after  : undefined

  if (b === undefined || a === undefined) return false

  switch (kind) {
    case "min":
    case "minLength":
    case "arrayMinSize":
      return a > b  // tightened: was 18, now 21 → breaking

    case "max":
    case "maxLength":
    case "arrayMaxSize":
      return a < b  // tightened: was 100, now 50 → breaking

    default:
      return true   // unknown rule changed → assume breaking to be safe
  }
}

function isNewRuleBreaking(kind: string, _value: RuleContract["value"]): boolean {
  // Adding a constraint that wasn't there before
  const ALWAYS_BREAKING = new Set(["required", "min", "minLength", "max", "maxLength", "email", "uuid", "url", "integer"])
  return ALWAYS_BREAKING.has(kind)
}

function valuesEqual(
  a: RuleContract["value"],
  b: RuleContract["value"]
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i])
  }
  return a === b
}
