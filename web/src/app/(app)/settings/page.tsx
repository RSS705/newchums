import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Metadata } from "next";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

export const metadata: Metadata = {
  title: "Settings | NewChums",
};

export default function SettingsPage() {
  return (
    <Stack spacing={2}>
      <Typography component="h1" variant="h3">
        Settings
      </Typography>
      <Typography color="text.secondary">Stub - coming next.</Typography>
      <AppCard>
        <Stack spacing={1.5}>
          <AppTextField label="Display name" placeholder="Your name" />
          <AppButton>Save preferences</AppButton>
        </Stack>
      </AppCard>
    </Stack>
  );
}
