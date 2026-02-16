"use client";

import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ConfirmDialog, NCButton, NCCard, NCTextField, useToast } from "@/components/ui";

export default function UiDemoClient() {
  const { showToast } = useToast();
  const [open, setOpen] = React.useState(false);

  return (
    <Stack spacing={3}>
      <Typography variant="h4">UI Demo</Typography>
      <NCCard title="Buttons">
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <NCButton onClick={() => showToast({ message: "Saved successfully", severity: "success" })}>
            Success toast
          </NCButton>
          <NCButton
            variant="outlined"
            onClick={() => showToast({ message: "Something needs attention", severity: "warning" })}
          >
            Warning toast
          </NCButton>
          <NCButton color="error" onClick={() => setOpen(true)}>
            Open confirm
          </NCButton>
        </Stack>
      </NCCard>
      <NCCard title="Inputs">
        <Stack spacing={2}>
          <NCTextField label="Name" placeholder="Your name" />
          <NCTextField label="Notes" multiline minRows={3} />
        </Stack>
      </NCCard>
      <ConfirmDialog
        open={open}
        title="Discard changes?"
        description="This action cannot be undone."
        confirmLabel="Discard"
        confirmColor="error"
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          showToast({ message: "Changes discarded", severity: "info" });
        }}
      />
    </Stack>
  );
}

