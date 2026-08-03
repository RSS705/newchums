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
import { HelpTooltip } from "@/components/ui";
import CollapsibleSection from "./CollapsibleSection";

export type FallbackPolicy = "notify_host" | "proceed" | "auto_cancel";

type Props = {
  /** Collapsed by default (two-tier form); the parent owns the open state so
   *  validation errors can force the section open. */
  expanded: boolean;
  onToggle: () => void;

  requireReconfirmation: boolean;
  onChangeRequireReconfirmation: (value: boolean) => void;

  minConfirmedAttendees: string;
  onChangeMinConfirmedAttendees: (value: string) => void;

  fallbackPolicy: FallbackPolicy;
  onChangeFallbackPolicy: (value: FallbackPolicy) => void;

  requireApproval: boolean;
  onChangeRequireApproval: (value: boolean) => void;

  /** Inverted presentation of the stored `allow_attendee_invites` flag: the
   *  DB/API field stays "allow" (default true) so existing plans and
   *  permission checks are untouched; the form surfaces it as "prevent"
   *  (default off) so every toggle in this section defaults to off. */
  preventAttendeeInvites: boolean;
  onChangePreventAttendeeInvites: (value: boolean) => void;

  muteHostAttendanceEmails: boolean;
  onChangeMuteHostAttendanceEmails: (value: boolean) => void;

  /** Optional RSVP-based auto-cancel threshold. Lives here (rather than with
   *  the seat count) because it is an optional host control with a safe
   *  default, which is the definition of this section in the two-tier form. */
  minAttendeesRequired: string;
  onChangeMinAttendeesRequired: (value: string) => void;
  minAttendeesError?: string;
  /** Registers the threshold field for the scroll-to-first-error helper. */
  registerMinAttendeesField?: (el: HTMLElement | null) => void;

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

export default function ExtraOptionsSection({
  expanded,
  onToggle,
  requireReconfirmation,
  onChangeRequireReconfirmation,
  minConfirmedAttendees,
  onChangeMinConfirmedAttendees,
  fallbackPolicy,
  onChangeFallbackPolicy,
  requireApproval,
  onChangeRequireApproval,
  preventAttendeeInvites,
  onChangePreventAttendeeInvites,
  muteHostAttendanceEmails,
  onChangeMuteHostAttendanceEmails,
  minAttendeesRequired,
  onChangeMinAttendeesRequired,
  minAttendeesError,
  registerMinAttendeesField,
  notifyAttendees,
}: Props) {
  const showMinDetails =
    minConfirmedAttendees !== "" && Number(minConfirmedAttendees) >= 1;

  // Collapsed-header summary. The attendance check is on by default, so its
  // state always leads the line: "on" reads as already working (not an
  // offer), and "off" is the deviation worth surfacing. Other controls
  // append only when active.
  const summaryParts: string[] = [
    requireReconfirmation ? "24-hour attendance check on" : "Attendance check off",
  ];
  if (requireApproval) summaryParts.push("approval to join");
  if (preventAttendeeInvites) summaryParts.push("host-only invites");
  if (muteHostAttendanceEmails) summaryParts.push("attendance emails muted");
  if (minAttendeesRequired.trim())
    summaryParts.push(`auto-cancel under ${minAttendeesRequired.trim()}`);
  const summary = summaryParts.join(" + ");

  return (
    <CollapsibleSection
      sectionKey="extras"
      icon={<TuneRoundedIcon sx={{ fontSize: 22 }} />}
      title="Extra options"
      subtitle="Attendance checks, approvals, and other host controls."
      summary={summary}
      expanded={expanded}
      onToggle={onToggle}
    >
      <Stack spacing={2.5}>
        <TooltipToggleRow
          checked={requireReconfirmation}
          onChange={onChangeRequireReconfirmation}
          label="24-hour attendance check"
          tooltip="On for every new plan. About 24 hours before it starts, everyone who marked Going (you included) is asked to confirm they are still coming. Turn it off if you don't want confirmations for this plan."
        />

        {requireReconfirmation && (
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
                value={minConfirmedAttendees}
                onChange={(e) => onChangeMinConfirmedAttendees(e.target.value)}
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
                  value={fallbackPolicy}
                  onChange={(e) => onChangeFallbackPolicy(e.target.value as FallbackPolicy)}
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
          checked={requireApproval}
          onChange={onChangeRequireApproval}
          label="Require approval before joining"
          tooltip="People who are not directly invited will need to request to join, and you'll approve or decline each request."
        />

        <TooltipToggleRow
          checked={preventAttendeeInvites}
          onChange={onChangePreventAttendeeInvites}
          label="Prevent attendees from inviting others"
          tooltip="Normally, people marked Going can invite others to the plan. Turn this on to keep invites host-only."
        />

        <TooltipToggleRow
          checked={muteHostAttendanceEmails}
          onChange={onChangeMuteHostAttendanceEmails}
          label="Mute attendance emails"
          tooltip="Stop emailing you when someone joins, leaves, or changes their RSVP for this plan, including invited people updating their attendance. You'll still get these in your in-app notifications, and you can check the plan anytime. Join requests and at-risk alerts are not affected."
        />

        <Box
          ref={registerMinAttendeesField}
          sx={{ width: { xs: "100%", sm: "auto" }, scrollMarginTop: 96 }}
        >
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>
            Minimum attendees required (optional)
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="number"
            placeholder="e.g. 4"
            value={minAttendeesRequired}
            onChange={(e) => onChangeMinAttendeesRequired(e.target.value)}
            error={!!minAttendeesError}
            helperText={
              minAttendeesError ??
              "If fewer than this many people are going 2 hours before the plan, NewChums will automatically cancel it."
            }
            inputProps={{
              min: 1,
              max: 500,
              onWheel: (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
            }}
            sx={{ minWidth: { xs: "100%", sm: 320 } }}
          />
        </Box>

        {notifyAttendees && (
          <FormControlLabel
            control={
              <Switch
                checked={notifyAttendees.value}
                onChange={(e) => notifyAttendees!.onChange(e.target.checked)}
              />
            }
            label="Notify attendees about these changes"
            sx={{ gap: 0.5 }}
          />
        )}
      </Stack>
    </CollapsibleSection>
  );
}
