import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAtLeast18, parseDateOnly } from "@/lib/ageValidation";
import { sql } from "@/lib/db";

export const runtime = "edge";

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

    const body = (await request.json()) as { date_of_birth?: string };
    const trimmedDob = body.date_of_birth?.trim() ?? "";

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
    const todayMidnight = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
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
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = (await sql`
      SELECT id
      FROM users
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `) as { id: string }[];

    if (existingUser.length === 0) {
      return NextResponse.json(
        { ok: false, error: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    await sql`
      UPDATE users
      SET date_of_birth = ${parsedDob}
      WHERE id = ${existingUser[0].id}
    `;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("Date of birth update error:", err);
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
