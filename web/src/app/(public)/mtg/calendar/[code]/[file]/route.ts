import { NextResponse } from "next/server";

/**
 * Same-origin "Add to calendar" files for the MTG Card Evaluation Challenge
 * (spec 4.2): /mtg/calendar/<set>/lock.ics and final.ics. The API builds the
 * file from the set's dates; this route passes it through so the timeline and
 * the emails can link to newchums.com instead of the API host.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string; file: string }> }) {
  const { code, file } = await params;
  if (!/^[a-z0-9]{2,6}$/i.test(code) || !/^(lock|final)\.ics$/.test(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base) return new NextResponse("Calendar is unavailable", { status: 503 });
  try {
    const res = await fetch(`${base}/mtg/sets/${code.toLowerCase()}/calendar/${file}`, { next: { revalidate: 3600 } });
    if (!res.ok) return new NextResponse("Not found", { status: res.status === 404 ? 404 : 502 });
    return new NextResponse(await res.text(), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${code.toLowerCase()}-${file}"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Calendar is unavailable", { status: 502 });
  }
}
