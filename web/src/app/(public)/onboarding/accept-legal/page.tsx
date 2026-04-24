import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AcceptLegalClient from "./AcceptLegalClient";
import { getSafeRedirectPath } from "@/lib/authRedirect";

/** Authenticated-only interstitial shown to users whose legal acceptance
 *  was not recorded during signup. In practice this catches the
 *  Google-OAuth path where sessionStorage was cleared between the
 *  pre-redirect acceptance click and the post-redirect record call.
 *  Noindex + nofollow since this is an authed flow and carries no
 *  content worth surfacing in search. */
export const metadata: Metadata = {
  title: "Accept terms to continue",
  robots: { index: false, follow: false },
};

export default async function OnboardingAcceptLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.email) {
    const params = await searchParams;
    const returnTo = getSafeRedirectPath(params.returnTo);
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  // If the user already has acceptance recorded, skip straight to the
  // destination. This guards against direct navigation to the
  // interstitial URL and against a race where the (app) layout redirect
  // fires concurrently with a successful record call.
  const { accepted_legal_at } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null })?.name,
  );
  if (accepted_legal_at) {
    const params = await searchParams;
    const returnTo = getSafeRedirectPath(params.returnTo);
    redirect(returnTo);
  }

  return (
    <Suspense fallback={null}>
      <AcceptLegalClient />
    </Suspense>
  );
}
