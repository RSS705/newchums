import type { Metadata } from "next";
import CommunityDetailClient from "./CommunityDetailClient";

// Static fallback metadata overriding the (app)/layout.tsx noindex cascade.
// generateMetadata in the follow-up commit will replace this with dynamic,
// community-specific metadata that flips to noindex for private
// communities (their slug URLs stay shareable but don't show up in search).
export const metadata: Metadata = {
  title: "Community",
  robots: { index: true, follow: true },
};

export default function CommunityDetailPage() {
  return <CommunityDetailClient />;
}
