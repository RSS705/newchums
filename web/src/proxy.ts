import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
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
