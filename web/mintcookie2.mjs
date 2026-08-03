import { encode } from "@auth/core/jwt";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const secret = /AUTH_SECRET="?([^"\n]+)"?/.exec(env)[1];
const uid = "00000000-0000-4000-9000-000000000001";
console.log(await encode({ token: { email: "h1-happy@nudgetest.local", sub: uid, id: uid }, secret, salt: "authjs.session-token" }));
