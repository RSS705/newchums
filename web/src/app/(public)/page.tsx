import type { Metadata } from "next";
import { auth } from "@/auth";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import DashboardHome from "@/components/dashboard/DashboardHome";
import LandingHero from "@/components/landing/LandingHero";
import LandingLayout from "@/components/landing/LandingLayout";

export const metadata: Metadata = {
  title: "NewChums",
  description: "Find your people. Meet through shared events.",
};

export default async function RootPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout>
        <LandingHero />
      </LandingLayout>
    );
  }

  const { username, date_of_birth } = await getOrCreateAppUser(
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

  return (
    <AppShell user={{ name: (session.user as { name?: string | null })?.name }}>
      <DashboardHome
        userName={(session.user as { name?: string | null })?.name}
        upcomingCount={2}
      />
    </AppShell>
  );
}
