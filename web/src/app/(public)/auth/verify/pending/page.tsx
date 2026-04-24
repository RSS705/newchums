import type { Metadata } from "next";
import { Suspense } from "react";
import PendingClient from "./PendingClient";

export const metadata: Metadata = {
  title: "Check your email",
  description: "We sent you a confirmation link. Check your email to finish signing in.",
  robots: { index: false, follow: false },
};

export default function PendingPage() {
  return (
    <Suspense fallback={null}>
      <PendingClient />
    </Suspense>
  );
}
