import type { Metadata } from "next";
import { Suspense } from "react";
import VerifyClient from "./VerifyClient";

export const metadata: Metadata = {
  title: "Verify your email",
  description: "Verify your NewChums email address.",
  robots: { index: false, follow: false },
};

export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyClient />
    </Suspense>
  );
}
