import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

type InterestRow = { id: string; name: string; category: string; slug: string; sort_order: number };

export async function GET() {
  try {
    const rows = (await sql`
      SELECT id, name, category, slug, sort_order
      FROM interests
      ORDER BY sort_order ASC, name ASC
    `) as InterestRow[];

    return NextResponse.json({
      ok: true,
      interests: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        slug: r.slug,
        sort_order: r.sort_order,
      })),
    });
  } catch (err) {
    console.error("Interests fetch error:", err);
    return NextResponse.json(
      { ok: false, error: { code: "SERVER_ERROR", message: "Failed to fetch interests" } },
      { status: 500 }
    );
  }
}
