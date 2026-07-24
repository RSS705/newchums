import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import ScienceOfFriendshipContent from "./ScienceOfFriendshipContent";

export const metadata: Metadata = {
  title: "The Science of Friendship",
  description:
    "Friendship isn't just luck. Learn how proximity, repetition, and disclosure help people connect, and how NewChums recreates those conditions.",
  // Unlisted page: kept live for direct URLs but removed from nav,
  // footer, homepage, and the sitemap, and excluded from search
  // indexes. The public site now sells the coordination job; the
  // friendship-research framing lives on only for people who are
  // handed this link deliberately.
  robots: { index: false, follow: true },
  alternates: { canonical: "/science-of-friendship" },
  openGraph: {
    title: "The Science of Friendship",
    description:
      "Friendship isn't just luck. Learn how proximity, repetition, and disclosure help people connect, and how NewChums recreates those conditions.",
    url: "/science-of-friendship",
  },
};

export default async function ScienceOfFriendshipPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <ScienceOfFriendshipContent isLoggedIn={isLoggedIn} />
    </LandingLayout>
  );
}
