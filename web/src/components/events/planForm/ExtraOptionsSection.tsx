"use client";

import { type WheelEvent } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";
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

  /** Optional "RSVP by" deadline (migration 119). Informational: RSVPs
   *  stay open after it; it tells people when the host needs answers. */
  rsvpByDate: Dayjs | null;
  onChangeRsvpByDate: (value: Dayjs | null) => void;
  rsvpByTime: Dayjs | null;
  onChangeRsvpByTime: (value: Dayjs | null) => void;
  rsvpByError?: string;
  /** Registers the field for the scroll-to-first-error helper. */
  registerRsvpByField?: (el: HTMLElement | null) => void;

  /** Edit-only toggle. Omit on the Add Plan form so the row does not render. */
  notifyAttendees?: {
    value: boolean;
    onChange: (value: boolean) => void;
  };
};

/** Tiny cluster caption. The section used to be one flat run of controls in
 *  no particular order, and its two numeric fields ("Minimum confirmed
 *  attendees" and "Minimum attendees required") were near-identical in name
 *  while belonging to different mechanisms. Two labelled clusters fix both:
 *  everything about showing up under ATTENDANCE, everything about getting
 *  in under JOINING, and each minimum sits visibly inside the mechanism it
 *  belongs to. */
function ClusterLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <Box sx={{ pt: first ? 0 : 1 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.secondary", fontWeight: 700, letterSpacing: 1, lineHeight: 1, display: "block" }}
      >
        {children}
      </Typography>
    </Box>
  );
}

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
  rsvpByDate,
  onChangeRsvpByDate,
  rsvpByTime,
  onChangeRsvpByTime,
  rsvpByError,
  registerRsvpByField,
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
  if (rsvpByDate?.isValid()) summaryParts.push(`RSVP by ${rsvpByDate.format("MMM D")}`);
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
        <ClusterLabel first>Attendance</ClusterLabel>
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
                  {/* "proceed" is the default and does exactly nothing: no
                      email, no cancellation. Hosts kept reading the old
                      "Proceed unless I cancel" as a nag they had to answer. */}
                  <MenuItem value="proceed">We&apos;ll do the plan anyway</MenuItem>
                  <MenuItem value="notify_host">Notify me so I can decide</MenuItem>
                  <MenuItem value="auto_cancel">Cancel the plan</MenuItem>
                </Select>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  Checked 2 hours before the start, based on who has confirmed.
                </Typography>
              </Box>
            )}
          </Stack>
        )}

        <TooltipToggleRow
          checked={muteHostAttendanceEmails}
          onChange={onChangeMuteHostAttendanceEmails}
          label="Mute attendance emails"
          tooltip="Stop emailing you when someone joins, leaves, or changes their RSVP for this plan, including invited people updating their attendance. You'll still get these in your in-app notifications, and you can check the plan anytime. Join requests and at-risk alerts are not affected."
        />

        <ClusterLabel>Joining</ClusterLabel>
        <Box ref={registerRsvpByField} sx={{ scrollMarginTop: 96 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>
            RSVP by (optional)
          </Typography>
          <Stack direction="row" spacing={1.5}>
            <DatePicker
              value={rsvpByDate}
              onChange={onChangeRsvpByDate}
              minDate={dayjs()}
              slotProps={{
                textField: {
                  size: "small",
                  placeholder: "Date",
                  error: !!rsvpByError,
                  sx: { flex: 1 },
                  onKeyDown: pickerFieldTabKeyDown,
                },
              }}
            />
            <TimePicker
              value={rsvpByTime}
              onChange={onChangeRsvpByTime}
              format="h:mm A"
              slotProps={{
                field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                textField: {
                  size: "small",
                  placeholder: "Time",
                  error: !!rsvpByError,
                  sx: { flex: 1 },
                  onKeyDown: pickerFieldTabKeyDown,
                },
              }}
            />
          </Stack>
          <Typography
            variant="caption"
            color={rsvpByError ? "error" : "text.secondary"}
            sx={{ mt: 0.5, display: "block" }}
          >
            {rsvpByError ??
              "Tell people when you need answers by. It shows on the plan, in invites, and on shared links. RSVPs stay open after it."}
          </Typography>
        </Box>

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
