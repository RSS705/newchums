import type { Metadata } from "next";
import { Suspense } from "react";
import PendingClient from "./PendingClient";

export const metadata: Metadata = {
  title: "Check Your Email | NewChums",
};

export default function PendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingClient />
    </Suspense>
  );
}
