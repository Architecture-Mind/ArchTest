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
✗ BREAKING  POST /users
  [BREAKING] age.min: 18 → 21
  [ok]       optional field added: nickname

~ NON-BREAKING  GET /orders
  [loosened] name.maxLength: 100 → 255
```

```bash
# Accept changes as new baseline
archtest snapshot approve --project .
```

**Exit codes:**

| Code | Meaning |
|------|---------|
| `0` | No changes |
| `1` | Non-breaking changes only |
| `2` | Breaking changes detected |

Commit `.archtest/contract.json` to git. Use in CI:

```yaml
- name: Check API contract drift
  run: npx archtest snapshot diff --project .
  # exits 2 on breaking changes → fails the pipeline
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

Exits `1` if any HIGH issues are found. Use as a CI quality gate.

**Options:**

```bash
archtest lint --project . --min-severity warn   # filter by severity
archtest lint --project . --explain             # show why + risk + fix per issue
archtest lint --project . --ci                  # GitHub Actions annotation output
archtest lint --project . --new-only            # only show issues not in baseline
archtest lint --project . --json                # machine-readable output
```

**`--explain` output:**

```
  HIGH  GET /users/:id
        [L008] route returns User directly — sensitive field "password" may leak

        Why?
        Route returns a database entity directly without going through a response DTO.

        Risk
        • password / salt / secret fields exposed to client
        • Bypasses DTO filtering and @Exclude() decorators on the entity

        Suggested Fix
        Create a dedicated response DTO (e.g. UserResponse) and map the entity to it.
```

**`--ci` output (GitHub Actions):**

```
::error title=[L003] DELETE route has no auth guard::DELETE /users/:id
::warning title=[L002] field "password" has no minLength::POST /auth/register
```

**Built-in rules:**

| Code | Severity | Description |
|------|----------|-------------|
| L001 | WARN | DTO has no validated fields |
| L002 | WARN | Password/secret field has no `minLength` |
| L003 | HIGH | POST/PUT/PATCH/DELETE route has no auth guard |
| L004 | HIGH | Write route accepts body but has no DTO |
| L005 | INFO | Field name suggests enum but no `IsIn`/`IsEnum` constraint |
| L006 | WARN | Auth-sensitive route has no rate-limiting guard |
| L007 | HIGH | Privileged route (`/admin`, `/internal`, ...) has no auth gate |
| L008 | HIGH | Route returns entity directly — sensitive fields may leak |
| L009 | WARN | GET list route has no pagination — potential large dataset exposure |
| L010 | INFO | Circular DTO reference — may cause infinite serialization |

---

### `baseline` — Suppress known issues in CI

Save current lint results as a baseline. Future runs with `--new-only` only surface regressions.

```bash
# Save baseline (commit this file)
archtest baseline --project .

# Only show issues introduced since baseline
archtest lint --new-only --project .

# Show what's in the baseline
archtest baseline show --project .
```

The baseline is stored at `.archtest/lint-baseline.json`. Commit it to git so CI has a reference point.

---

### `fuzz` — Fire edge-case payloads to find 500 errors

Bombard your API with extreme values to find unhandled exceptions and validation bypasses.

```bash
archtest fuzz --project . --base-url http://localhost:3000
```

```
Fuzzing 12 routes with 847 edge-case payloads...

  🐛 CRASH   POST /users  field: age    [overflow_number]  → 500 Internal Server Error
  ⚠ BYPASS  POST /items  field: price  [sql_injection]    → 200 OK (validation bypassed?)

── Field Coverage ───────────────────────────────────────
  POST /users  email     64 payloads  12 categories  clean
  POST /users  age       48 payloads   9 categories  1 crash
  POST /items  price     48 payloads   9 categories  1 bypass

FINDINGS  1 crash  847 payloads  (3241ms)
```

Fuzz categories: `overflow_number`, `very_long_string`, `unicode_edge`, `sql_injection`, `template_injection`, `xss`, `type_confusion`, `whitespace_or_empty`, `null`, `undefined`, and more.

---

### `report` — Generate a shareable HTML or Markdown report

Combine lint issues and snapshot diff into a single file for sharing with your team or storing as a CI artifact.

```bash
archtest report --project . --format html --out report.html
archtest report --project . --format md   --out report.md
```

The report includes:
- Summary card (lint issues, fuzz crashes, breaking changes, routes scanned)
- Full lint issue table
- Snapshot diff table with BREAKING / NON-BREAKING labels
- Field coverage table (if fuzz data is provided)

---

## Config File

Create `archtest.config.json` at your project root to customize rule behavior:

```json
{
  "rules": {
    "L008": "error",
    "L009": "warning",
    "L010": "off"
  },
  "ignore": [
    { "rule": "L009", "route": "GET /admin/export" }
  ]
}
```

| Option | Values | Description |
|--------|--------|-------------|
| `rules.<code>` | `"error"` `"warning"` `"info"` `"off"` | Override rule severity or disable entirely |
| `ignore[].rule` | rule code | Suppress a rule globally |
| `ignore[].route` | `"GET /path"` | Suppress a rule only for a specific route |

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
analyze / snapshot / generate / verify / lint / fuzz / baseline / report
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

## License

MIT © kidkender

---

## Related Packages

| Package | Description |
|---------|-------------|
| [`@kidkender/archmind`](https://www.npmjs.com/package/@kidkender/archmind) | CLI that extracts route graphs from source code |
| [`@kidkender/archmind-protocol`](https://www.npmjs.com/package/@kidkender/archmind-protocol) | Shared IR type vocabulary |
| [`@kidkender/archmind-nestjs-parser`](https://www.npmjs.com/package/@kidkender/archmind-nestjs-parser) | NestJS route + DTO parser |
| [`@kidkender/archmind-laravel-parser`](https://www.npmjs.com/package/@kidkender/archmind-laravel-parser) | Laravel route + FormRequest parser |
