import { encode } from "@auth/core/jwt";
import { readFileSync } from "node:fs";
const env = readFileSync(".env.local", "utf8");
const secret = /AUTH_SECRET="?([^"\n]+)"?/.exec(env)[1];
const uid = "56b366ab-53ac-4f1c-9e87-0dbf77dc8a8c";
const token = await encode({
  token: { email: "robsmith775@gmail.com", sub: uid, id: uid },
  secret,
  salt: "authjs.session-token",
});
console.log(token);
