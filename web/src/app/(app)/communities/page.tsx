import type { Metadata } from "next";
import { auth } from "@/auth";
import CommunitiesListClient from "./CommunitiesListClient";
import PublicCommunitiesExplore from "./PublicCommunitiesExplore";

export const metadata: Metadata = {
  title: "Communities",
  description:
    "Discover communities on NewChums. Browse public hobby groups and clubs near you and see the plans they're running.",
  // Override the (app)/layout.tsx noindex default: this page is public
  // (see the file-level comment above and the isPublicRoute regex in
  // (app)/layout.tsx) and should be indexable. The API enforces privacy
  // by only returning visibility='public' communities to logged-out
  // viewers via GET /public/communities.
  robots: { index: true, follow: true },
  alternates: { canonical: "/communities" },
};

/**
 * Communities index.
 *
 * Serves two distinct clients off the same path, the decision is server-
 * side so the logged-out visitor never sees the authenticated client flash
 * on the way to a redirect:
 *
 *   - Logged-in  → `CommunitiesListClient` (full discovery, All/Yours,
 *                  personalization, distance based on saved profile).
 *   - Logged-out → `PublicCommunitiesExplore` (public-only visibility,
 *                  no viewer-scoped fields, manual Places location).
 *
 * The `(app)/layout.tsx` allowlists `/communities` as a public route so
 * non-authenticated visitors can reach this file at all (the layout would
 * otherwise redirect them to `/login?next=`). The privacy contract for
 * logged-out browsing is enforced by the separate `GET /public/communities`
 * API endpoint, not by the client.
 */
export default async function CommunitiesPage() {
  const session = await auth();
  if (!session) {
    return <PublicCommunitiesExplore />;
  }
  return <CommunitiesListClient />;
}
