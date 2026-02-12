import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sql } from "@/lib/db";
import { hashResetToken } from "@/lib/resetTokens";

export const runtime = "edge";

export async function POST(request: Request) {
  const { token, password } = (await request.json()) as {
    token?: string;
    password?: string;
  };

  if (!token || !password || password.length < 8) {
    return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
  }

  const tokenHash = await hashResetToken(token);

  const tokens = (await sql`
    SELECT id, user_id
    FROM password_reset_tokens
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as { id: string; user_id: string }[];

  const record = tokens[0];
  if (!record) {
    return NextResponse.json({ ok: false, error: "INVALID_OR_EXPIRED" }, { status: 400 });
  }

  const passwordHash = await hash(password, 10);

  await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${record.user_id}`;
  await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${record.id}`;

  return NextResponse.json({ ok: true });
}
