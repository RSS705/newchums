import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import SafetyCenterContent from "./SafetyCenterContent";

export const metadata: Metadata = {
  title: "Safety Center",
  description:
    "Simple, practical guidance for more comfortable gatherings on NewChums.",
  alternates: { canonical: "/safety-center" },
  openGraph: {
    title: "Safety Center",
    description:
      "Simple, practical guidance for more comfortable gatherings on NewChums.",
    url: "/safety-center",
  },
};

export default async function SafetyCenterPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <SafetyCenterContent isLoggedIn={isLoggedIn} />
    </LandingLayout>
  );
}
