import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard, NCTextField } from "@/components/ui";

export default function HomePage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Home</Typography>
      <NCCard title="Welcome back" subtitle="Your dashboard feed and recommendations will appear here.">
        <Stack spacing={2} direction={{ xs: "column", sm: "row" }}>
          <NCButton>Explore events</NCButton>
          <NCButton variant="outlined">Invite a friend</NCButton>
        </Stack>
      </NCCard>
      <NCCard title="Quick note">
        <NCTextField label="What are you planning this week?" placeholder="Add a short note..." multiline />
      </NCCard>
    </Stack>
  );
}

