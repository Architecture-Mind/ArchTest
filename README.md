# ArchTest

Code-first API contract intelligence. Reads your source code, extracts validation rules, tracks contract changes — no Swagger, no manual test writing, no AI required.

Built on top of [ArchMind](https://github.com/kidkender/archmind).

---

## The Problem

```
Code      ≠ Swagger
Swagger   ≠ Production
```

Most API testing tools depend on documentation that's always out of date.

ArchTest reads **source code directly** — your validation rules are the source of truth.

---

## Commands

### `analyze` — Static contract analysis (no server needed)

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

To execute against a server: archtest run --project . --base-url <url>
To save contract snapshot:   archtest snapshot save --project .
```

Filter to a specific route:

```bash
archtest analyze --project . --route "POST /users"
```

---

### `snapshot` — Track contract changes across commits *(coming soon)*

```bash
# Save current contract as baseline
archtest snapshot save --project .

# Detect breaking changes
archtest snapshot diff --project .
```

```
BREAKING CHANGE  POST /users
  age.min: 18 → 21

NEW FIELD  POST /users
  phone: required, string
```

Commit `.archtest/contract.json` to git. Run `snapshot diff` in CI.

---

### `run` — Execute tests against a live server

```bash
archtest run --project . --base-url http://localhost:3000
```

```
  [001/247] ✓ POST /users — valid payload
  [002/247] ✗ POST /users — email is missing
  [003/247] ✓ POST /users — invalid email format

Results: PASS 246  FAIL 1  ERROR 0  (1243ms)
```

---

## Installation

Requires [archmind](https://github.com/kidkender/archmind) on PATH:

```bash
npm install -g @kidkender/archmind
```

Then clone and build ArchTest:

```bash
git clone https://github.com/your-org/archtest
cd archtest
npm install
npm run build
npm link          # makes `archtest` available globally
```

---

## Supported Frameworks

| Framework | Status |
|-----------|--------|
| NestJS (class-validator) | ✅ MVP |
| Laravel (FormRequest) | 🔜 Phase 2 |

---

## How It Works

```
Source Code
    ↓
archmind scan        — extract routes, auth gates, DTO references
    ↓
dto-parser           — read class-validator decorators field by field
    ↓
generator            — produce test cases per validation rule
    ↓
analyze / snapshot / run
```

Example: given this DTO:

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

## Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| 1 | Contract Analysis (`analyze`) | ✅ Done |
| 2 | Contract Snapshot + Diff | 🔜 Next |
| 3 | Test Code Generation | 📋 Planned |
| 4 | Runtime Verification (`run`) | ✅ Done |

---

## Requirements

- Node.js 18+
- [archmind](https://github.com/kidkender/archmind) on PATH
