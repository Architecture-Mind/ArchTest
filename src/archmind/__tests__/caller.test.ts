import { ArchmindCaller, ArchmindNotFoundError, ArchmindRunError } from "../caller"
import * as child_process from "child_process"

jest.mock("child_process")

const mockSpawnSync = child_process.spawnSync as jest.MockedFunction<typeof child_process.spawnSync>

const TRACE_OUTPUT = {
  framework: "nestjs",
  routes_found: 2,
  graphs: [
    { entrypoint: "GET /users",  method: "GET",  path: "/users", nodes: [], edges: [], annotations: [] },
    { entrypoint: "POST /users", method: "POST", path: "/users", nodes: [], edges: [], annotations: [] },
  ],
}

const FINDINGS_OUTPUT = [
  { route: "POST /users", finding: { type: "missing_authorization", severity: "high", summary: "No auth gate" } },
]

describe("ArchmindCaller", () => {
  // Pass explicit bin to isolate spawn logic from bin-resolution logic
  const caller = new ArchmindCaller({ projectRoot: "/fake/project", bin: "archmind" })

  beforeEach(() => jest.clearAllMocks())

  describe("trace()", () => {
    it("returns parsed graphs on success", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: JSON.stringify(TRACE_OUTPUT),
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      })

      const result = caller.trace()

      expect(result.framework).toBe("nestjs")
      expect(result.graphs).toHaveLength(2)
      expect(mockSpawnSync).toHaveBeenCalledWith(
        "archmind",
        ["trace", "--project", "/fake/project", "--json"],
        expect.objectContaining({ encoding: "utf-8" })
      )
    })

    it("throws ArchmindNotFoundError when binary missing", () => {
      mockSpawnSync.mockReturnValue({
        status: null,
        stdout: "",
        stderr: "",
        pid: 0,
        output: [],
        signal: null,
        error: new Error("ENOENT"),
      })

      expect(() => caller.trace()).toThrow(ArchmindNotFoundError)
    })

    it("throws ArchmindRunError on non-zero exit", () => {
      mockSpawnSync.mockReturnValue({
        status: 2,
        stdout: "",
        stderr: "--project is required",
        pid: 1,
        output: [],
        signal: null,
      })

      expect(() => caller.trace()).toThrow(ArchmindRunError)
    })

    it("throws ArchmindRunError on empty output", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: "",
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      })

      expect(() => caller.trace()).toThrow(ArchmindRunError)
    })
  })

  describe("findings()", () => {
    it("returns parsed findings even when exit code is 1", () => {
      mockSpawnSync.mockReturnValue({
        status: 1,
        stdout: JSON.stringify(FINDINGS_OUTPUT),
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      })

      const result = caller.findings()

      expect(result).toHaveLength(1)
      expect(result[0].finding.type).toBe("missing_authorization")
    })

    it("returns empty array when no findings (exit code 0)", () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: JSON.stringify([]),
        stderr: "",
        pid: 1,
        output: [],
        signal: null,
      })

      const result = caller.findings()
      expect(result).toHaveLength(0)
    })
  })
})
