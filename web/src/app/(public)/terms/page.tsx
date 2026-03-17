import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import TermsContent from "./TermsContent";

export const metadata: Metadata = {
  title: "Terms of Use | NewChums",
  description:
    "Terms of Use governing your access to and use of the NewChums platform.",
};

export default async function TermsPage() {
  const session = await auth();
  const isLoggedIn = Boolean(session?.user?.email);

  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <TermsContent />
    </LandingLayout>
  );
}
