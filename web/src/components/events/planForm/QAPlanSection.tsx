"use client";

import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { AppCard } from "@/components/ui";

type Props = {
  /** Gate rendering on super-admin role; section is hidden otherwise. */
  show: boolean;
  value: boolean;
  onChange: (value: boolean) => void;
};

export default function QAPlanSection({ show, value, onChange }: Props) {
  if (!show) return null;
  return (
    <AppCard>
      <Stack spacing={1}>
        <FormControlLabel
          control={<Switch checked={value} onChange={(e) => onChange(e.target.checked)} size="small" />}
          label="QA plan"
          slotProps={{
            typography: { variant: "subtitle1", fontWeight: 600, fontSize: "1.0625rem" },
          }}
          sx={{ gap: 0.5 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
          QA plans are only visible to super admins. Normal users will never see this plan
          anywhere in the system.
        </Typography>
      </Stack>
    </AppCard>
  );
}
