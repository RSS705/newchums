import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { NCButton, NCCard } from "@/components/ui";

export default function SettingsPage() {
  return (
    <Stack spacing={3}>
      <Typography variant="h4">Settings</Typography>
      <NCCard title="Preferences" subtitle="Core user settings will be added incrementally.">
        <Stack spacing={2}>
          <FormControlLabel control={<Switch defaultChecked />} label="Email notifications" />
          <FormControlLabel control={<Switch />} label="Push reminders" />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <NCButton>Save settings</NCButton>
            <NCButton variant="outlined">Reset</NCButton>
          </Stack>
        </Stack>
      </NCCard>
    </Stack>
  );
}

