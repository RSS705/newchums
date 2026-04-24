import type { Metadata } from "next";
import { Suspense } from "react";
import EmailChangeConfirmClient from "./EmailChangeConfirmClient";

export const metadata: Metadata = {
  title: "Confirm email change",
  description: "Confirm the change to your NewChums account email address.",
  robots: { index: false, follow: false },
};

export default function EmailChangeConfirmPage() {
  return (
    <Suspense fallback={null}>
      <EmailChangeConfirmClient />
    </Suspense>
  );
}
