import type { Metadata } from "next";
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

// Default every (app) route to noindex so authenticated surfaces, admin,
// edit forms, and onboarding-like internal pages are never crawled. The
// three publicly-accessible routes under (app) -- /events/[id],
// /communities, /communities/[slug] -- override this in their own page
// metadata (static or via generateMetadata) back to index/follow. The
// /u/[handle] route lives under (public) with its own conditional
// noindex; no cascade concern there.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

// Sections that an event-detail email link can deep-link into and that
// require an authenticated viewer. Must stay in sync with
// AUTH_REQUIRED_SECTIONS in EventDetailClient.tsx, duplicated here so the
// server can short-circuit before any HTML is rendered (avoiding the brief
// flash of the public-preview shell on the way to /login).
//
// "join-requests" covers the host-side "Review request" email CTA. Without
// this redirect, a logged-out host clicking the email lands on the public
// preview path; for QA plans that path 404s ("Plan not found") because QA
// plans require super-admin auth at the API. Routing through /login first
// preserves QA-plan isolation (the API still rejects non-super-admins after
// login) while letting authorised hosts reach the section they were sent to.
//
// "attendees" covers the requester-side "approved" email CTA, after login
// the viewer scrolls to the Who's in card.
const AUTH_REQUIRED_EVENT_SECTIONS = new Set([
  "feedback",
  "chat",
  "confirmation",
  "join-requests",
  "attendees",
]);

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
  // Strip the query string for route-matching. `requestedPath` carries
  // the full path+query so section/tab/invite_token parsing below still
  // works, but the isPublicRoute regexes need to match against the
  // pathname alone. Next.js RSC fetches append `?_rsc=<hash>` to
  // client-side navigation requests, and without this split the lookahead
  // in the events / communities regexes sees `create?_rsc=…` and falls
  // through instead of excluding `create`, which re-introduces the
  // "unauthed shell at /events/create" symptom on client-side navigations
  // even though a full page load at /events/create is correctly excluded.
  const requestedPathname = requestedPath.split("?")[0];

  // Allow unauthenticated users to view event detail pages (public preview),
  // community detail pages by slug, AND the `/communities` discovery index.
  // The slug URL is the canonical public / shareable destination for a
  // community (including posters and QR codes). The index is the public
  // equivalent of the landing Explore feed for plans, it lists only public
  // communities (`GET /public/communities` enforces the visibility filter
  // server-side). Public communities render the full detail view; private
  // communities render a restricted preview; the API enforces the privacy
  // contract (no members, plans, website, or Discord link leak).
  //
  // The `[^/]+` segment after `/events/` and `/communities/` previously
  // also matched `/events/create`, `/communities/create`, and nested edit
  // pages (e.g. `/events/[id]/edit`). Those are authenticated-only flows,
  // and allowing them through this branch silently rendered the logged-out
  // shell whenever `auth()` returned null on an authed-only surface, which
  // presented to the user as "I clicked Start a plan and got logged out."
  // Exclude `create` explicitly and require the dynamic segment to be the
  // terminal path component (optional trailing slash). Everything else
  // that doesn't match here falls through to the normal /login redirect.
  const isPublicRoute =
    /^\/?(\(app\)\/)?events\/(?!create(\/|$))[^/]+\/?$/.test(requestedPathname) ||
    /^\/?(\(app\)\/)?communities\/?$/.test(requestedPathname) ||
    /^\/?(\(app\)\/)?communities\/(?!create(\/|$))[^/]+\/?$/.test(requestedPathname);

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
          // whether the proxy has populated x-request-path vs falling back
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
    // Session exists but the token lost its email field. On a public route
    // we can still render the logged-out preview; on an authed route
    // redirect to /login so the viewer never sees the unauthed shell on an
    // authed surface (it looks like a silent logout).
    if (isPublicRoute) {
      return <AppShell>{children}</AppShell>;
    }
    redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  }

  if (requestedPath === "/onboarding/username") {
    return <AppShell>{children}</AppShell>;
  }

  const { username, date_of_birth, name, role, is_suspended, password_setup_pending, accepted_legal_at } = await getOrCreateAppUser(
    email,
    (session.user as { name?: string | null })?.name
  );

  if (is_suspended) {
    redirect("/login?error=AccountSuspended");
  }

  // Legal-acceptance gate. Credentials signup writes legal acceptance on
  // the same INSERT that creates the user, so credentials accounts always
  // land here with accepted_legal_at set. Google OAuth signup relies on
  // sessionStorage surviving the OAuth redirect for the post-login
  // /auth/record-legal-acceptance POST, which fails silently on mobile
  // Safari / strict tracking-protection configs. This gate catches that
  // case, and any future path where acceptance is missing for any other
  // reason, by sending the user to a small interstitial BEFORE the
  // DOB/username onboarding step. Users whose acceptance is already
  // recorded pass through with no prompt.
  const legalAcceptanceMissing = !accepted_legal_at;
  if (legalAcceptanceMissing && requestedPathname !== "/onboarding/accept-legal") {
    redirect(
      `/onboarding/accept-legal?returnTo=${encodeURIComponent(requestedPath)}`,
    );
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
      <AppShell
        user={{ name: greetingName, role }}
        passwordSetupPending={password_setup_pending}
      >
        {children}
      </AppShell>
    </>
  );
}
