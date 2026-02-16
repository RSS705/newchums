import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard, NCTextField } from "@/components/ui";

export default function NewEventPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Create Event</Typography>
      <NCCard title="Event basics" subtitle="Create a new event draft.">
        <Stack spacing={2}>
          <NCTextField label="Title" placeholder="Coffee meetup in downtown" />
          <NCTextField label="Location" placeholder="City, venue, or neighborhood" />
          <NCTextField label="Description" multiline minRows={3} placeholder="What should attendees expect?" />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton>Create draft</NCButton>
            <NCButton variant="outlined">Preview</NCButton>
          </Stack>
        </Stack>
      </NCCard>
    </Stack>
  );
}

