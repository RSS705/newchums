import type { Metadata } from "next";
import EventDetailClient from "./EventDetailClient";

export const metadata: Metadata = {
  title: "Event Details | NewChums",
};

export default function EventDetailPage() {
  return <EventDetailClient />;
}
