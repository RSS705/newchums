#!/usr/bin/env node
/**
 * Defensive guard for the Next.js 16 + OpenNext-Cloudflare middleware path.
 *
 * What this is no longer doing
 * ---------------------------
 * Earlier versions of this script tried to remove a stale
 * `functions["/_middleware"]` entry from `functions-config-manifest.json`
 * (and a later iteration tried to *synthesize* a `middleware["/"]` entry
 * in `middleware-manifest.json`). Both approaches existed because Next.js 16
 * defaults middleware/proxy to the **Node** runtime, which OpenNext's
 * Cloudflare adapter can't bundle. The Worker shipped without any
 * middleware wired, `x-request-path` was never set in production, and
 * any logged-out visit to `/communities` or `/events/[id]` redirected to
 * `/login?next=%2F`.
 *
 * The real fix
 * ------------
 * Declaring `export const runtime = "experimental-edge"` in
 * `web/src/middleware.ts` makes Next.js emit a proper Edge bundle that
 * OpenNext picks up natively. After that change, `middleware-manifest.json`
 * already contains a valid `middleware["/"]` entry and
 * `functions-config-manifest.json` no longer carries `/_middleware`.
 *
 * Why keep the script
 * -------------------
 * Two future-proofing reasons:
 *   1. If someone removes the `runtime` declaration from `middleware.ts`
 *      (or migrates back to `proxy.ts` before OpenNext supports it), Next
 *      will fall back to emitting `/_middleware` under
 *      `functions-config-manifest.json` and OpenNext will silently ship
 *      a Worker with no proxy. We detect that here and fail loudly so the
 *      regression is visible at deploy time, not at first user click.
 *   2. If a future Next/OpenNext version still needs the `/_middleware`
 *      entry stripped to take the right build branch, the cleanup logic
 *      stays a one-line change.
 *
 * If both manifests look correct (Edge entry present, no stale Node
 * entry), this script is a no-op.
 */
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(path.join(__dirname, ".."));
const debug = !!process.env.OPEN_NEXT_DEBUG;
function log(msg) {
  if (debug) console.log(`[patch-functions-config] ${msg}`);
}

const manifestPairs = [
  {
    label: ".next",
    fc: path.join(projectRoot, ".next", "server", "functions-config-manifest.json"),
    mw: path.join(projectRoot, ".next", "server", "middleware-manifest.json"),
  },
  {
    label: ".next/standalone",
    fc: path.join(projectRoot, ".next", "standalone", ".next", "server", "functions-config-manifest.json"),
    mw: path.join(projectRoot, ".next", "standalone", ".next", "server", "middleware-manifest.json"),
  },
];

let issues = 0;

for (const { label, fc, mw } of manifestPairs) {
  if (!fs.existsSync(fc) || !fs.existsSync(mw)) {
    log(`${label}: manifests not present yet, skipping`);
    continue;
  }

  const fcManifest = JSON.parse(fs.readFileSync(fc, "utf8"));
  const mwManifest = JSON.parse(fs.readFileSync(mw, "utf8"));

  const nodeEntry = fcManifest.functions && fcManifest.functions["/_middleware"];
  const edgeEntry = mwManifest.middleware && mwManifest.middleware["/"];

  if (edgeEntry && !nodeEntry) {
    log(`${label}: Edge middleware wired correctly, no patch needed`);
    continue;
  }

  if (!edgeEntry && !nodeEntry) {
    // No middleware at all in the build. Could be intentional (someone
    // deleted middleware.ts) but more likely the runtime declaration got
    // dropped. Worth flagging.
    log(
      `${label}: no middleware in either manifest. ` +
        `If middleware.ts exists, check that 'export const runtime = "experimental-edge"' is still there.`,
    );
    continue;
  }

  // Either edgeEntry is missing while nodeEntry exists (the original
  // bug), or both are present (something is in a weird half-state).
  // Both are signals the deploy will ship without working middleware.
  // Fail loudly rather than ship a silently-broken Worker.
  issues++;
  console.error(
    `[patch-functions-config] ${label}: middleware wiring is in a bad state.\n` +
      `  middleware-manifest middleware["/"]: ${edgeEntry ? "present" : "MISSING"}\n` +
      `  functions-config /_middleware: ${nodeEntry ? "PRESENT (stale)" : "missing"}\n` +
      `  Likely cause: middleware.ts is missing 'export const runtime = "experimental-edge"',\n` +
      `  or the file was moved back to proxy.ts (which Next.js 16 forces to Node runtime).\n` +
      `  See web/src/middleware.ts and web/scripts/patch-functions-config.js for context.`,
  );
}

if (issues > 0) {
  process.exit(1);
}
