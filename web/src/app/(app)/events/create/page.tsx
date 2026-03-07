import type { Metadata } from "next";
import CreateEventClient from "./CreateEventClient";

export const metadata: Metadata = {
  title: "Start a Plan | NewChums",
};

export default function CreateEventPage() {
  return <CreateEventClient />;
}
