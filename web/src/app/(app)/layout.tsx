import { auth } from "@/auth";
import AppShell from "@/components/layout/AppShell";
import MarkOAuthVerified from "@/components/auth/MarkOAuthVerified";
import {
  getRequestedPathFromHeaders,
  getRequestedSearchFromHeaders,
} from "@/lib/authRedirect";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { jwtVerify } from "jose";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Sections that an event-detail email link can deep-link into and that
// require an authenticated viewer. Must stay in sync with
// AUTH_REQUIRED_SECTIONS in EventDetailClient.tsx, duplicated here so the
// server can short-circuit before any HTML is rendered (avoiding the brief
// flash of the public-preview shell on the way to /login).
const AUTH_REQUIRED_EVENT_SECTIONS = new Set(["feedback", "chat", "confirmation"]);

// Community tabs that an email CTA can deep-link into and that require an
// authenticated viewer. Mirrors the event-section pattern above, same
// rationale: short-circuit on the server so a logged-out recipient of the
// "Review request" email CTA never sees the public community shell flash
// on the way to /login. Today only the Requests tab (owner-only) qualifies;
// members/plans remain publicly viewable.
const AUTH_REQUIRED_COMMUNITY_TABS = new Set(["requests"]);

// Decode (and verify) an invite_token JWT to detect whether the invited
// recipient is an existing user (uid present) vs an off-platform email
// (em present). Returns null on any parse/verify failure, the client then
// falls back to the normal flow (render the signup card).
async function peekInviteTokenUserId(token: string): Promise<string | null> {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.purpose !== "invite_rsvp") return null;
    const uid = payload.uid;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  } catch {
    return null;
  }
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  const requestHeaders = await headers();
  const requestedPath = getRequestedPathFromHeaders(requestHeaders);

  // Allow unauthenticated users to view event detail pages (public preview)
  // and community detail pages by slug. The community slug URL is the
  // canonical public / shareable destination for a community (including
  // posters and QR codes). Public communities render the full detail view;
  // private communities render a restricted preview; the API enforces the
  // privacy contract (no members, plans, website, or Discord link leak).
  const isPublicRoute =
    /^\/?(\(app\)\/)?events\/[^/]+/.test(requestedPath) ||
    /^\/?(\(app\)\/)?communities\/[^/]+\/?$/.test(requestedPath);

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
      // Community email CTAs like the "Review request" button point at
      // /communities/{slug}?tab=requests. The Requests tab is owner-only,
      // so a logged-out recipient must authenticate first, otherwise they
      // would land on the public community shell instead of the tab they
      // were sent to. Redirect before any HTML renders so there is no
      // flash of the wrong view on the way to /login.
      const isCommunityRoute = /^\/?(\(app\)\/)?communities\/[^/?]+\/?(\?|$)/.test(requestedPath);
      if (isCommunityRoute) {
        const tabMatch = search.match(/[?&]tab=([^&]+)/);
        const tabParam = tabMatch ? decodeURIComponent(tabMatch[1]) : null;
        if (tabParam && AUTH_REQUIRED_COMMUNITY_TABS.has(tabParam)) {
          // Ensure the tab survives the login round-trip. Depending on
          // whether middleware has populated x-request-path vs falling back
          // to framework headers, requestedPath may or may not already
          // carry the query string, so re-attach search if it does not.
          const nextTarget = requestedPath.includes("?") ? requestedPath : requestedPath + search;
          redirect(`/login?next=${encodeURIComponent(nextTarget)}`);
        }
      }
      // Invite email short-circuit: if the invite_token identifies an
      // existing account (uid in payload), send the logged-out visitor
      // straight to /login so they don't see the plan flash on the way.
      // For off-platform invitees (email-only token) we fall through to
      // the public preview + signup card.
      const inviteMatch = search.match(/[?&]invite_token=([^&]+)/);
      const inviteToken = inviteMatch ? decodeURIComponent(inviteMatch[1]) : null;
      if (inviteToken) {
        const uid = await peekInviteTokenUserId(inviteToken);
        if (uid) {
          redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
        }
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
