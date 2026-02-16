import { NextResponse } from "next/server";
import { auth } from "@/auth";

const appRoutePrefixes = ["/home", "/events", "/profile", "/settings"];

function isAppRoute(pathname: string) {
  return appRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const isAuthed = Boolean(request.auth);

  if (!isAuthed && isAppRoute(pathname)) {
    const next = encodeURIComponent(`${pathname}${search}`);
    return NextResponse.redirect(new URL(`/login?next=${next}`, request.url));
  }

  if (isAuthed && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/home", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/home/:path*",
    "/events/:path*",
    "/profile/:path*",
    "/settings/:path*",
  ],
};
