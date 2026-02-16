"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { AppButton, AppCard, AppDialog, AppTextField, useToast } from "@/components/ui";

export default function UIDemoClient() {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <Stack spacing={2.5}>
      <Typography component="h1" variant="h3">
        UI Validation
      </Typography>
      <Typography color="text.secondary">
        Responsive design-system sandbox for buttons, fields, cards, dialogs, and toasts.
      </Typography>

      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <AppButton>Primary</AppButton>
          <AppButton variant="outlined">Outlined</AppButton>
          <AppButton variant="text">Text</AppButton>
        </Stack>
      </AppCard>

      <AppCard>
        <Stack spacing={1.5}>
          <AppTextField label="Email" placeholder="you@newchums.com" />
          <AppTextField label="Search" placeholder="Find events near me" helperText=" " />
        </Stack>
      </AppCard>

      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
          <AppButton onClick={() => setOpen(true)}>Open dialog</AppButton>
          <AppButton variant="outlined" onClick={() => toast.success("Saved successfully")}>
            Success toast
          </AppButton>
          <AppButton variant="outlined" onClick={() => toast.error("Something failed")}>
            Error toast
          </AppButton>
        </Stack>
      </AppCard>

      <AppDialog
        open={open}
        onClose={() => setOpen(false)}
        dialogTitle="Demo dialog"
        dialogContent={
          <Typography color="text.secondary">
            Dialog shape, spacing, and actions come from the shared theme overrides.
          </Typography>
        }
        dialogActions={
          <>
            <AppButton variant="text" onClick={() => setOpen(false)}>
              Cancel
            </AppButton>
            <AppButton onClick={() => setOpen(false)}>Confirm</AppButton>
          </>
        }
      />
    </Stack>
  );
}
