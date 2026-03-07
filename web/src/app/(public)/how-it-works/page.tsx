import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import HowItWorksContent from "./HowItWorksContent";

export const metadata: Metadata = {
  title: "How it Works | NewChums",
  description:
    "See how NewChums helps you organize gatherings around shared interests — from setting your hobbies to coordinating plans without the group chat chaos.",
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
