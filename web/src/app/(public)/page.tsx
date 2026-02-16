import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { AppButton, AppCard } from "@/components/ui";

export const metadata: Metadata = {
  title: "NewChums",
  description: "NewChums pilot experience",
};

export default function LandingPage() {
  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <AppCard sx={{ width: "100%", maxWidth: 680 }}>
        <Stack spacing={2.25}>
          <Typography component="h1" variant="h2">
            NewChums
          </Typography>
          <Typography color="text.secondary">
            Meet nearby people through shared events. Pilot UI shell is now in place.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
            <AppButton href="/login">
              Log in
            </AppButton>
            <AppButton href="/signup" variant="outlined">
              Create account
            </AppButton>
          </Stack>
        </Stack>
      </AppCard>
    </Box>
  );
}
