import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import HowItWorksContent from "./HowItWorksContent";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "See how NewChums helps you organize gatherings around shared interests, from setting your hobbies to coordinating plans and showing up to more good things.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How NewChums works",
    description:
      "See how NewChums helps you organize gatherings around shared interests, from setting your hobbies to coordinating plans and showing up to more good things.",
    url: "/how-it-works",
  },
};

export default async function HowItWorksPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <HowItWorksContent isLoggedIn={isLoggedIn} />
    </LandingLayout>
  );
}
