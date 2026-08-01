import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import AppShell from "@/components/layout/AppShell";
import RoadmapClient from "./RoadmapClient";

export const metadata: Metadata = {
  title: "Community Roadmap",
  description:
    "See what's coming next for NewChums. Submit ideas, vote on features, and help shape the future of the platform.",
  alternates: { canonical: "/roadmap" },
  // Signed-in only, so keep it out of search results.
  robots: { index: false, follow: false },
  openGraph: {
    title: "NewChums Community Roadmap",
    description:
      "See what's coming next for NewChums. Submit ideas, vote on features, and help shape the future of the platform.",
    url: "/roadmap",
  },
};

export default async function RoadmapPage() {
  const session = await auth();

  // Signed-in only since Aug 2026. The roadmap is a voting queue for
  // existing users, not an acquisition surface: an indexed page of
  // unbuilt features is prospect-facing liability once paid traffic
  // starts. The URL is kept (existing users link to it, and the admin
  // pipeline feeds from it) but signed-out visitors go to login with a
  // next param so they land here after signing in. See also the noindex
  // metadata below, the robots.ts disallow, and the sitemap omission.
  if (!session?.user?.email) {
    redirect(`/login?next=${encodeURIComponent("/roadmap")}`);
  }

  const { username, name } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null }).name
  );

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <RoadmapClient isLoggedIn={true} />
    </AppShell>
  );
}
