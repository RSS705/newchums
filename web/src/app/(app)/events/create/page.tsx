import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

export const metadata: Metadata = {
  title: "Create Event | NewChums",
};

export default function CreateEventPage() {
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h3">
        Create Event
      </Typography>
      <Typography color="text.secondary">Stub - coming next.</Typography>
      <AppCard>
        <Stack spacing={1.5}>
          <AppTextField label="Event title" placeholder="Neighborhood brunch" />
          <AppTextField label="Short description" placeholder="A relaxed meetup for local members." />
          <AppButton>Create draft</AppButton>
        </Stack>
      </AppCard>
    </Stack>
  );
}
