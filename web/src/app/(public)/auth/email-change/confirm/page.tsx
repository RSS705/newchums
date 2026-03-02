import type { Metadata } from "next";
import { Suspense } from "react";
import EmailChangeConfirmClient from "./EmailChangeConfirmClient";

export const metadata: Metadata = {
  title: "Confirm Email Change | NewChums",
};

export default function EmailChangeConfirmPage() {
  return (
    <Suspense fallback={null}>
      <EmailChangeConfirmClient />
    </Suspense>
  );
}
