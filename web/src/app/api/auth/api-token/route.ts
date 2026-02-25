/**
 * Returns a short-lived JWT for API worker requests.
 * Client calls this (with cookies) to get a token, then passes it as
 * Authorization: Bearer <token> when calling the API worker.
 * Uses auth() to obtain session, then mints a standard JWT with jose.
 */

import { auth } from "@/auth";
import { SignJWT } from "jose";
import { NextResponse } from "next/server";

const TOKEN_EXPIRY_SECONDS = 15 * 60; // 15 minutes

export async function GET() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED", message: "No session or missing user email" },
      { status: 401 }
    );
  }

  const user = session.user as { id?: string; email: string; name?: string | null };
  const id = user.id ?? user.email;
  const sessionWithProvider = session as { provider?: string };
  const provider = sessionWithProvider.provider ?? null;

  const token = await new SignJWT({
    email: session.user.email,
    id,
    name: user.name ?? null,
    ...(provider ? { provider } : {}),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ ok: true, token });
}
