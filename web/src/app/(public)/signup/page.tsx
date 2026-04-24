import { Suspense } from "react";
import type { Metadata } from "next";
import SignupClient from "./SignupClient";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Sign up for NewChums to start organizing hobby-based plans and gatherings with people near you.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupClient />
    </Suspense>
  );
}
