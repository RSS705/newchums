import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import PrivacyContent from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How NewChums collects, uses, and protects your personal information.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <PrivacyContent />
    </LandingLayout>
  );
}
