export type TestCategory =
  | "happy_path"
  | "required_missing"
  | "invalid_format"
  | "boundary_min"
  | "boundary_max"
  | "wrong_type"
  | "null_value"
  | "no_auth"
  | "invalid_token"

export interface TestCase {
  id: string
  /** e.g. "POST /users" */
  route: string
  method: string
  path: string
  category: TestCategory
  description: string
  /** undefined means no body (GET, DELETE without body) */
  payload?: Record<string, unknown>
  headers: Record<string, string>
  /** HTTP status code we assert */
  expectedStatus: number
}
