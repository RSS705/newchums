import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateResetToken, hashResetToken } from "@/lib/resetTokens";

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return NextResponse.json({ ok: true });
  }

  const users = (await sql`
    SELECT id, password_hash FROM users WHERE email = ${normalizedEmail} LIMIT 1
  `) as { id: string; password_hash: string | null }[];

  const user = users[0];
  let resetUrl: string | undefined;

  if (user && user.password_hash) {
    const rawToken = generateResetToken();
    const tokenHash = await hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.id}, ${tokenHash}, ${expiresAt})
    `;

    const origin = new URL(request.url).origin;
    resetUrl = `${origin}/reset-password?token=${rawToken}`;
  }

  if (process.env.NODE_ENV !== "production") {
    return NextResponse.json({ ok: true, ...(resetUrl ? { resetUrl } : {}) });
  }

  return NextResponse.json({ ok: true });
}
