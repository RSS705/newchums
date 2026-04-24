import type { Metadata } from "next";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import AppShell from "@/components/layout/AppShell";
import LandingLayout from "@/components/landing/LandingLayout";
import RoadmapClient from "./RoadmapClient";

export const metadata: Metadata = {
  title: "Community Roadmap",
  description:
    "See what's coming next for NewChums. Submit ideas, vote on features, and help shape the future of the platform.",
  alternates: { canonical: "/roadmap" },
  openGraph: {
    title: "NewChums Community Roadmap",
    description:
      "See what's coming next for NewChums. Submit ideas, vote on features, and help shape the future of the platform.",
    url: "/roadmap",
  },
};

export default async function RoadmapPage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout isLoggedIn={false}>
        <Box sx={{ py: { xs: 2, sm: 4 } }}>
          <RoadmapClient isLoggedIn={false} />
        </Box>
      </LandingLayout>
    );
  }

  const { username, name } = await getOrCreateAppUser(
    session.user.email,
    (session.user as { name?: string | null }).name
  );

  const greetingName = getGreetingName({
    displayName: name,
    handle: username,
  });

  return (
    <AppShell user={{ name: greetingName }}>
      <RoadmapClient isLoggedIn={true} />
    </AppShell>
  );
}
