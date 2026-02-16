import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Home | NewChums",
};

export default function HomePage() {
  return <StubPage title="Home" description="Your activity and recommendations will live here." />;
}
