import type { Metadata } from "next";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DashboardHome from "@/components/dashboard/DashboardHome";
import LandingPageContent from "./LandingPageContent";
import LandingLayout from "@/components/landing/LandingLayout";

export const metadata: Metadata = {
  title: "NewChums, Organize hobbies and events without the group chat chaos",
  description:
    "Sign up once and get notified when people nearby are organizing activities around your interests. Board games, coffee walks, pottery, and more.",
};

export default async function RootPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout isLoggedIn={false}>
        <LandingPageContent isLoggedIn={false} />
      </LandingLayout>
    );
  }

  const { username, date_of_birth, name } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null })?.name
  );

  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(`/onboarding/username?returnTo=${encodeURIComponent("/")}`);
  }

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <DashboardHome greetingName={greetingName} />
    </AppShell>
  );
}
