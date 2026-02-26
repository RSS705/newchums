import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Chum Groups | NewChums",
};

export default function ChumGroupsPage() {
  return (
    <StubPage
      title="Chum Groups"
      description="Connect with groups around your interests."
    />
  );
}
