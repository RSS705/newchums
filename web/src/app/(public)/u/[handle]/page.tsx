import type { Metadata } from "next";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import LandingLayout from "@/components/landing/LandingLayout";
import PublicProfilePageClient from "./PublicProfilePageClient";

type PageProps = {
  params: Promise<{ handle: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  const handleNorm = handle?.trim().toLowerCase() ?? "";
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const metadata: Metadata = {
    title: "Profile | NewChums",
    description: "View profile on NewChums.",
  };
  if (base && handleNorm) {
    try {
      const res = await fetch(
        `${base}/public/users/${encodeURIComponent(handleNorm)}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        user?: { is_hidden_from_external_indexing?: boolean };
      };
      if (data.ok && data.user?.is_hidden_from_external_indexing) {
        return { ...metadata, robots: "noindex, nofollow" };
      }
    } catch {
      // Fall through to default metadata
    }
  }
  return metadata;
}

export default async function PublicProfilePage({ params }: PageProps) {
  const { handle } = await params;

  const loggedOutView = (
    <LandingLayout isLoggedIn={false}>
      <Box sx={{ py: { xs: 4, sm: 6 } }}>
        <PublicProfilePageClient handle={handle} />
      </Box>
    </LandingLayout>
  );

  let userData: { username: string | null; date_of_birth: string | null; name: string | null } | null = null;

  try {
    const session = await auth();
    if (!session?.user?.email) {
      return loggedOutView;
    }
    userData = await getOrCreateAppUser(
      session.user.email,
      (session.user as { name?: string | null }).name
    );
  } catch {
    // auth() or getOrCreateAppUser can fail in prod (Edge runtime, DB limits, etc.).
    // Profile data is fetched client-side; fall back to logged-out view so the page loads.
    return loggedOutView;
  }

  const { username, date_of_birth, name } = userData;
  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(`/onboarding/username?returnTo=${encodeURIComponent(`/u/${handle}`)}`);
  }

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <PublicProfilePageClient handle={handle} viewerHandle={username ?? undefined} />
    </AppShell>
  );
}
