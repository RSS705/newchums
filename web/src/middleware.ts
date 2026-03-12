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

export function middleware(request: NextRequest) {
  const redirect = canonicalRedirect(request);
  if (redirect) {
    return redirect;
  }

  const response = NextResponse.next();
  response.headers.set("x-request-path", request.nextUrl.pathname);
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
