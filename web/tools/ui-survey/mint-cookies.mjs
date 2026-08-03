// Mints Auth.js session cookies for the seeded survey roles and writes them
// as JSON to the given path. Must be run with web/ as the working directory
// so @auth/core resolves (node import resolution is script-location + cwd
// dependent for the package lookup; the npm script handles this).
//
// Usage: node tools/ui-survey/mint-cookies.mjs <out.json>
//
// Contains no secrets: AUTH_SECRET is read from web/.env.local at runtime.
import { encode } from "@auth/core/jwt";
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
if (!out) {
  console.error("usage: node tools/ui-survey/mint-cookies.mjs <out.json>");
  process.exit(1);
}
const env = readFileSync(".env.local", "utf8");
const secret = /AUTH_SECRET="?([^"\n]+)"?/.exec(env)?.[1];
if (!secret) {
  console.error("AUTH_SECRET not found in web/.env.local");
  process.exit(1);
}

// Keep in sync with seed.sql.
const users = {
  host: ["host@uitest.local", "00000000-0000-4000-9100-000000000001"],
  att1: ["att1@uitest.local", "00000000-0000-4000-9100-000000000002"],
  invitee: ["invitee@uitest.local", "00000000-0000-4000-9100-00000000000b"],
  fresh: ["fresh@uitest.local", "00000000-0000-4000-9100-00000000000c"],
  admin: ["admin@uitest.local", "00000000-0000-4000-9100-00000000000d"],
  onboard: ["onboard@uitest.local", "00000000-0000-4000-9100-00000000000e"],
};

const cookies = {};
for (const [role, [email, uid]] of Object.entries(users)) {
  cookies[role] = await encode({
    token: { email, sub: uid, id: uid },
    secret,
    salt: "authjs.session-token",
  });
}
writeFileSync(out, JSON.stringify(cookies));
console.log("minted roles:", Object.keys(cookies).join(", "));
