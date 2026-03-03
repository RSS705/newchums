import type { Metadata } from "next";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import LandingLayout from "@/components/landing/LandingLayout";
import ContactView from "@/components/contact/ContactView";

export const metadata: Metadata = {
  title: "Contact | NewChums",
  description: "Contact NewChums - we'd love to hear from you.",
};

export default async function ContactPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout isLoggedIn={false}>
        <Box sx={{ py: { xs: 4, sm: 6 } }}>
          <ContactView />
        </Box>
      </LandingLayout>
    );
  }

  const { username, date_of_birth, name } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null }).name
  );

  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(`/onboarding/username?returnTo=${encodeURIComponent("/contact")}`);
  }

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <ContactView
        initialName={name ?? ""}
        initialEmail={session.user.email ?? ""}
      />
    </AppShell>
  );
}
