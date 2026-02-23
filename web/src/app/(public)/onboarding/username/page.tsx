import { Suspense } from "react";
import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import OnboardingUsernameClient from "./OnboardingUsernameClient";
import { getSafeRedirectPath } from "@/lib/authRedirect";

/** Cloudflare Pages requires runtime='edge' for dynamic routes. */
export const metadata: Metadata = {
  title: "Choose Username | NewChums",
};

export default async function OnboardingUsernamePage({
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

  const { username, date_of_birth } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null })?.name
  );

  if (
    date_of_birth &&
    date_of_birth.trim() !== "" &&
    username != null &&
    username.trim() !== ""
  ) {
    const params = await searchParams;
    const returnTo = getSafeRedirectPath(params.returnTo);
    redirect(returnTo);
  }

  return (
    <Suspense fallback={null}>
      <OnboardingUsernameClient />
    </Suspense>
  );
}
