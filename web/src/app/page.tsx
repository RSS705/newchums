import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard } from "@/components/ui";

export default function LandingPage() {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 6, md: 10 } }}>
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h3">NewChums</Typography>
          <Typography color="text.secondary">
            Discover local events, meet new people, and build your social circle.
          </Typography>
        </Stack>
        <NCCard>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton href="/signup">
              Create account
            </NCButton>
            <NCButton href="/login" variant="outlined">
              Log in
            </NCButton>
            <NCButton href="/ui-demo" variant="text">
              UI demo
            </NCButton>
          </Stack>
        </NCCard>
      </Stack>
    </Container>
  );
}
