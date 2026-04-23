import type { Metadata } from "next";
import { auth } from "@/auth";
import CommunitiesListClient from "./CommunitiesListClient";
import PublicCommunitiesExplore from "./PublicCommunitiesExplore";

export const metadata: Metadata = {
  title: "Communities | NewChums",
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
