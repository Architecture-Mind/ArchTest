import { detectFramework } from "../framework-detector"
import * as fs from "fs"
import { join } from "path"

jest.mock("fs")

const mockExistsSync    = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>
const mockReadFileSync  = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>

const ROOT = join("C:", "fake", "project")

function existsOnly(paths: string[]): void {
  mockExistsSync.mockImplementation((p) => paths.includes(String(p)))
}

function stubFile(filePath: string, content: unknown): void {
  mockReadFileSync.mockImplementation((p) => {
    if (String(p) === filePath) return JSON.stringify(content)
    throw new Error(`Unexpected readFileSync: ${p}`)
  })
}

describe("detectFramework()", () => {
  beforeEach(() => jest.clearAllMocks())

  describe("NestJS detection", () => {
    it("returns nestjs when nest-cli.json exists", () => {
      existsOnly([join(ROOT, "nest-cli.json")])

      expect(detectFramework(ROOT)).toBe("nestjs")
    })

    it("returns nestjs when package.json has @nestjs/core in dependencies", () => {
      existsOnly([join(ROOT, "package.json")])
      stubFile(join(ROOT, "package.json"), {
        dependencies: { "@nestjs/core": "^10.0.0", express: "^4.0.0" },
      })

      expect(detectFramework(ROOT)).toBe("nestjs")
    })

    it("returns nestjs when @nestjs/core is in devDependencies", () => {
      existsOnly([join(ROOT, "package.json")])
      stubFile(join(ROOT, "package.json"), {
        devDependencies: { "@nestjs/core": "^10.0.0" },
      })

      expect(detectFramework(ROOT)).toBe("nestjs")
    })

    it("prefers nest-cli.json over package.json check", () => {
      existsOnly([join(ROOT, "nest-cli.json"), join(ROOT, "package.json")])
      stubFile(join(ROOT, "package.json"), { dependencies: {} })

      expect(detectFramework(ROOT)).toBe("nestjs")
      expect(mockReadFileSync).not.toHaveBeenCalled()
    })
  })

  describe("Laravel detection", () => {
    it("returns laravel when composer.json has laravel/framework", () => {
      existsOnly([join(ROOT, "composer.json")])
      stubFile(join(ROOT, "composer.json"), {
        require: { "laravel/framework": "^11.0" },
      })

      expect(detectFramework(ROOT)).toBe("laravel")
    })

    it("returns laravel when composer.json has laravel/lumen-framework", () => {
      existsOnly([join(ROOT, "composer.json")])
      stubFile(join(ROOT, "composer.json"), {
        require: { "laravel/lumen-framework": "^10.0" },
      })

      expect(detectFramework(ROOT)).toBe("laravel")
    })
  })

  describe("unknown fallback", () => {
    it("returns unknown when no framework marker is found", () => {
      existsOnly([])

      expect(detectFramework(ROOT)).toBe("unknown")
    })

    it("returns unknown when package.json exists but has no @nestjs/core", () => {
      existsOnly([join(ROOT, "package.json")])
      stubFile(join(ROOT, "package.json"), {
        dependencies: { express: "^4.0.0" },
      })

      expect(detectFramework(ROOT)).toBe("unknown")
    })

    it("returns unknown when composer.json has no laravel dependency", () => {
      existsOnly([join(ROOT, "composer.json")])
      stubFile(join(ROOT, "composer.json"), {
        require: { "symfony/framework-bundle": "^6.0" },
      })

      expect(detectFramework(ROOT)).toBe("unknown")
    })

    it("returns unknown when package.json is malformed JSON", () => {
      existsOnly([join(ROOT, "package.json")])
      mockReadFileSync.mockReturnValue("{ not valid json")

      expect(detectFramework(ROOT)).toBe("unknown")
    })

    it("returns unknown when composer.json is malformed JSON", () => {
      existsOnly([join(ROOT, "composer.json")])
      mockReadFileSync.mockReturnValue("{ broken")

      expect(detectFramework(ROOT)).toBe("unknown")
    })
  })
})
