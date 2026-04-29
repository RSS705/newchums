import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Why this is `middleware.ts`, not `proxy.ts`.
 *
 * Next.js 16 introduced `proxy.ts` as the future replacement. We migrated
 * to it briefly, then reverted, because Next 16 hard-codes `proxy.ts` to
 * the Node runtime (Next's own build error: "Proxy always runs on Node.js
 * runtime") and OpenNext's Cloudflare adapter only knows how to bundle
 * Edge-runtime middleware. The combination silently shipped a Worker with
 * NO middleware wired at all, `x-request-path` never got set in
 * production, and `(app)/layout.tsx`'s `getRequestedPathFromHeaders` fell
 * through to its default `/`. Net effect: any logged-out visit to a
 * public `(app)` route (`/communities`, `/events/[id]`) hit
 * `/login?next=%2F`. See `web/scripts/patch-functions-config.js` for the
 * manifest-level details.
 *
 * `middleware.ts` with `export const runtime = "edge"` still works in
 * Next 16 (with a deprecation warning the convention will go away in a
 * future major). Once OpenNext for Cloudflare adds Node-runtime proxy
 * support, we can re-migrate. Until then, this is the canonical Edge-
 * middleware entry point.
 *
 * AGENTS.md's "do NOT add `export const runtime = 'edge'` to routes" rule
 * is about page/route handlers (where OpenNext shims edge to an empty
 * module). Middleware is a different surface: OpenNext explicitly builds
 * an Edge bundle for it, so this declaration is REQUIRED here.
 */
// Next 16 wants `experimental-edge`, not `edge`, on middleware.
// The "experimental" prefix is misleading; it's been the supported value
// since the convention split from page-route runtime declarations. If a
// future Next release renames it, the build error is loud and obvious.
export const runtime = "experimental-edge";

/**
 * Canonical host redirect: www → non-www.
 * MUST run before Auth.js so PKCE code_verifier matches across signin and callback.
 * Flow: User hits www.newchums.com → 301 to newchums.com → Auth.js runs on canonical host.
 */
function canonicalRedirect(request: NextRequest): NextResponse | null {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!host.toLowerCase().startsWith("www.")) {
    return null;
  }

  const url = request.nextUrl.clone();
  url.host = host.slice(4); // strip "www."
  return NextResponse.redirect(url, 301);
}

/** Paths whose responses may legitimately be cached by a shared cache
 *  (homepage public Explore, public event preview, public community
 *  index and slug pages). Anything NOT in this list is authenticated-only
 *  from (app)/layout.tsx's perspective and must carry Cache-Control that
 *  forbids shared storage; without it an RSC response rendered while the
 *  session was transiently null can be cached at the Cloudflare edge and
 *  then served to authed viewers, which flashes the logged-out shell.
 *  Keep in sync with the `isPublicRoute` regexes in
 *  web/src/app/(app)/layout.tsx. */
function isPotentiallyCacheablePath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (/^\/events\/(?!create(\/|$))[^/]+\/?$/.test(pathname)) return true;
  if (pathname === "/communities" || pathname === "/communities/") return true;
  if (/^\/communities\/(?!create(\/|$))[^/]+\/?$/.test(pathname)) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const redirect = canonicalRedirect(request);
  if (redirect) {
    return redirect;
  }

  const response = NextResponse.next();
  response.headers.set("x-request-path", request.nextUrl.pathname);
  // Expose the raw search string so server components can detect query
  // params (e.g. ?section=feedback on /events/[id]) without depending on
  // client-side hydration. Used by (app)/layout.tsx to redirect logged-out
  // visitors hitting auth-required sections before any HTML is sent.
  response.headers.set("x-request-search", request.nextUrl.search);

  // Defense in depth against the silent-logout symptom on authed surfaces.
  // Next.js already marks dynamic responses `private, no-cache, no-store`,
  // but belt-and-suspenders: forbid the shared cache explicitly on every
  // authenticated-only path so a transient unauthed render can't get
  // pinned at the edge and served to subsequent authed viewers.
  if (!isPotentiallyCacheablePath(request.nextUrl.pathname)) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, no-cache, must-revalidate, max-age=0",
    );
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and common files.
     * CRITICAL: Includes /api/auth/* so canonical redirect runs before Auth.js.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
