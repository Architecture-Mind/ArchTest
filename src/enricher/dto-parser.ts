import type { DTOSchema, FieldSchema, FieldType, ValidationRule, RuleKind } from "./types"

/**
 * Parses a single TypeScript source file and extracts all class-validator annotated classes.
 * Does not require ts-morph — uses line-by-line parsing sufficient for standard DTO patterns.
 */
export function parseDTOFile(content: string, relPath: string): DTOSchema[] {
  const schemas: DTOSchema[] = []
  const lines = content.split("\n")

  let i = 0
  while (i < lines.length) {
    const classMatch = lines[i].match(/export\s+class\s+(\w+)/)
    if (classMatch) {
      const className = classMatch[1]
      // Pass the class declaration line itself so parseClassBody can find the opening `{`
      const { fields, endLine } = parseClassBody(lines, i)
      if (fields.length > 0) {
        schemas.push({ className, file: relPath, fields })
      }
      i = endLine
    } else {
      i++
    }
  }

  return schemas
}

function parseClassBody(lines: string[], startLine: number): { fields: FieldSchema[]; endLine: number } {
  const fields: FieldSchema[] = []
  let depth = 0
  let pendingDecorators: string[] = []
  let i = startLine

  // Find opening brace
  while (i < lines.length && !lines[i].includes("{")) i++
  if (i >= lines.length) return { fields, endLine: i }

  // Count the opening brace
  for (const ch of lines[i]) {
    if (ch === "{") depth++
    if (ch === "}") depth--
  }
  i++

  while (i < lines.length && depth > 0) {
    const line = lines[i].trim()

    // Track nested braces
    for (const ch of lines[i]) {
      if (ch === "{") depth++
      if (ch === "}") depth--
    }

    if (depth <= 0) break

    // Collect decorator lines
    const decoratorMatch = line.match(/^@(\w+)(\((.*))?$/)
    if (decoratorMatch) {
      // Accumulate multi-line decorators (e.g. @IsEnum(MyEnum) that spans lines)
      let decoratorLine = line
      // If parentheses are unclosed, keep reading
      let openParens = (decoratorLine.match(/\(/g) ?? []).length
      let closeParens = (decoratorLine.match(/\)/g) ?? []).length
      while (openParens > closeParens && i + 1 < lines.length) {
        i++
        decoratorLine += lines[i].trim()
        openParens += (lines[i].match(/\(/g) ?? []).length
        closeParens += (lines[i].match(/\)/g) ?? []).length
      }
      pendingDecorators.push(decoratorLine)
      i++
      continue
    }

    // Field declaration: `fieldName: Type`, `fieldName?: Type`, `fieldName!: Type` or `readonly fieldName: Type`
    const fieldMatch = line.match(/^(?:readonly\s+)?(\w+)[?!]?:\s*([\w\[\]<>|&\s]+?)(?:\s*=.*)?;?\s*$/)
    if (fieldMatch && pendingDecorators.length > 0 && depth === 1) {
      const fieldName = fieldMatch[1]
      const rawType   = fieldMatch[2].trim()
      const field = buildFieldSchema(fieldName, rawType, pendingDecorators)
      fields.push(field)
      pendingDecorators = []
      i++
      continue
    }

    // Non-decorator, non-field line clears pending decorators
    if (line && !line.startsWith("//") && !line.startsWith("*") && pendingDecorators.length > 0) {
      // Could be a method or nested class — reset
      if (line.includes("(") && line.includes(")")) {
        pendingDecorators = []
      }
    }

    i++
  }

  return { fields, endLine: i }
}

function buildFieldSchema(name: string, rawType: string, decorators: string[]): FieldSchema {
  const rules: ValidationRule[] = []

  // Infer base type from TypeScript type annotation
  const tsType = inferTsType(rawType)

  for (const dec of decorators) {
    rules.push(...parseDecorator(dec))
  }

  // If no explicit required/optional decorator, infer from TS optional marker
  const hasRequired = rules.some(r => r.kind === "required")
  const hasOptional = rules.some(r => r.kind === "optional")
  if (!hasRequired && !hasOptional) {
    // Default in class-validator: field is implicitly required when decorated
    rules.unshift({ kind: "required" })
  }

  return { name, type: tsType, rules }
}

function inferTsType(raw: string): FieldType {
  const t = raw.toLowerCase().replace(/\s/g, "")
  if (t === "string" || t === "string|null" || t === "null|string") return "string"
  if (t === "number" || t === "number|null" || t === "null|number") return "number"
  if (t === "boolean" || t === "boolean|null" || t === "null|boolean") return "boolean"
  if (t.endsWith("[]") || t.startsWith("array<")) return "array"
  if (t === "object" || t === "record<string,unknown>" || t === "record<string,any>") return "object"
  return "unknown"
}

// Maps decorator name → RuleKind (for zero-arg decorators)
const ZERO_ARG_RULES: Record<string, RuleKind> = {
  IsNotEmpty:       "required",
  IsOptional:       "optional",
  IsString:         "required",   // presence rule; type inferred from TS
  IsInt:            "integer",
  IsNumber:         "required",
  IsBoolean:        "boolean",
  IsEmail:          "email",
  IsUrl:            "url",
  IsUUID:           "uuid",
  IsArray:          "array",
  IsPositive:       "positive",
  IsNegative:       "negative",
  IsDefined:        "required",
  IsNotEmptyObject: "required",
  IsDate:           "date",
  IsDateString:     "date",
  IsPhoneNumber:    "phone",
  IsEthereumAddress: "ethereumAddress",
  IsAlphanumeric:   "alphanumeric",
  IsNumberString:   "numberString",
  ArrayNotEmpty:    "array",
}

/**
 * Parses one decorator line and returns 0, 1, or 2 validation rules.
 * Returns multiple rules for decorators like @Length(min, max).
 */
function parseDecorator(line: string): ValidationRule[] {
  // Strip leading @
  const body = line.startsWith("@") ? line.slice(1) : line

  // Extract name and args string
  const parenIdx = body.indexOf("(")
  const name     = parenIdx === -1 ? body : body.slice(0, parenIdx)
  const argsStr  = parenIdx === -1 ? "" : body.slice(parenIdx + 1, body.lastIndexOf(")"))

  // Zero-arg decorators
  if (name in ZERO_ARG_RULES) {
    return [{ kind: ZERO_ARG_RULES[name] }]
  }

  // Numeric-arg decorators
  const numArg = parseFloat(argsStr)
  switch (name) {
    case "Min":          return !isNaN(numArg) ? [{ kind: "min",          value: numArg }] : []
    case "Max":          return !isNaN(numArg) ? [{ kind: "max",          value: numArg }] : []
    case "MinLength":    return !isNaN(numArg) ? [{ kind: "minLength",    value: numArg }] : []
    case "MaxLength":    return !isNaN(numArg) ? [{ kind: "maxLength",    value: numArg }] : []
    case "ArrayMinSize": return !isNaN(numArg) ? [{ kind: "arrayMinSize", value: numArg }] : []
    case "ArrayMaxSize": return !isNaN(numArg) ? [{ kind: "arrayMaxSize", value: numArg }] : []

    case "Length": {
      // @Length(minLen, maxLen) → emit both rules
      const parts = argsStr.split(",").map(s => parseFloat(s.trim()))
      const rules: ValidationRule[] = []
      if (!isNaN(parts[0])) rules.push({ kind: "minLength", value: parts[0] })
      if (parts[1] !== undefined && !isNaN(parts[1])) rules.push({ kind: "maxLength", value: parts[1] })
      return rules
    }

    case "IsEnum": {
      const enumName = argsStr.trim()
      return enumName ? [{ kind: "enum", value: enumName }] : []
    }

    case "IsIn": {
      // @IsIn(['a', 'b', 'c']) — inline string array
      const values = parseStringArray(argsStr)
      // Always emit the rule; values may be empty if using a const reference
      return [{ kind: "isIn", value: values }]
    }

    case "Matches": {
      const regexMatch = argsStr.match(/^\/(.+)\/([gimsuy]*)$/)
      return regexMatch ? [{ kind: "regex", value: `/${regexMatch[1]}/${regexMatch[2]}` }] : []
    }
  }

  return []
}

/** Extracts string literals from an array expression like `['a', 'b']` or `["a","b"]`. */
function parseStringArray(argsStr: string): string[] {
  const arrayMatch = argsStr.match(/\[([^\]]*)\]/)
  if (!arrayMatch) return []
  return [...arrayMatch[1].matchAll(/['"]([^'"]*)['"]/g)].map(m => m[1])
}
