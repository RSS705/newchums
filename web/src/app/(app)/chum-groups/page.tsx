import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Your Chums | NewChums",
};

export default function ChumGroupsPage() {
  return (
    <StubPage
      title="Your Chums"
      description="Connect with friends and groups around your interests."
    />
  );
}
