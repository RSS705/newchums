import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard, NCTextField } from "@/components/ui";

type EventDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Event Detail</Typography>
      <NCCard title={`Event #${id}`} subtitle="Detail and RSVP sections will be added in a later chunk.">
        <Stack spacing={2}>
          <NCTextField label="Notes" placeholder="Private note for this event" />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton>RSVP</NCButton>
            <NCButton variant="outlined">Share</NCButton>
          </Stack>
        </Stack>
      </NCCard>
    </Stack>
  );
}

