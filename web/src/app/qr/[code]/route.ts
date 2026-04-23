import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/** Public QR redirect route handler.
 *
 *  This is the server-side endpoint printed QR codes point at. The flow is:
 *    1. Extract scan metadata (user-agent, referer, CF-IPCountry) from the
 *       inbound request headers.
 *    2. Call the API worker to resolve the code + log the scan.
 *    3. Issue a 302 to the resolved destination, or to `/` for unknown /
 *       inactive codes so posters never dead-end on a raw error.
 *
 *  No authentication, QR codes are meant to be scannable by anyone. All
 *  validation / lookup / logging lives in the API worker
 *  (`POST /public/qr/:code/scan`) so the business logic stays there.
 *
 *  Why a Next.js route handler instead of the API worker directly:
 *  the canonical public domain (newchums.com) serves the Next.js app,
 *  and we want QR URLs to be on that exact domain (not a *.workers.dev
 *  subdomain) so they read cleanly on print.
 *
 *  Trustworthy scan counts:
 *
 *    - We export an explicit HEAD handler that resolves the destination
 *      without logging a scan. Browsers, link-preview tools, and some
 *      camera apps issue HEAD before GET to "preview" a URL; without an
 *      explicit handler Next.js routes HEAD to the GET handler, which
 *      would log a phantom scan for every preview.
 *    - We send `Cache-Control: no-store` so an upstream proxy doesn't
 *      memoize the redirect and silently mask future real scans (or
 *      replay an old destination after we change it).
 *    - We forward `cache: "no-store"` to the API call so Next.js own
 *      fetch cache doesn't collapse repeat scans into one upstream call.
 *
 *  Additional dedupe (same UA within a short window, known bot UAs)
 *  happens API-side, see `POST /public/qr/:code/scan`.
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

type ScanInvocation = {
  code: string;
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  /** When true the API resolves the code but does NOT insert a scan row.
   *  Used for HEAD pre-flights so previews / unfurlers don't inflate counts. */
  skipLog: boolean;
};

async function resolveDestination(args: ScanInvocation, fallbackUrl: string): Promise<string> {
  const apiBase = resolveApiBase();
  if (!apiBase) {
    // Mis-configured environment, fall through to the landing page. The
    // console log surfaces the root cause without breaking the scan.
    console.error("[/qr/:code] NEXT_PUBLIC_API_BASE_URL is not set");
    return fallbackUrl;
  }

  try {
    const res = await fetch(`${apiBase}/public/qr/${encodeURIComponent(args.code)}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAgent: args.userAgent,
        referer: args.referer,
        country: args.country,
        city: args.city,
        region: args.region,
        latitude: args.latitude,
        longitude: args.longitude,
        timezone: args.timezone,
        skipLog: args.skipLog,
      }),
      // Disable Next's caching: every scan is a distinct event and must
      // hit the API. (Combined with the no-store response header below
      // this also keeps the redirect itself fresh after a destination
      // change.)
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { ok?: boolean; destinationUrl?: string };
      if (data.ok && typeof data.destinationUrl === "string") {
        return data.destinationUrl;
      }
    }
    // Any other response (404 NOT_FOUND, 410 INACTIVE, 500 SERVER_ERROR)
    // falls through to the landing page fallback.
  } catch (err) {
    console.error("[/qr/:code] scan request failed", err);
  }
  return fallbackUrl;
}

function noStoreRedirect(url: string): NextResponse {
  const res = NextResponse.redirect(url, 302);
  // Without this an upstream cache could replay the redirect (masking real
  // scans) or, worse, keep serving an old destination after a remap.
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}

type ScanContext = {
  userAgent: string | null;
  referer: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
};

function parseGeoNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function extractScanContext(request: Request): ScanContext {
  // Cloudflare adds `cf-ipcountry` on every Worker request. The richer
  // location headers (`cf-ipcity`, `cf-region`, `cf-iplatitude`,
  // `cf-iplongitude`, `cf-timezone`) are added when the "Add visitor
  // location headers" managed transform is enabled in the CF dashboard.
  // `request.cf` (via `getCloudflareContext`) exposes the same data
  // regardless of that toggle, so we read from both and take the first
  // non-null. Absent in local dev, that's fine, we just log nulls.
  let cf: Record<string, unknown> | undefined;
  try {
    cf = getCloudflareContext({ async: false }).cf as Record<string, unknown> | undefined;
  } catch {
    // Outside a CF request context (local dev, tests). Fall back to headers.
  }

  const fromCf = (key: string): string | null => {
    const v = cf?.[key];
    if (typeof v === "string") return v || null;
    if (typeof v === "number") return String(v);
    return null;
  };
  const header = (name: string): string | null => request.headers.get(name);

  return {
    userAgent: header("user-agent"),
    referer: header("referer"),
    country: fromCf("country") ?? header("cf-ipcountry"),
    city: fromCf("city") ?? header("cf-ipcity"),
    region: fromCf("region") ?? header("cf-region"),
    latitude: parseGeoNumber(fromCf("latitude") ?? header("cf-iplatitude")),
    longitude: parseGeoNumber(fromCf("longitude") ?? header("cf-iplongitude")),
    timezone: fromCf("timezone") ?? header("cf-timezone"),
  };
}

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
    return noStoreRedirect(fallbackUrl);
  }

  const ctx = extractScanContext(request);
  const destination = await resolveDestination(
    { code, ...ctx, skipLog: false },
    fallbackUrl,
  );
  return noStoreRedirect(destination);
}

/** HEAD requests resolve the destination without logging a scan. iOS Safari,
 *  the macOS QuickLook QR preview, and several link-preview crawlers issue
 *  HEAD before GET to validate the URL. Without this they'd double-count
 *  every real scan. The 302 still tells them where the URL points. */
export async function HEAD(
  request: Request,
  context: { params: Promise<ResolveParams> },
): Promise<Response> {
  const { code } = await context.params;
  const origin = new URL(request.url).origin;
  const fallbackUrl = new URL(FALLBACK_PATH, origin).toString();

  if (!code || code.length > 128) {
    return noStoreRedirect(fallbackUrl);
  }

  const ctx = extractScanContext(request);
  const destination = await resolveDestination(
    { code, ...ctx, skipLog: true },
    fallbackUrl,
  );
  return noStoreRedirect(destination);
}
