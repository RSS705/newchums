import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import HowItWorksContent from "./HowItWorksContent";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "See how NewChums makes plans actually happen, from posting the plan and sharing one link to collecting RSVPs and 24-hour attendance checks.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How NewChums works",
    description:
      "See how NewChums makes plans actually happen, from posting the plan and sharing one link to collecting RSVPs and 24-hour attendance checks.",
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
