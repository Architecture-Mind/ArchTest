export interface ContractSnapshot {
  version: "1.0"
  capturedAt: string
  framework: string
  routes: RouteContract[]
}

export interface RouteContract {
  method: string
  path: string
  /** Critical IR node types present on this route */
  topology: string[]
  auth: AuthContract
  request?: RequestContract
}

export interface AuthContract {
  required: boolean
  /** Guard class names, e.g. ["JwtAuthGuard", "RolesGuard"] */
  guards: string[]
}

export interface RequestContract {
  dtoClass: string
  fields: FieldContract[]
}

export interface FieldContract {
  name: string
  type: string
  rules: RuleContract[]
}

export interface RuleContract {
  kind: string
  value?: number | string | string[]
}

// ── Diff types ────────────────────────────────────────────────────────────────

export interface ContractDiff {
  hasBreakingChanges: boolean
  addedRoutes: string[]
  removedRoutes: string[]
  changedRoutes: RouteDiff[]
}

export interface RouteDiff {
  route: string
  breaking: boolean
  changes: Change[]
}

export type Change =
  | AuthChange
  | FieldAdded
  | FieldRemoved
  | FieldRuleChange
  | FieldTypeChange

export interface AuthChange {
  kind: "auth_added" | "auth_removed" | "guard_changed"
  breaking: boolean
  before?: string[]
  after?: string[]
}

export interface FieldAdded {
  kind: "field_added"
  field: string
  required: boolean
  /** Breaking only if required — optional field additions are backward-compatible */
  breaking: boolean
}

export interface FieldRemoved {
  kind: "field_removed"
  field: string
  breaking: true
}

export interface FieldRuleChange {
  kind: "rule_changed"
  field: string
  rule: string
  before: number | string | string[] | undefined
  after: number | string | string[] | undefined
  breaking: boolean
}

export interface FieldTypeChange {
  kind: "type_changed"
  field: string
  before: string
  after: string
  breaking: true
}
