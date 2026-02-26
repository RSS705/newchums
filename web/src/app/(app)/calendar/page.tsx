import type { Metadata } from "next";
import StubPage from "@/components/layout/StubPage";

export const metadata: Metadata = {
  title: "Calendar | NewChums",
};

export default function CalendarPage() {
  return (
    <StubPage
      title="Calendar"
      description="View your gatherings and events on the calendar."
    />
  );
}
