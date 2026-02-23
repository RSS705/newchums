import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Events | NewChums",
};

export default function EventsPage() {
  return <StubPage title="Events" description="Browse and discover events near your community." />;
}
