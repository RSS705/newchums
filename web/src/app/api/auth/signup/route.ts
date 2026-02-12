import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { sql } from "@/lib/db";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { email, password, name } = (await request.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedName = name?.trim() || null;

    if (!normalizedEmail || !password || password.length < 8) {
      return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
    }

    const existing = (await sql`
      SELECT id
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `) as { id: string }[];

    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: "EMAIL_EXISTS" }, { status: 409 });
    }

    const passwordHash = await hash(password, 10);

    await sql`
      INSERT INTO users (email, name, password_hash)
      VALUES (${normalizedEmail}, ${normalizedName}, ${passwordHash})
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Signup error:", err);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
