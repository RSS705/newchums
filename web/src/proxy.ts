import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const requestPath = `${request.nextUrl.pathname}${request.nextUrl.search}` || "/";
  requestHeaders.set("x-request-path", requestPath);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|monitoring).*)",
  ],
};
