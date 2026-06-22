import { build } from "esbuild"

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/index.cjs",
  external: [],
  banner: { js: "#!/usr/bin/env node" },
})

console.log("Done → dist/index.cjs")
