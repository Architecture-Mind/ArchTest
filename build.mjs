import { build } from "esbuild"

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/index.cjs",
  // These packages have native addons (tree-sitter-php) or very large deps (ts-morph).
  // Mark them as external — Node.js resolves them at runtime from node_modules.
  external: [
    "@kidkender/archmind-nestjs-parser",
    "@kidkender/archmind-laravel-parser",
  ],
  banner: { js: "#!/usr/bin/env node" },
})

console.log("Done → dist/index.cjs")
