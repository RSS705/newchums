import { redirect } from "next/navigation";
import { getSafeRedirectPath } from "@/lib/authRedirect";

/** Redirect legacy /onboarding/date-of-birth links to combined onboarding form. */
export default async function OnboardingDateOfBirthPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = getSafeRedirectPath(params.returnTo);
  redirect(`/onboarding/username?returnTo=${encodeURIComponent(returnTo)}`);
}
