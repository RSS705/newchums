import { NextResponse } from "next/server";
import { hashSync } from "bcryptjs";
import { sql } from "@/lib/db";
import { isAtLeast18, parseDateOnly } from "@/lib/ageValidation";
import {
  normalizeUsernameForUniq,
  normalizeUsernameDisplay,
  validateUsername,
} from "@/lib/username";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { email, password, name, username: rawUsername, date_of_birth } =
      (await request.json()) as {
        email?: string;
        password?: string;
        name?: string;
        username?: string;
        date_of_birth?: string;
      };

    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedName = name?.trim() || null;

    const usernameValidation = validateUsername(rawUsername ?? "");
    if (!usernameValidation.valid) {
      return NextResponse.json(
        { ok: false, error: usernameValidation.error },
        { status: 400 }
      );
    }

    const trimmedDob = date_of_birth?.trim() ?? "";
    if (!trimmedDob) {
      return NextResponse.json(
        { ok: false, error: "REQUIRED", code: "REQUIRED" },
        { status: 400 }
      );
    }
    const parts = parseDateOnly(trimmedDob);
    if (!parts) {
      return NextResponse.json(
        { ok: false, error: "INVALID_DATE", code: "INVALID_DATE" },
        { status: 400 }
      );
    }
    const today = new Date();
    const birth = new Date(parts.y, parts.m - 1, parts.d);
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (birth > todayMidnight) {
      return NextResponse.json(
        { ok: false, error: "FUTURE_DATE", code: "FUTURE_DATE" },
        { status: 400 }
      );
    }
    if (!isAtLeast18(trimmedDob)) {
      return NextResponse.json(
        {
          ok: false,
          error: "UNDERAGE",
          code: "UNDERAGE",
          message: "NewChums is currently available to people 18 and older.",
        },
        { status: 400 }
      );
    }
    const parsedDob = `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}`;

    const usernameDisplay = normalizeUsernameDisplay(rawUsername!);
    const usernameNorm = normalizeUsernameForUniq(rawUsername!);

    if (!normalizedEmail || !password || password.length < 8) {
      return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
    }

    const existingEmail = (await sql`
      SELECT id
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `) as { id: string }[];

    if (existingEmail.length > 0) {
      return NextResponse.json({ ok: false, error: "EMAIL_EXISTS" }, { status: 409 });
    }

    const existingUsername = (await sql`
      SELECT id
      FROM users
      WHERE username_norm = ${usernameNorm}
      LIMIT 1
    `) as { id: string }[];

    if (existingUsername.length > 0) {
      return NextResponse.json(
        { ok: false, error: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }

    const passwordHash = hashSync(password, 10);

    await sql`
      INSERT INTO users (email, name, username, username_norm, password_hash, date_of_birth)
      VALUES (${normalizedEmail}, ${normalizedName}, ${usernameDisplay}, ${usernameNorm}, ${passwordHash}, ${parsedDob})
    `;

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isMissingColumn =
      msg.includes('column "date_of_birth"') ||
      msg.includes('column "username_norm"') ||
      msg.includes('column "username"') ||
      (msg.includes("date_of_birth") && msg.includes("does not exist")) ||
      (msg.includes("username_norm") && msg.includes("does not exist")) ||
      (msg.includes("username") && msg.includes("does not exist"));
    if (isMissingColumn) {
      const debugMsg = err instanceof Error ? err.message : String(err);
      console.error(
        "Signup error: username/username_norm/date_of_birth column missing. Apply migrations 003, 004, 005. Raw:",
        err
      );
      const body: { ok: false; error: string; debug?: string } = {
        ok: false,
        error: "SERVER_ERROR",
      };
      if (process.env.NODE_ENV !== "production") {
        body.debug = debugMsg;
      }
      return NextResponse.json(body, { status: 500 });
    }
    const isEmailUniqueViolation =
      msg.includes("users_email_key") ||
      (msg.includes("email") && (msg.includes("duplicate key value") || msg.includes("unique constraint")));
    if (isEmailUniqueViolation) {
      return NextResponse.json(
        { ok: false, error: "EMAIL_EXISTS" },
        { status: 409 }
      );
    }
    const isUsernameUniqueViolation =
      msg.includes("idx_users_username_norm") ||
      msg.includes("users_username_norm") ||
      (msg.includes("username_norm") && (msg.includes("duplicate key value") || msg.includes("unique constraint")));
    if (isUsernameUniqueViolation) {
      return NextResponse.json(
        { ok: false, error: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }
    const debugMsg = err instanceof Error ? err.message : String(err);
    console.error("Signup error:", err);
    const body: { ok: false; error: string; debug?: string } = {
      ok: false,
      error: "SERVER_ERROR",
    };
    if (process.env.NODE_ENV !== "production") {
      body.debug = debugMsg;
    }
    return NextResponse.json(body, { status: 500 });
  }
}
