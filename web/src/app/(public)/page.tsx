import type { Metadata } from "next";
import LandingHero from "@/components/landing/LandingHero";
import LandingLayout from "@/components/landing/LandingLayout";

export const metadata: Metadata = {
  title: "NewChums",
  description: "Find your people. Meet through shared events.",
};

export default function LandingPage() {
  return (
    <LandingLayout>
      <LandingHero />
    </LandingLayout>
  );
}
