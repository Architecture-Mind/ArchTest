import { parseDTOFile } from "../dto-parser"

const BASIC_DTO = `
import { IsEmail, IsNotEmpty, IsInt, Min, Max, MaxLength, IsOptional } from 'class-validator'

export class CreateUserDto {
  @IsNotEmpty()
  @MaxLength(50)
  name: string

  @IsEmail()
  email: string

  @IsInt()
  @Min(18)
  @Max(100)
  age: number

  @IsOptional()
  bio?: string
}
`

const MULTIPLE_CLASSES = `
export class CreatePostDto {
  @IsNotEmpty()
  @MaxLength(200)
  title: string

  @IsOptional()
  content?: string
}

export class UpdatePostDto {
  @IsOptional()
  @MaxLength(200)
  title?: string
}
`

const PLAIN_CLASS = `
export class SomeService {
  doSomething() { return true }
}
`

describe("parseDTOFile", () => {
  describe("basic field parsing", () => {
    it("extracts class name and file path", () => {
      const schemas = parseDTOFile(BASIC_DTO, "src/users/create-user.dto.ts")
      expect(schemas).toHaveLength(1)
      expect(schemas[0].className).toBe("CreateUserDto")
      expect(schemas[0].file).toBe("src/users/create-user.dto.ts")
    })

    it("extracts all fields", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const fields = schemas[0].fields.map(f => f.name)
      expect(fields).toContain("name")
      expect(fields).toContain("email")
      expect(fields).toContain("age")
      expect(fields).toContain("bio")
    })

    it("infers TypeScript types correctly", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const fieldMap = Object.fromEntries(schemas[0].fields.map(f => [f.name, f]))
      expect(fieldMap["name"].type).toBe("string")
      expect(fieldMap["email"].type).toBe("string")
      expect(fieldMap["age"].type).toBe("number")
    })
  })

  describe("validation rules", () => {
    it("extracts @IsEmail as email rule", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const email = schemas[0].fields.find(f => f.name === "email")!
      expect(email.rules.some(r => r.kind === "email")).toBe(true)
    })

    it("extracts @Min and @Max with values", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const age = schemas[0].fields.find(f => f.name === "age")!
      const minRule = age.rules.find(r => r.kind === "min")
      const maxRule = age.rules.find(r => r.kind === "max")
      expect(minRule?.value).toBe(18)
      expect(maxRule?.value).toBe(100)
    })

    it("extracts @MaxLength with value", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const name = schemas[0].fields.find(f => f.name === "name")!
      const rule = name.rules.find(r => r.kind === "maxLength")
      expect(rule?.value).toBe(50)
    })

    it("extracts @IsOptional as optional rule", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const bio = schemas[0].fields.find(f => f.name === "bio")!
      expect(bio.rules.some(r => r.kind === "optional")).toBe(true)
    })

    it("adds implicit required when no optional decorator", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const email = schemas[0].fields.find(f => f.name === "email")!
      expect(email.rules.some(r => r.kind === "required")).toBe(true)
    })

    it("does not add required when @IsOptional present", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const bio = schemas[0].fields.find(f => f.name === "bio")!
      expect(bio.rules.some(r => r.kind === "required")).toBe(false)
    })
  })

  describe("multiple classes in one file", () => {
    it("returns schema for each class", () => {
      const schemas = parseDTOFile(MULTIPLE_CLASSES, "dto.ts")
      expect(schemas).toHaveLength(2)
      expect(schemas.map(s => s.className)).toEqual(["CreatePostDto", "UpdatePostDto"])
    })

    it("does not bleed fields between classes", () => {
      const schemas = parseDTOFile(MULTIPLE_CLASSES, "dto.ts")
      const update = schemas.find(s => s.className === "UpdatePostDto")!
      expect(update.fields.map(f => f.name)).not.toContain("content")
    })
  })

  describe("plain class with no decorators", () => {
    it("returns empty schemas for non-DTO classes", () => {
      const schemas = parseDTOFile(PLAIN_CLASS, "service.ts")
      expect(schemas).toHaveLength(0)
    })
  })

  describe("integer type", () => {
    it("extracts @IsInt as integer rule", () => {
      const schemas = parseDTOFile(BASIC_DTO, "dto.ts")
      const age = schemas[0].fields.find(f => f.name === "age")!
      expect(age.rules.some(r => r.kind === "integer")).toBe(true)
    })
  })

  describe("definite assignment assertion (!)", () => {
    const DTO_WITH_BANG = `
import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator'

export class CreateComponentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  parentApp!: string;

  @IsOptional()
  @MaxLength(50)
  userRole?: string;
}
`
    it("parses fields with ! (non-null assertion) correctly", () => {
      const schemas = parseDTOFile(DTO_WITH_BANG, "dto.ts")
      expect(schemas).toHaveLength(1)
      const fields = schemas[0].fields.map(f => f.name)
      expect(fields).toContain("name")
      expect(fields).toContain("parentApp")
      expect(fields).toContain("userRole")
    })

    it("does not merge rules from required fields into optional ones", () => {
      const schemas = parseDTOFile(DTO_WITH_BANG, "dto.ts")
      const userRole = schemas[0].fields.find(f => f.name === "userRole")!
      const maxLength = userRole.rules.find(r => r.kind === "maxLength")
      // userRole should have maxLength 50, not name's 255
      expect(maxLength?.value).toBe(50)
    })

    it("extracts maxLength rule on ! field", () => {
      const schemas = parseDTOFile(DTO_WITH_BANG, "dto.ts")
      const name = schemas[0].fields.find(f => f.name === "name")!
      expect(name.rules.some(r => r.kind === "maxLength" && r.value === 255)).toBe(true)
    })
  })
})
