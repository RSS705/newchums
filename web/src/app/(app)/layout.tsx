import { auth } from "@/auth";
import AppShell from "@/components/layout/AppShell";
import MarkOAuthVerified from "@/components/auth/MarkOAuthVerified";
import {
  getRequestedPathFromHeaders,
  getRequestedSearchFromHeaders,
} from "@/lib/authRedirect";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Sections that an event-detail email link can deep-link into and that
// require an authenticated viewer. Must stay in sync with
// AUTH_REQUIRED_SECTIONS in EventDetailClient.tsx — duplicated here so the
// server can short-circuit before any HTML is rendered (avoiding the brief
// flash of the public-preview shell on the way to /login).
const AUTH_REQUIRED_EVENT_SECTIONS = new Set(["feedback", "chat", "confirmation"]);

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  const requestHeaders = await headers();
  const requestedPath = getRequestedPathFromHeaders(requestHeaders);

  // Allow unauthenticated users to view event detail pages (public preview)
  const isPublicRoute = /^\/?(\(app\)\/)?events\/[^/]+/.test(requestedPath);

  if (!session) {
    if (isPublicRoute) {
      // Email links like /events/{id}?section=feedback target sections that
      // require auth. If the visitor is logged out, send them straight to
      // /login here so they don't see the (app) shell flash on the way.
      const search = getRequestedSearchFromHeaders(requestHeaders);
      const sectionMatch = search.match(/[?&]section=([^&]+)/);
      const sectionParam = sectionMatch
        ? decodeURIComponent(sectionMatch[1])
        : null;
      if (sectionParam && AUTH_REQUIRED_EVENT_SECTIONS.has(sectionParam)) {
        redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
      }
      return <AppShell>{children}</AppShell>;
    }
    redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  }

  const email = (session.user as { email?: string })?.email;
  if (!email || typeof email !== "string") {
    return <AppShell>{children}</AppShell>;
  }

  if (requestedPath === "/onboarding/username") {
    return <AppShell>{children}</AppShell>;
  }

  const { username, date_of_birth, name, role, is_suspended } = await getOrCreateAppUser(
    email,
    (session.user as { name?: string | null })?.name
  );

  if (is_suspended) {
    redirect("/login?error=AccountSuspended");
  }

  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(
      `/onboarding/username?returnTo=${encodeURIComponent(requestedPath)}`
    );
  }

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <>
      <MarkOAuthVerified session={session} />
      <AppShell user={{ name: greetingName, role }}>
        {children}
      </AppShell>
    </>
  );
}
