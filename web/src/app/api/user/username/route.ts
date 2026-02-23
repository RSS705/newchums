import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import {
  normalizeUsernameForUniq,
  normalizeUsernameDisplay,
  validateUsername,
} from "@/lib/username";

export async function POST(request: Request) {
  try {
    const session = await auth();
    const email = (session?.user as { email?: string })?.email;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = (await request.json()) as { username?: string };
    const usernameValidation = validateUsername(body.username ?? "");

    if (!usernameValidation.valid) {
      return NextResponse.json(
        { ok: false, error: usernameValidation.error },
        { status: 400 }
      );
    }

    const usernameDisplay = normalizeUsernameDisplay(body.username!);
    const usernameNorm = normalizeUsernameForUniq(body.username!);

    const existingUser = (await sql`
      SELECT id, username
      FROM users
      WHERE email = ${email.trim().toLowerCase()}
      LIMIT 1
    `) as { id: string; username: string | null }[];

    if (existingUser.length === 0) {
      return NextResponse.json(
        { ok: false, error: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const existingUsername = (await sql`
      SELECT id
      FROM users
      WHERE username_norm = ${usernameNorm}
      AND id != ${existingUser[0].id}
      LIMIT 1
    `) as { id: string }[];

    if (existingUsername.length > 0) {
      return NextResponse.json(
        { ok: false, error: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }

    await sql`
      UPDATE users
      SET username = ${usernameDisplay}, username_norm = ${usernameNorm}
      WHERE id = ${existingUser[0].id}
    `;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMissingColumn =
      msg.includes('column "username_norm"') ||
      (msg.includes("username_norm") && msg.includes("does not exist"));
    if (isMissingColumn) {
      console.error(
        "Username update failed: username_norm column missing. Apply migration 004_add_username_norm.sql"
      );
      return NextResponse.json(
        { ok: false, error: "SERVER_ERROR" },
        { status: 500 }
      );
    }
    const isUniqueViolation =
      msg.includes("idx_users_username_norm") ||
      msg.includes("users_username_norm") ||
      msg.includes("duplicate key value") ||
      msg.includes("unique constraint");
    if (isUniqueViolation) {
      return NextResponse.json(
        { ok: false, error: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }
    console.error("Username update error:", err);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
