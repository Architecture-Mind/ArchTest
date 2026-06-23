# ArchTest

Code-first API contract intelligence. Reads your source code, extracts validation rules, tracks contract changes, and catches regressions — no Swagger, no manual test writing, no AI required.

Built on top of [ArchMind](https://github.com/Architecture-Mind/ArchMind).

---

## The Problem

```
Code      ≠ Swagger
Swagger   ≠ Production
```

Most API testing tools depend on documentation that's always out of date. ArchTest reads **source code directly** — your validation rules are the source of truth.

---

## Installation

```bash
npm install -g @kidkender/archtest
```

That's it. ArchMind is bundled — no separate install required.

---

## Commands

### `analyze` — Static contract analysis (no server needed)

Discover routes, extract validation rules, preview generated test cases — all from source code alone.

```bash
archtest analyze --project ./my-nestjs-app
```

```
Framework : nestjs
Routes    : 12
DTOs      : 8
Rules     : 94 validation rules
Cases     : 247 generated

  POST /users                          32 cases
    ✓ happy path
    ✗ email — invalid format × 5
    ✗ age — below min 18 → send 17
    ✗ age — above max 100 → send 101
    ✗ name — too short (< 3 chars)
    ! [HIGH] missing_authorization

  PUT /users/:id                       28 cases
    ...
```

Filter to a specific route:

```bash
archtest analyze --project . --route "POST /users"
archtest analyze --project . --json   # machine-readable output
```

---

### `snapshot` — Track contract changes across commits

Save your API contract as a baseline, then detect breaking changes automatically.

```bash
# Save current contract
archtest snapshot save --project .

# Check for breaking changes vs baseline
archtest snapshot diff --project .
```

```
BREAKING CHANGE  POST /users
  age.min: 18 → 21

NEW FIELD  POST /users
  phone: required, string
```

```bash
# Accept changes as new baseline
archtest snapshot approve --project .
```

Commit `.archtest/contract.json` to git. Add `snapshot diff` to CI — it exits `1` on breaking changes.

```yaml
# .github/workflows/contract.yml
- name: Check API contract drift
  run: npx archtest snapshot diff --project .
```

---

### `generate` — Generate Jest test files

Turn your API contract into runnable Jest spec files that you own and commit.

```bash
archtest generate --project . --output ./tests/contract
```

```typescript
// generated: tests/contract/POST-users.spec.ts
describe("POST /users", () => {
  it("accepts valid payload", async () => { ... })
  it("rejects missing email", async () => { ... })
  it("rejects age below minimum (17)", async () => { ... })
  // ... 29 more cases
})
```

---

### `verify` — Execute tests against a live server

Run the full generated test suite against a running server and report results.

```bash
archtest verify --project . --base-url http://localhost:3000
```

```
  ✓ POST /users                        32/32 passed
  ✗ PUT /users/:id                     1 failed, 27 passed
      ✗ age is a float (not integer)  expected 400, got 200

FAIL  27 passed  1 failed  0 errors  (1243ms)
```

Options:

```bash
archtest verify --project . --base-url http://localhost:3000 \
  --token <jwt>           # auth token for happy-path requests
  --timeout 10000         # per-request timeout in ms
  --concurrency 10        # parallel requests
  --report results.json   # save JSON report
  --json                  # machine-readable output (for CI)
```

---

### `lint` — Static analysis for validation gaps

Detect missing validation, weak fields, and unprotected routes — without running a server.

```bash
archtest lint --project .
```

```
  HIGH  DELETE /users/:id    [L003] DELETE route has no auth guard
  HIGH  POST /orders         [L004] POST route accepts body but has no DTO validation
  WARN  POST /auth/register  [L002] field "password" has no minLength constraint
  INFO  POST /users          [L005] field "role" looks like enum but has no IsIn constraint

4 issues found (2 HIGH, 1 WARN, 1 INFO)
```

Exits `1` if any HIGH issues are found. Use in CI as a quality gate:

```bash
archtest lint --project . --min-severity warn
archtest lint --project . --json   # machine-readable output
```

**Built-in rules:**

| Code | Severity | Description |
|------|----------|-------------|
| L001 | WARN | DTO has no validated fields |
| L002 | WARN | Password/secret field has no minLength |
| L003 | HIGH | POST/PUT/PATCH/DELETE route has no auth guard |
| L004 | HIGH | Write route accepts body but has no DTO |
| L005 | INFO | Field name suggests enum but no `IsIn`/`IsEnum` constraint |

---

### `fuzz` — Fire edge-case payloads to find 500 errors

Bombard your API with extreme values to find unhandled exceptions and validation bypasses.

```bash
archtest fuzz --project . --base-url http://localhost:3000
```

```
Fuzzing 12 routes with 847 edge-case payloads...

  🐛 CRASH   POST /users  field: age    [overflow_number]  → 500 Internal Server Error
  🐛 CRASH   POST /users  field: bio    [unicode_edge]     → 500 Internal Server Error
  ⚠ BYPASS  POST /items  field: price  [sql_injection]    → 200 OK (validation bypassed?)

FINDINGS  2 crashes  847 payloads  (3241ms)
```

Fuzz categories: `overflow_number`, `very_long_string`, `unicode_edge`, `sql_injection`, `template_injection`, `xss`, `type_confusion`, `whitespace_or_empty`, and more.

---

## Supported Frameworks

| Framework | Detect routes | Extract validation rules |
|-----------|--------------|--------------------------|
| NestJS (class-validator) | ✅ | ✅ |
| Laravel (FormRequest) | ✅ | ✅ |

---

## How It Works

```
Source Code
    ↓
@kidkender/archmind         — extract routes, auth gates, DTO references
    ↓
@kidkender/archmind-nestjs-parser  — read class-validator decorators field by field
@kidkender/archmind-laravel-parser — read FormRequest rules() method
    ↓
generator                   — produce test cases per validation rule
    ↓
analyze / snapshot / generate / verify / lint / fuzz
```

Given this DTO:

```typescript
export class CreateUserDto {
  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number
}
```

ArchTest generates:

```
POST /users
  ✓ valid payload
  ✗ email missing
  ✗ email = "not-an-email"
  ✗ email = "abc@"
  ✗ age = 17        (below min)
  ✗ age = 101       (above max)
  ✗ age = "abc"     (wrong type)
  ✗ age = 1.5       (not integer)
  ... 24 more cases
```

---

## Requirements

- Node.js 18+
- A NestJS or Laravel project to scan

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@kidkender/archmind`](https://www.npmjs.com/package/@kidkender/archmind) | CLI that extracts route graphs from source code |
| [`@kidkender/archmind-protocol`](https://www.npmjs.com/package/@kidkender/archmind-protocol) | Shared IR type vocabulary |
| [`@kidkender/archmind-nestjs-parser`](https://www.npmjs.com/package/@kidkender/archmind-nestjs-parser) | NestJS route + DTO parser |
| [`@kidkender/archmind-laravel-parser`](https://www.npmjs.com/package/@kidkender/archmind-laravel-parser) | Laravel route + FormRequest parser |
