import { redirect } from "next/navigation";

export const runtime = "edge";

/** Redirect legacy /onboarding/date-of-birth links to combined onboarding form. */
export default async function OnboardingDateOfBirthPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  const returnTo = params.returnTo ?? "/home";
  redirect(`/onboarding/username?returnTo=${encodeURIComponent(returnTo)}`);
}
