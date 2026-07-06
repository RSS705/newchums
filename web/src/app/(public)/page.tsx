import type { Metadata } from "next";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DashboardHome from "@/components/dashboard/DashboardHome";
import LandingPageContent from "./LandingPageContent";
import LandingLayout from "@/components/landing/LandingLayout";

export const metadata: Metadata = {
  // Absolute override: the root layout's title.template would otherwise
  // produce "NewChums | ... | NewChums". The homepage deserves the full
  // positioning in both the title and the OG/Twitter cards.
  // Title matches the on-page H1 so search snippets, social cards, and the
  // hero all make the same promise.
  title: { absolute: "NewChums | Make plans that actually happen" },
  description:
    "One simple place to post a plan, invite people, collect RSVPs, and let the right people find it. Free to use, around the hobbies you enjoy.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "NewChums | Make plans that actually happen",
    description:
      "One simple place to post a plan, invite people, collect RSVPs, and let the right people find it. Free to use, around the hobbies you enjoy.",
    url: "/",
    type: "website",
  },
  twitter: {
    title: "NewChums | Make plans that actually happen",
    description:
      "One simple place to post a plan, invite people, collect RSVPs, and let the right people find it. Free to use, around the hobbies you enjoy.",
  },
};

/** Organization + WebSite structured data for the logged-out homepage.
 *  Kept minimal and static; serialized with `<` escaped so user-agnostic
 *  JSON can be inlined safely in a script tag. */
const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "NewChums",
      url: "https://newchums.com",
      logo: "https://newchums.com/logo-horizontal-black.png",
    },
    {
      "@type": "WebSite",
      name: "NewChums",
      url: "https://newchums.com",
    },
  ],
};

export default async function RootPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(HOME_JSON_LD).replace(/</g, "\\u003c"),
          }}
        />
        <LandingLayout isLoggedIn={false}>
          <LandingPageContent isLoggedIn={false} />
        </LandingLayout>
      </>
    );
  }

  const { username, date_of_birth, name } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null })?.name
  );

  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(`/onboarding/username?returnTo=${encodeURIComponent("/")}`);
  }

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <DashboardHome greetingName={greetingName} />
    </AppShell>
  );
}
