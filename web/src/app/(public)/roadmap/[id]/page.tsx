import type { Metadata } from "next";
import Box from "@mui/material/Box";
import { auth } from "@/auth";
import { getGreetingName } from "@/lib/greeting";
import { getOrCreateAppUser } from "@/lib/user";
import AppShell from "@/components/layout/AppShell";
import LandingLayout from "@/components/landing/LandingLayout";
import RoadmapItemClient from "./RoadmapItemClient";

export const metadata: Metadata = {
  title: "Roadmap Item | NewChums",
};

export default async function RoadmapItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <LandingLayout isLoggedIn={false}>
        <Box sx={{ py: { xs: 2, sm: 4 } }}>
          <RoadmapItemClient itemId={id} isLoggedIn={false} />
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
      <RoadmapItemClient itemId={id} isLoggedIn={true} />
    </AppShell>
  );
}
