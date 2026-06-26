# Changelog

All notable changes to `@kidkender/archtest` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.3.0] — 2026-06-26

### Added

- **Framework auto-detection** — `archtest` now detects NestJS/Laravel automatically from filesystem markers
  - `nest-cli.json` or `@nestjs/core` in `package.json` → NestJS
  - `laravel/framework` or `laravel/lumen-framework` in `composer.json` → Laravel
  - Fallback to archmind CLI output if detection returns unknown

- **`--framework` flag** — Override auto-detection on all commands
  - `archtest analyze --project . --framework nestjs`
  - Available on: `analyze`, `scan`, `snapshot`, `generate`, `verify`, `lint`, `fuzz`

- **Zod boundary validation** — archmind CLI output is now validated with Zod schemas at parse time
  - Clear `ArchmindFormatError` with field path and message when format drifts
  - `looseObject` schemas allow protocol extension without breaking validation

- **L006** — Linter rule: auth-sensitive routes (`/login`, `/register`, `/password`, `/token`, `/signin`) with no rate-limiting guard (WARN)

- **L007** — Linter rule: privileged routes (`/admin`, `/internal`, `/management`, `/backoffice`, `/system`) with no auth gate (HIGH)

### Fixed

- **L005** — Removed `"type"` and `"kind"` from enum-hint field names; both caused false positives on generic string fields

### Changed

- `zod` added as a runtime dependency for CLI output validation

---

## [0.2.0] — 2026-06-24

### Added

- **`archtest lint`** — Static analysis command that detects validation gaps and security issues without a running server
  - `L001` — DTO has no validated fields
  - `L002` — Password/secret field missing `minLength` constraint
  - `L003` — POST/PUT/PATCH/DELETE route has no auth guard (HIGH)
  - `L004` — Write route accepts body but has no DTO validation (HIGH)
  - `L005` — Field name suggests enum but has no `IsIn`/`IsEnum` constraint
  - `--min-severity` flag to filter by HIGH/WARN/INFO
  - Exit code `1` on HIGH issues — usable as a CI quality gate

- **`archtest fuzz`** — Fires edge-case payloads to find 500 errors and validation bypasses
  - Fuzz categories: `overflow_number`, `very_long_string`, `unicode_edge`, `sql_injection`, `template_injection`, `xss`, `type_confusion`, `whitespace_or_empty`, `null`, `undefined`
  - Reports 5xx responses (crashes) and 2xx responses on fuzz payloads (validation bypasses)
  - `--report` flag to save JSON findings

- **Laravel FormRequest support** — All commands now work on Laravel projects
  - Auto-detected from `archmind trace` framework field
  - Parses `FormRequest::rules()` method — both pipe-syntax (`'required|email|max:255'`) and array-syntax (`['required', 'email']`)
  - Supports `nullable`/`sometimes` → optional, `in:a,b,c` → isIn, `between:min,max`, `regex:/pattern/`
  - `min:N`/`max:N` correctly inferred as `minLength`/`maxLength` for strings and `min`/`max` for integers

- **New class-validator decorators**: `@IsIn([...])`, `@Length(min, max)`, `@IsDate`, `@IsPhoneNumber`, `@IsEthereumAddress`, `@IsAlphanumeric`, `@IsNumberString`, `@ArrayNotEmpty`

- **`@Length(min, max)`** emits both `minLength` and `maxLength` rules in one decorator

- **archmind auto-resolve** — ArchMind binary is automatically resolved from `node_modules`, no `--archmind-bin` flag needed

### Fixed

- `dto-parser` silently dropped fields with `!` definite assignment assertion (`name!: string`) — now parsed correctly
- `caller.ts` failed on Windows when archmind binary was a `.cjs` file — now wraps with `node` automatically
- `looksLikeDTO` heuristic missed newer decorators (`@IsIn`, `@Length`, `@IsPhoneNumber`, etc.) — causing DTOs using only these decorators to be skipped

### Changed

- `archtest run` renamed to `archtest verify` (backward-compatible: `run` still works as an alias)
- Validation types (`DTOSchema`, `FieldSchema`, `ValidationRule`, `RuleKind`) now sourced from `@kidkender/archmind-protocol` — no more local duplicates
- DTO parsing moved to `@kidkender/archmind-nestjs-parser` package
- FormRequest parsing moved to `@kidkender/archmind-laravel-parser` package
- `archtest` is now a thin consumer of the ArchMind package ecosystem

### Packages updated

| Package | Version |
|---------|---------|
| `@kidkender/archmind` | `^0.3.0` |
| `@kidkender/archmind-protocol` | `^0.2.0` |
| `@kidkender/archmind-nestjs-parser` | `^0.3.0` |
| `@kidkender/archmind-laravel-parser` | `^0.2.0` |

---

## [0.1.0] — 2026-06-22

### Added

- **`archtest analyze`** — Static contract analysis: discover routes, extract validation rules, preview test cases without a server
- **`archtest snapshot save/diff/approve`** — Track API contract changes across commits; detect breaking changes automatically
- **`archtest generate`** — Generate Jest `.spec.ts` test files from the contract
- **`archtest verify`** — Execute test cases against a running server with concurrency control and JSON report
- **`archtest scan`** — Low-level: show routes + security findings only
- NestJS support with class-validator decorators: `@IsEmail`, `@IsInt`, `@Min`, `@Max`, `@MinLength`, `@MaxLength`, `@IsOptional`, `@IsEnum`, `@IsUUID`, `@IsUrl`, `@IsBoolean`, `@IsPositive`, `@IsNegative`, `@Matches`
- Breaking change detection in snapshot diff: field removed, required field added, min increased, max decreased, auth added/removed
- Auth test cases: `no_auth` (missing token) and `invalid_token` for routes with guards
- `--token` flag for authenticated happy-path requests
- `--report` flag to save JSON results
- `--json` flag on all commands for machine-readable output
- `ARCHMIND_BIN` environment variable support
