"use client";

import { type WheelEvent } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import { AppCard, HelpTooltip } from "@/components/ui";

export type FallbackPolicy = "notify_host" | "proceed" | "auto_cancel";

type Props = {
  requireReconfirmation: boolean;
  onChangeRequireReconfirmation: (value: boolean) => void;

  minConfirmedAttendees: string;
  onChangeMinConfirmedAttendees: (value: string) => void;

  fallbackPolicy: FallbackPolicy;
  onChangeFallbackPolicy: (value: FallbackPolicy) => void;

  requireApproval: boolean;
  onChangeRequireApproval: (value: boolean) => void;

  allowAttendeeInvites: boolean;
  onChangeAllowAttendeeInvites: (value: boolean) => void;

  muteHostAttendanceEmails: boolean;
  onChangeMuteHostAttendanceEmails: (value: boolean) => void;

  /** Edit-only toggle. Omit on the Add Plan form so the row does not render. */
  notifyAttendees?: {
    value: boolean;
    onChange: (value: boolean) => void;
  };
};

/** Help-icon-next-to-a-toggle row. Kept as an internal helper rather than a
 *  public component so the Add and Edit forms cannot introduce per-row sx
 *  drift by tweaking alignment or spacing. */
function TooltipToggleRow({
  checked,
  onChange,
  label,
  tooltip,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tooltip: string;
}) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <FormControlLabel
        control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
        label={label}
        sx={{ mr: 0, gap: 0.5 }}
      />
      <HelpTooltip title={tooltip} />
    </Stack>
  );
}

export default function ExtraOptionsSection(props: Props) {
  const showMinDetails =
    props.minConfirmedAttendees !== "" && Number(props.minConfirmedAttendees) >= 1;

  return (
    <AppCard>
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: "primary.light",
              color: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <TuneRoundedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
            >
              Extra options
            </Typography>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
            >
              Attendance checks, approvals, and other host controls.
            </Typography>
          </Box>
        </Stack>

        <TooltipToggleRow
          checked={props.requireReconfirmation}
          onChange={props.onChangeRequireReconfirmation}
          label="24-hour attendance check"
          tooltip="About 24 hours before the plan, people who marked Going will be asked to confirm they are still coming. This includes you as the host."
        />

        {props.requireReconfirmation && (
          <Stack
            spacing={2}
            sx={{ mt: 1, pl: 2, borderLeft: "2px solid", borderColor: "divider" }}
          >
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>
                Minimum confirmed attendees (optional)
              </Typography>
              <TextField
                fullWidth
                size="small"
                type="number"
                placeholder="e.g. 4 (including you)"
                value={props.minConfirmedAttendees}
                onChange={(e) => props.onChangeMinConfirmedAttendees(e.target.value)}
                // Disable scroll-wheel value changes; see CreateEventClient seat field for context.
                inputProps={{
                  min: 1,
                  max: 500,
                  onWheel: (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5, display: "block" }}
              >
                Minimum people who need to confirm before the plan is considered viable. You count
                toward this total.
              </Typography>
            </Box>
            {showMinDetails && (
              <Box>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>
                  If minimum isn&apos;t met
                </Typography>
                <Select
                  fullWidth
                  size="small"
                  value={props.fallbackPolicy}
                  onChange={(e) => props.onChangeFallbackPolicy(e.target.value as FallbackPolicy)}
                >
                  <MenuItem value="notify_host">Notify me so I can decide</MenuItem>
                  <MenuItem value="proceed">Proceed unless I cancel</MenuItem>
                  <MenuItem value="auto_cancel">Auto-cancel the plan</MenuItem>
                </Select>
              </Box>
            )}
          </Stack>
        )}

        <TooltipToggleRow
          checked={props.requireApproval}
          onChange={props.onChangeRequireApproval}
          label="Require approval before joining"
          tooltip="People who are not directly invited will need to request to join, and you'll approve or decline each request."
        />

        <FormControlLabel
          control={
            <Switch
              checked={props.allowAttendeeInvites}
              onChange={(e) => props.onChangeAllowAttendeeInvites(e.target.checked)}
            />
          }
          label="Let Going attendees invite others"
          sx={{ gap: 0.5 }}
        />

        <TooltipToggleRow
          checked={props.muteHostAttendanceEmails}
          onChange={props.onChangeMuteHostAttendanceEmails}
          label="Mute attendance emails"
          tooltip="Stop emailing you when someone joins, leaves, or changes their RSVP for this plan, including invited people updating their attendance. You'll still get these in your in-app notifications, and you can check the plan anytime. Join requests and at-risk alerts are not affected."
        />

        {props.notifyAttendees && (
          <FormControlLabel
            control={
              <Switch
                checked={props.notifyAttendees.value}
                onChange={(e) => props.notifyAttendees!.onChange(e.target.checked)}
              />
            }
            label="Notify attendees about these changes"
            sx={{ gap: 0.5 }}
          />
        )}
      </Stack>
    </AppCard>
  );
}
