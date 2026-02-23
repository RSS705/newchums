#!/usr/bin/env node
/**
 * Patches functions-config-manifest.json so OpenNext accepts our Edge middleware.
 * Next.js 16 outputs /_middleware with runtime "nodejs", causing OpenNext to fail.
 * OpenNext checks: if middleware["/"] exists -> Edge (OK); if functions["/_middleware"]
 * exists -> Node (fail). We remove /_middleware so OpenNext treats it as Edge
 * (middleware.js still exists; createMiddleware builds from that).
 *
 * Uses project root from script location (__dirname) so it works when invoked
 * from monorepo root, WSL, or any cwd.
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(path.join(__dirname, ".."));
const manifests = [
  path.join(projectRoot, ".next", "server", "functions-config-manifest.json"),
  path.join(projectRoot, ".next", "standalone", ".next", "server", "functions-config-manifest.json"),
];

let patched = 0;
for (const manifestPath of manifests) {
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.functions && manifest.functions["/_middleware"]) {
    delete manifest.functions["/_middleware"];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    patched++;
  }
}
if (patched > 0 && process.env.OPEN_NEXT_DEBUG) {
  console.log(`[patch-functions-config] Removed /_middleware from ${patched} manifest(s)`);
}
