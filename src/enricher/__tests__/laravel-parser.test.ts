import { parseLaravelRequests } from "../laravel-parser"

// ── Basic pipe-separated rules ────────────────────────────────────────────────

const BASIC_REQUEST = `<?php
namespace App\\Http\\Requests;

use Illuminate\\Foundation\\Http\\FormRequest;

class CreateUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'  => 'required|string|max:50|min:3',
            'email' => 'required|email|max:255',
            'age'   => 'required|integer|min:18|max:100',
        ];
    }
}
`

describe("parseLaravelRequests — basic rules", () => {
  const schemas = parseLaravelRequests(BASIC_REQUEST, "app/Http/Requests/CreateUserRequest.php")

  it("extracts the class name", () => {
    expect(schemas).toHaveLength(1)
    expect(schemas[0].className).toBe("CreateUserRequest")
  })

  it("extracts all fields", () => {
    const names = schemas[0].fields.map(f => f.name)
    expect(names).toContain("name")
    expect(names).toContain("email")
    expect(names).toContain("age")
  })

  it("maps 'required' rule", () => {
    const email = schemas[0].fields.find(f => f.name === "email")!
    expect(email.rules.some(r => r.kind === "required")).toBe(true)
  })

  it("maps 'email' rule", () => {
    const email = schemas[0].fields.find(f => f.name === "email")!
    expect(email.rules.some(r => r.kind === "email")).toBe(true)
  })

  it("maps 'integer' rule", () => {
    const age = schemas[0].fields.find(f => f.name === "age")!
    expect(age.rules.some(r => r.kind === "integer")).toBe(true)
  })

  it("maps 'min:X' on string field as minLength", () => {
    const name = schemas[0].fields.find(f => f.name === "name")!
    expect(name.rules.find(r => r.kind === "minLength")?.value).toBe(3)
  })

  it("maps 'max:X' on string field as maxLength", () => {
    const name = schemas[0].fields.find(f => f.name === "name")!
    expect(name.rules.find(r => r.kind === "maxLength")?.value).toBe(50)
  })

  it("maps 'min:X' on integer field as min", () => {
    const age = schemas[0].fields.find(f => f.name === "age")!
    expect(age.rules.find(r => r.kind === "min")?.value).toBe(18)
  })

  it("maps 'max:X' on integer field as max", () => {
    const age = schemas[0].fields.find(f => f.name === "age")!
    expect(age.rules.find(r => r.kind === "max")?.value).toBe(100)
  })

  it("infers string type from 'string' rule", () => {
    const name = schemas[0].fields.find(f => f.name === "name")!
    expect(name.type).toBe("string")
  })

  it("infers number type from 'integer' rule", () => {
    const age = schemas[0].fields.find(f => f.name === "age")!
    expect(age.type).toBe("number")
  })
})

// ── nullable / sometimes / in: ────────────────────────────────────────────────

const ADVANCED_REQUEST = `<?php
class UpdateUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'role'   => 'required|in:admin,user,moderator',
            'bio'    => 'nullable|string|max:500',
            'status' => 'sometimes|in:active,inactive',
            'code'   => 'required|regex:/^[A-Z]{3}$/',
            'url'    => 'required|url',
            'uid'    => 'required|uuid',
        ];
    }
}
`

describe("parseLaravelRequests — advanced rules", () => {
  const schemas = parseLaravelRequests(ADVANCED_REQUEST, "request.php")

  it("maps 'in:a,b,c' to isIn rule with values", () => {
    const role = schemas[0].fields.find(f => f.name === "role")!
    const rule = role.rules.find(r => r.kind === "isIn")
    expect(rule).toBeDefined()
    expect(rule?.value).toEqual(["admin", "user", "moderator"])
  })

  it("maps 'nullable' to optional", () => {
    const bio = schemas[0].fields.find(f => f.name === "bio")!
    expect(bio.rules.some(r => r.kind === "optional")).toBe(true)
    expect(bio.rules.some(r => r.kind === "required")).toBe(false)
  })

  it("maps 'sometimes' to optional", () => {
    const status = schemas[0].fields.find(f => f.name === "status")!
    expect(status.rules.some(r => r.kind === "optional")).toBe(true)
  })

  it("maps 'regex:/pattern/' to regex rule", () => {
    const code = schemas[0].fields.find(f => f.name === "code")!
    const rule = code.rules.find(r => r.kind === "regex")
    expect(rule).toBeDefined()
    expect(String(rule?.value)).toContain("[A-Z]")
  })

  it("maps 'url' rule", () => {
    const url = schemas[0].fields.find(f => f.name === "url")!
    expect(url.rules.some(r => r.kind === "url")).toBe(true)
  })

  it("maps 'uuid' rule", () => {
    const uid = schemas[0].fields.find(f => f.name === "uid")!
    expect(uid.rules.some(r => r.kind === "uuid")).toBe(true)
  })
})

// ── Array syntax ──────────────────────────────────────────────────────────────

const ARRAY_SYNTAX_REQUEST = `<?php
class ArraySyntaxRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:255'],
            'age'   => ['required', 'integer', 'min:18'],
        ];
    }
}
`

describe("parseLaravelRequests — array syntax", () => {
  const schemas = parseLaravelRequests(ARRAY_SYNTAX_REQUEST, "request.php")

  it("parses array syntax rules for email field", () => {
    const email = schemas[0].fields.find(f => f.name === "email")!
    expect(email.rules.some(r => r.kind === "required")).toBe(true)
    expect(email.rules.some(r => r.kind === "email")).toBe(true)
    expect(email.rules.find(r => r.kind === "maxLength")?.value).toBe(255)
  })

  it("parses array syntax rules for age field", () => {
    const age = schemas[0].fields.find(f => f.name === "age")!
    expect(age.rules.some(r => r.kind === "integer")).toBe(true)
    expect(age.rules.find(r => r.kind === "min")?.value).toBe(18)
  })
})

// ── Non-FormRequest class ─────────────────────────────────────────────────────

const PLAIN_CLASS = `<?php
class SomeService
{
    public function doSomething(): void {}
}
`

describe("parseLaravelRequests — non-FormRequest", () => {
  it("returns empty array for classes not extending FormRequest", () => {
    const schemas = parseLaravelRequests(PLAIN_CLASS, "service.php")
    expect(schemas).toHaveLength(0)
  })
})
