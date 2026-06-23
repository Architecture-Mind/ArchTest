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

  describe("TypeScript type inference", () => {
    const TYPE_DTO = `
export class TypeDto {
  @IsArray()
  tags: string[]

  @IsArray()
  items: Array<string>

  @IsNotEmptyObject()
  meta: object

  @IsNotEmpty()
  data: SomeCustomType
}
`
    it("infers array type from [] suffix", () => {
      const schemas = parseDTOFile(TYPE_DTO, "dto.ts")
      const tags = schemas[0].fields.find(f => f.name === "tags")!
      expect(tags.type).toBe("array")
    })

    it("infers array type from Array<> syntax", () => {
      const schemas = parseDTOFile(TYPE_DTO, "dto.ts")
      const items = schemas[0].fields.find(f => f.name === "items")!
      expect(items.type).toBe("array")
    })

    it("infers object type for object fields", () => {
      const schemas = parseDTOFile(TYPE_DTO, "dto.ts")
      const meta = schemas[0].fields.find(f => f.name === "meta")!
      expect(meta.type).toBe("object")
    })

    it("falls back to unknown for unrecognized types", () => {
      const schemas = parseDTOFile(TYPE_DTO, "dto.ts")
      const data = schemas[0].fields.find(f => f.name === "data")!
      expect(data.type).toBe("unknown")
    })
  })

  describe("new validator decorators", () => {
    const NEW_VALIDATORS_DTO = `
import { IsIn, Length, IsDate, IsPhoneNumber, IsEthereumAddress, IsAlphanumeric, IsNumberString, Matches } from 'class-validator'

export class NewValidatorsDto {
  @IsIn(['active', 'inactive'])
  status: string

  @Length(3, 50)
  name: string

  @IsDate()
  createdAt: Date

  @IsPhoneNumber()
  phone: string

  @IsEthereumAddress()
  wallet: string

  @IsAlphanumeric()
  code: string

  @IsNumberString()
  zipCode: string

  @Matches(/^[A-Z]{3}$/)
  currency: string
}
`
    it("extracts @IsIn rule with values", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const status = schemas[0].fields.find(f => f.name === "status")!
      const rule = status.rules.find(r => r.kind === "isIn")
      expect(rule).toBeDefined()
      expect(Array.isArray(rule?.value)).toBe(true)
      expect((rule?.value as string[])).toContain("active")
    })

    it("extracts @Length(3, 50) as minLength + maxLength", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const name = schemas[0].fields.find(f => f.name === "name")!
      expect(name.rules.find(r => r.kind === "minLength")?.value).toBe(3)
      expect(name.rules.find(r => r.kind === "maxLength")?.value).toBe(50)
    })

    it("extracts @IsDate as date rule", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "createdAt")!
      expect(f.rules.some(r => r.kind === "date")).toBe(true)
    })

    it("extracts @IsPhoneNumber as phone rule", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "phone")!
      expect(f.rules.some(r => r.kind === "phone")).toBe(true)
    })

    it("extracts @IsEthereumAddress as ethereumAddress rule", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "wallet")!
      expect(f.rules.some(r => r.kind === "ethereumAddress")).toBe(true)
    })

    it("extracts @IsAlphanumeric as alphanumeric rule", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "code")!
      expect(f.rules.some(r => r.kind === "alphanumeric")).toBe(true)
    })

    it("extracts @IsNumberString as numberString rule", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "zipCode")!
      expect(f.rules.some(r => r.kind === "numberString")).toBe(true)
    })

    it("extracts @Matches regex", () => {
      const schemas = parseDTOFile(NEW_VALIDATORS_DTO, "dto.ts")
      const f = schemas[0].fields.find(f => f.name === "currency")!
      const rule = f.rules.find(r => r.kind === "regex")
      expect(rule).toBeDefined()
      expect(String(rule?.value)).toContain("[A-Z]")
    })
  })

  describe("multi-line decorators", () => {
    const MULTILINE_DTO = `
export class MultilineDto {
  @IsEnum(
    MyEnum
  )
  role: string
}
`
    it("handles decorator spanning multiple lines", () => {
      const schemas = parseDTOFile(MULTILINE_DTO, "dto.ts")
      expect(schemas).toHaveLength(1)
      const role = schemas[0].fields.find(f => f.name === "role")
      expect(role).toBeDefined()
      expect(role?.rules.some(r => r.kind === "enum")).toBe(true)
    })
  })

  describe("class with methods (method clears pending decorators)", () => {
    const DTO_WITH_METHOD = `
export class HybridDto {
  @IsNotEmpty()
  name: string

  @IsEmail()
  getEmail(): string {
    return this.email
  }

  @IsString()
  bio: string
}
`
    it("does not bleed decorator from method back to next field", () => {
      const schemas = parseDTOFile(DTO_WITH_METHOD, "dto.ts")
      expect(schemas).toHaveLength(1)
      const bio = schemas[0].fields.find(f => f.name === "bio")
      // bio should have @IsString but NOT @IsEmail which was consumed by the method
      expect(bio?.rules.some(r => r.kind === "email")).toBe(false)
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
