"use client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useState } from "react";
import { AppButton, AppCard, AppDialog, AppTextField, useToast } from "@/components/ui";

/**
 * Theme alignment proof: /ui showcases components that use the shared theme.
 */
export default function UIDemoClient() {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <Stack spacing={2.5}>
      <Typography component="h1" variant="h3">
        Theme Validation
      </Typography>
      <Typography color="text.secondary">
        Design-system sandbox. Buttons, inputs, cards, alerts, tooltips, and tables use the shared theme (aligned with template).
      </Typography>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Buttons
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} flexWrap="wrap">
          <AppButton>Primary</AppButton>
          <AppButton variant="outlined">Outlined</AppButton>
          <AppButton variant="text">Text</AppButton>
          <AppButton color="secondary">Secondary</AppButton>
          <AppButton color="error" variant="outlined">Error</AppButton>
        </Stack>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Inputs
        </Typography>
        <Stack spacing={1.5}>
          <AppTextField label="Email" placeholder="you@newchums.com" />
          <AppTextField label="Search" placeholder="Find events near me" helperText=" " />
        </Stack>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Alerts
        </Typography>
        <Stack spacing={1}>
          <Alert severity="success">Success message</Alert>
          <Alert severity="error">Error message</Alert>
          <Alert severity="warning" variant="outlined">Outlined warning</Alert>
        </Stack>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Chips & Tooltip
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label="Default" />
          <Chip label="Primary" color="primary" />
          <Tooltip title="Tooltip uses theme (inverted text/background)">
            <Chip label="Hover for tooltip" />
          </Tooltip>
        </Stack>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Progress & Accordion
        </Typography>
        <Stack spacing={2}>
          <LinearProgress variant="determinate" value={60} sx={{ height: 6 }} />
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>Accordion</AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2">Content uses theme divider and typography.</Typography>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Table
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>Event A</TableCell>
              <TableCell><Chip label="Active" color="success" size="small" /></TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Event B</TableCell>
              <TableCell><Chip label="Pending" size="small" /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </AppCard>

      <AppCard>
        <Typography variant="h6" gutterBottom>
          Dialog & Toasts
        </Typography>
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
