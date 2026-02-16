import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard, NCTextField } from "@/components/ui";

export default function EventsPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Events</Typography>
      <NCCard title="Find events" subtitle="Search by interest, location, or host.">
        <Stack spacing={2}>
          <NCTextField label="Search" placeholder="e.g., Hiking this weekend" />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label="Outdoors" />
            <Chip label="Food" />
            <Chip label="Workshops" />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton>Apply filters</NCButton>
            <NCButton variant="outlined">Clear</NCButton>
          </Stack>
        </Stack>
      </NCCard>
    </Stack>
  );
}

