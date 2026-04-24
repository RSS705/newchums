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
  const fallback: Metadata = {
    title: handleNorm ? `@${handleNorm}` : "Profile",
    description: "A profile on NewChums.",
    robots: { index: true, follow: true },
  };
  if (!base || !handleNorm) return fallback;
  try {
    // The public endpoint returns a privacy-safe projection for logged-out
    // callers: displayName is @username only (never real name), age and
    // gender are null, email never appears. We may freely surface handle,
    // bio, hobbies, and avatar in metadata. Real name is intentionally not
    // read from this response even if it were available.
    const res = await fetch(
      `${base}/public/users/${encodeURIComponent(handleNorm)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      ok?: boolean;
      user?: {
        handle?: string | null;
        bio?: string | null;
        avatarUrl?: string | null;
        hobbies?: Array<{ name: string }>;
        is_hidden_from_external_indexing?: boolean;
      };
    };
    const u = data.ok ? data.user : null;
    if (!u) return fallback;

    const displayHandle = (u.handle || `@${handleNorm}`).replace(/^@?/, "@");
    const hobbyNames = (u.hobbies ?? []).map((h) => h.name).filter(Boolean);
    const hobbyBit = hobbyNames.length > 0
      ? `Interests: ${hobbyNames.slice(0, 5).join(", ")}.`
      : "";
    const bioBit = (u.bio || "").trim().slice(0, 160);
    const description = [bioBit, hobbyBit].filter(Boolean).join(" ").slice(0, 240)
      || `${displayHandle} on NewChums.`;

    const canonicalPath = `/u/${encodeURIComponent(handleNorm)}`;
    const imageUrl = u.avatarUrl ? `${base}${u.avatarUrl}` : undefined;
    const respectHide = u.is_hidden_from_external_indexing === true;

    return {
      title: displayHandle,
      description,
      // Respect the account's hidden-from-external-indexing preference,
      // which lives on the user's profile settings. Shareable link
      // previews still render (the page is public), we just don't feed
      // search engines.
      robots: respectHide
        ? { index: false, follow: false }
        : { index: true, follow: true },
      alternates: { canonical: canonicalPath },
      openGraph: {
        title: displayHandle,
        description,
        url: canonicalPath,
        type: "profile",
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
      twitter: {
        title: displayHandle,
        description,
        ...(imageUrl ? { images: [imageUrl] } : {}),
      },
    };
  } catch {
    return fallback;
  }
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
