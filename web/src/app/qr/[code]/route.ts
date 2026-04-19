import { NextResponse } from "next/server";

/** Public QR redirect route handler.
 *
 *  This is the server-side endpoint printed QR codes point at. The flow is:
 *    1. Extract scan metadata (user-agent, referer, CF-IPCountry) from the
 *       inbound request headers.
 *    2. Call the API worker to resolve the code + log the scan.
 *    3. Issue a 302 to the resolved destination, or to `/` for unknown /
 *       inactive codes so posters never dead-end on a raw error.
 *
 *  No authentication — QR codes are meant to be scannable by anyone. All
 *  validation / lookup / logging lives in the API worker
 *  (`POST /public/qr/:code/scan`) so the business logic stays there.
 *
 *  Why a Next.js route handler instead of the API worker directly:
 *  the canonical public domain (newchums.com) serves the Next.js app,
 *  and we want QR URLs to be on that exact domain (not a *.workers.dev
 *  subdomain) so they read cleanly on print.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_PATH = "/";

function resolveApiBase(): string | null {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!base) return null;
  return base.replace(/\/$/, "");
}

type ResolveParams = { code: string };

export async function GET(
  request: Request,
  context: { params: Promise<ResolveParams> },
): Promise<Response> {
  const { code } = await context.params;
  const origin = new URL(request.url).origin;
  const fallbackUrl = new URL(FALLBACK_PATH, origin).toString();

  // Defensive: keep codes to a safe length before they even hit the wire.
  // The API re-validates with the canonical regex; this is just to avoid
  // passing around obviously bogus values.
  if (!code || code.length > 128) {
    return NextResponse.redirect(fallbackUrl, 302);
  }

  const apiBase = resolveApiBase();
  if (!apiBase) {
    // Mis-configured environment — fall through to the landing page. The
    // console log surfaces the root cause without breaking the scan.
    console.error("[/qr/:code] NEXT_PUBLIC_API_BASE_URL is not set");
    return NextResponse.redirect(fallbackUrl, 302);
  }

  const userAgent = request.headers.get("user-agent");
  const referer = request.headers.get("referer");
  // Cloudflare adds this header on every request that reaches the worker
  // (and on requests that hit the Next.js deployment via Cloudflare's
  // edge). Absent in local dev — that's fine, it just logs as null.
  const country = request.headers.get("cf-ipcountry");

  let destinationUrl: string | null = null;
  try {
    const res = await fetch(`${apiBase}/public/qr/${encodeURIComponent(code)}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAgent, referer, country }),
      // Disable Next's caching: every scan is a distinct event and must
      // hit the API.
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; destinationUrl?: string };
      if (data.ok && typeof data.destinationUrl === "string") {
        destinationUrl = data.destinationUrl;
      }
    }
    // Any other response (404 NOT_FOUND, 410 INACTIVE, 500 SERVER_ERROR)
    // falls through to the landing page fallback below.
  } catch (err) {
    console.error("[/qr/:code] scan request failed", err);
  }

  return NextResponse.redirect(destinationUrl ?? fallbackUrl, 302);
}
