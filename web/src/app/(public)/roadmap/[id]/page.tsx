import type { Metadata } from "next";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import AppShell from "@/components/layout/AppShell";
import LandingLayout from "@/components/landing/LandingLayout";
import RoadmapItemClient from "./RoadmapItemClient";

const FALLBACK_METADATA: Metadata = {
  title: "Roadmap item",
  description: "A feature request on the NewChums community roadmap.",
  robots: { index: true, follow: true },
};

/** Dynamic metadata for roadmap item detail pages. Fetches GET /roadmap/:id
 *  unauthenticated. The API already hides items with status='received' or
 *  is_private=true from non-author/non-admin viewers by returning 404,
 *  which is mirrored here as the fallback metadata. Anonymous items have
 *  author_username coerced to "anonymous" in the response, so quoting the
 *  author here is safe. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base || !id) return FALLBACK_METADATA;

  try {
    const res = await fetch(`${base}/roadmap/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_METADATA;
    const data = (await res.json()) as {
      ok?: boolean;
      item?: { title?: string | null; body?: string | null; status?: string | null };
    };
    const it = data.ok ? data.item : null;
    if (!it) return FALLBACK_METADATA;

    const title = (it.title || "").trim() || "Roadmap item";
    // Strip HTML tags from the body for the description; roadmap bodies
    // are user-submitted and may contain basic HTML. We also cap length.
    const description = (it.body || "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200)
      || `A feature request on the NewChums community roadmap.`;

    const canonicalPath = `/roadmap/${encodeURIComponent(id)}`;
    return {
      title,
      description,
      robots: { index: true, follow: true },
      alternates: { canonical: canonicalPath },
      openGraph: {
        title,
        description,
        url: canonicalPath,
        type: "article",
      },
      twitter: {
        title,
        description,
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function RoadmapItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout isLoggedIn={false}>
        <Box sx={{ py: { xs: 2, sm: 4 } }}>
          <RoadmapItemClient itemId={id} isLoggedIn={false} />
        </Box>
      </LandingLayout>
    );
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
      <RoadmapItemClient itemId={id} isLoggedIn={true} />
    </AppShell>
  );
}
