import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { AppCard, AppButton } from "@/components/ui";

type EventDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;

  return {
    title: `Event ${id} | NewChums`,
  };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;

  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h3">
        Event Detail
      </Typography>
      <Typography color="text.secondary">Stub - coming next for event {id}.</Typography>
      <AppCard>
        <Stack spacing={1.5}>
          <Typography variant="h6">Event {id}</Typography>
          <Typography color="text.secondary">Detailed agenda, attendees, and actions will land here.</Typography>
          <AppButton>Register interest</AppButton>
        </Stack>
      </AppCard>
    </Stack>
  );
}
