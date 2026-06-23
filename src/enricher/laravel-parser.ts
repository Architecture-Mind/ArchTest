import type { DTOSchema, FieldSchema, FieldType, ValidationRule } from "./types"

// Matches: class FooRequest extends FormRequest
const CLASS_PATTERN = /class\s+(\w+)\s+extends\s+FormRequest/g

// Finds the start of rules(): array { return [
const RULES_RETURN_PATTERN = /public\s+function\s+rules\s*\(\s*\)[^{]*\{[^[]*return\s*\[/s

// Pipe-syntax: 'field' => 'rule1|rule2'
const PIPE_ENTRY = /['"](\w+)['"]\s*=>\s*'([^']+)'/g

// Array-syntax: 'field' => ['rule1', 'rule2', ...]
const ARRAY_ENTRY_START = /['"](\w+)['"]\s*=>\s*\[/g

/**
 * Parses a PHP file and extracts DTOSchema[] from FormRequest classes.
 * Uses regex + bracket-counting — no PHP AST required.
 */
export function parseLaravelRequests(content: string, relPath: string): DTOSchema[] {
  const schemas: DTOSchema[] = []

  CLASS_PATTERN.lastIndex = 0
  let classMatch: RegExpExecArray | null

  while ((classMatch = CLASS_PATTERN.exec(content)) !== null) {
    const className  = classMatch[1]
    const afterClass = content.slice(classMatch.index)

    // Find "return [" inside rules()
    const returnMatch = RULES_RETURN_PATTERN.exec(afterClass)
    if (!returnMatch) continue

    // The "[" is at the end of the match — bracket-count to find matching "]"
    const openBracketPos = classMatch.index + returnMatch[0].length - 1
    const rulesBody      = extractBracketedContent(content, openBracketPos)
    if (rulesBody === null) continue

    const fields = parseRulesBody(rulesBody)
    if (fields.length > 0) {
      schemas.push({ className, file: relPath, fields })
    }
  }

  return schemas
}

/**
 * Starting at the `[` at `startPos`, counts brackets to find the matching `]`
 * and returns the content between them.
 */
function extractBracketedContent(content: string, startPos: number): string | null {
  let depth = 0
  let i = startPos
  while (i < content.length) {
    if (content[i] === "[") depth++
    else if (content[i] === "]") {
      depth--
      if (depth === 0) return content.slice(startPos + 1, i)
    }
    i++
  }
  return null
}

function parseRulesBody(body: string): FieldSchema[] {
  const fields: FieldSchema[] = []
  const pipeEntries = new Map<string, string>()

  // Pipe-syntax: 'field' => 'rule1|rule2'
  {
    const re = new RegExp(PIPE_ENTRY.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      pipeEntries.set(m[1], m[2])
      fields.push(buildField(m[1], m[2].split("|").map(s => s.trim()).filter(Boolean)))
    }
  }

  // Array-syntax: 'field' => ['rule1', 'rule2', ...]
  // Use bracket-counting to handle values that contain ]
  {
    const re = new RegExp(ARRAY_ENTRY_START.source, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      const name = m[1]
      if (pipeEntries.has(name)) continue
      // The "[" is the last char of the match
      const bracketStart = m.index + m[0].length - 1
      const inner = extractBracketedContent(body, bracketStart)
      if (inner === null) continue
      const parts = extractStringLiterals(inner)
      fields.push(buildField(name, parts))
    }
  }

  return fields
}

function extractStringLiterals(arrayBody: string): string[] {
  const parts: string[] = []
  const re = /['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(arrayBody)) !== null) {
    parts.push(m[1])
  }
  return parts
}

function buildField(name: string, ruleParts: string[]): FieldSchema {
  const rules: ValidationRule[] = []
  let inferredType: FieldType = "string"

  for (const part of ruleParts) {
    // Type hints — affect min/max interpretation
    if (part === "integer" || part === "numeric") {
      inferredType = "number"
      if (part === "integer") rules.push({ kind: "integer" })
      continue
    }
    if (part === "boolean") {
      inferredType = "boolean"
      rules.push({ kind: "boolean" })
      continue
    }
    if (part === "array") {
      inferredType = "array"
      rules.push({ kind: "array" })
      continue
    }
    if (part === "string") {
      // inferredType already "string"
      continue
    }

    // Optional markers
    if (part === "nullable" || part === "sometimes") {
      rules.push({ kind: "optional" })
      continue
    }

    // Simple zero-arg rules
    const ZERO: Record<string, string> = {
      required: "required",
      email:    "email",
      url:      "url",
      uuid:     "uuid",
      alpha:    "alphanumeric",
      alpha_num:"alphanumeric",
      date:     "date",
    }
    if (part in ZERO) {
      rules.push({ kind: ZERO[part] as ValidationRule["kind"] })
      continue
    }

    // min:N and max:N — interpretation depends on inferred type
    const minMatch = part.match(/^min:(\d+(?:\.\d+)?)$/)
    if (minMatch) {
      const val = parseFloat(minMatch[1])
      rules.push({ kind: inferredType === "number" ? "min" : "minLength", value: val })
      continue
    }
    const maxMatch = part.match(/^max:(\d+(?:\.\d+)?)$/)
    if (maxMatch) {
      const val = parseFloat(maxMatch[1])
      rules.push({ kind: inferredType === "number" ? "max" : "maxLength", value: val })
      continue
    }

    // in:a,b,c
    const inMatch = part.match(/^in:(.+)$/)
    if (inMatch) {
      const values = inMatch[1].split(",").map(s => s.trim())
      rules.push({ kind: "isIn", value: values })
      continue
    }

    // regex:/pattern/flags
    const regexMatch = part.match(/^regex:(.+)$/)
    if (regexMatch) {
      rules.push({ kind: "regex", value: regexMatch[1] })
      continue
    }

    // between:min,max
    const betweenMatch = part.match(/^between:(\d+),(\d+)$/)
    if (betweenMatch) {
      const lo = parseFloat(betweenMatch[1])
      const hi = parseFloat(betweenMatch[2])
      if (inferredType === "number") {
        rules.push({ kind: "min", value: lo })
        rules.push({ kind: "max", value: hi })
      } else {
        rules.push({ kind: "minLength", value: lo })
        rules.push({ kind: "maxLength", value: hi })
      }
      continue
    }
  }

  // If no explicit optional, and required present or no marker at all — keep as-is
  // (class-validator convention: required by default when decorated)

  return { name, type: inferredType, rules }
}
