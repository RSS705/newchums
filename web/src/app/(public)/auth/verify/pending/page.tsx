import type { Metadata } from "next";
import PendingClient from "./PendingClient";

export const metadata: Metadata = {
  title: "Check Your Email | NewChums",
};

export default function PendingPage() {
  return <PendingClient />;
}
