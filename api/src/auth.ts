/**
 * Verifies JWT from Authorization: Bearer header.
 * Supports: (1) jose-signed API token from web api-token route, (2) Auth.js session JWT.
 */

import { decode } from "@auth/core/jwt";
import { jwtVerify } from "jose";

const AUTH_COOKIE_SALTS = [
  "authjs.session-token", // HTTP / localhost
  "__Secure-authjs.session-token", // HTTPS production
] as const;

export type AuthPayload = {
  email?: string | null;
  name?: string | null;
  sub?: string;
  id?: string;
  [key: string]: unknown;
};

export async function verifyAuthToken(
  token: string,
  secret: string
): Promise<AuthPayload | null> {
  // 1) Try jose-verified API token (from web GET /api/auth/api-token)
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );
    if (payload?.email && typeof payload.email === "string") {
      return {
        email: payload.email,
        id: payload.id as string | undefined,
        name: (payload.name as string | null) ?? null,
        sub: payload.sub as string | undefined,
        ...payload,
      } as AuthPayload;
    }
  } catch {
    // Fall through to Auth.js decode
  }

  // 2) Try Auth.js session JWT
  for (const salt of AUTH_COOKIE_SALTS) {
    try {
      const payload = await decode({
        token,
        secret,
        salt,
      });
      if (payload) return payload as AuthPayload;
    } catch {
      continue;
    }
  }
  return null;
}

export function getBearerToken(
  req: Request | { header?: (name: string) => string | undefined; headers?: Headers }
): string | null {
  const auth =
    typeof req.header === "function"
      ? req.header("Authorization")
      : req.headers?.get?.("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}
