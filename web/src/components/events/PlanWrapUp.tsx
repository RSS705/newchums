"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import MailRoundedIcon from "@mui/icons-material/MailRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import Link from "next/link";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { SECTION_SCROLL_MARGIN } from "@/lib/scrollOffsets";
import PlanHobbyAddSuggestion, { type PlanHobby } from "./PlanHobbyAddSuggestion";
import UserAvatar from "@/components/common/UserAvatar";
import { createEventHref } from "@/config/nav";

type Attendee = {
  userId: string;
  displayName: string;
  /** Real / display name when available (separate from handle so the UI can
   *  show "Real Name @handle" side-by-side). May be null. */
  name?: string | null;
  /** Pretty handle prefixed with `@`. May be null. */
  handle?: string | null;
  username: string | null;
  isHost: boolean;
  /** 'going' | 'maybe'. The host check-in only lists 'going' people, the
   *  committed set the public attendance record counts. */
  rsvpStatus?: string;
};

const CONDUCT_REASONS = [
  { value: "rude_aggressive", label: "Rude or aggressive behavior" },
  { value: "harassment", label: "Harassment or inappropriate comments" },
  { value: "boundary_issue", label: "Boundary issue" },
  { value: "discriminatory", label: "Discriminatory behavior" },
  { value: "unsafe_intoxicated", label: "Unsafe or intoxicated behavior" },
  { value: "disruptive", label: "Disruptive behavior" },
  { value: "property_damage", label: "Damage to property/items" },
  { value: "other", label: "Other" },
] as const;

/** Per-recipient shout-out draft. `serverMessage` is the value last seen from
 *  the API (for change detection on send). `serverStatus` is the moderation
 *  state; 'approved' and 'rejected' lock the slot. */
type ShoutoutDraft = {
  message: string;
  serverMessage: string;
  serverStatus: "none" | "pending" | "approved" | "rejected";
};

/** Wire-format payload for GET /events/{id}/wrap-up. Exported so callers that
 *  prefetch this endpoint (EventDetailClient on ?section=feedback deep links)
 *  can hand the result straight to <PlanWrapUp> via `initialData`. */
export type PlanWrapUpInitialData = {
  dismissed?: boolean;
  viewerIsHost?: boolean;
  attendees: Attendee[];
  shoutouts?: { recipientUserId: string; message: string; status: string }[];
  issuesAgainstMe?: { id: string; issueType: string; status: string }[];
  myReports?: { reportedUserId: string; issueType: string }[];
};

type PlanWrapUpProps = {
  eventId: string;
  /** Plan title shown in the section headers as a contextual reminder. */
  planTitle?: string;
  /** Plan start time (ISO), drives the shout-out window and the context line. */
  planStartsAt?: string;
  /** Hobbies attached to the plan; powers the one-tap add-to-profile nudge. */
  planHobbies?: PlanHobby[];
  /** Optional payload pre-fetched by the parent (?section=feedback deep link). */
  initialData?: unknown;
  /** DOM id for scroll anchoring without an extra wrapper. */
  id?: string;
};

function isWrapUpPayload(value: unknown): value is PlanWrapUpInitialData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.attendees);
}

const SHOUTOUT_MAX_LENGTH = 280;

/** The shout-out panel stays open for 7 days after the plan starts. The old
 *  form used the 3-day chat-lock window, but shout-outs are now the primary
 *  post-plan action rather than a post-submit reward, and a weekend plan
 *  shouted-out on the following weekend is normal human latency. Deliberately
 *  decoupled from the chat lock. The host's attendance check-in and the
 *  run-it-again prompt never expire: bookkeeping has no freshness window. */
const THANKS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isShoutoutWindowClosed(planStartsAt: string | undefined): boolean {
  if (!planStartsAt) return false;
  const startMs = new Date(planStartsAt).getTime();
  return !isNaN(startMs) && Date.now() >= startMs + THANKS_WINDOW_MS;
}

/**
 * The post-plan surface (replaced the PlanFeedback rating grid in July 2026):
 *
 * - Attendees get the shout-out card: per-person composer, Save to Chums,
 *   Message. No submit gate, no questions.
 * - The host gets ONE card holding everything: the same per-person rows with
 *   a private Came / No-show toggle added to each, plus the run-it-again
 *   prompt into the existing ?copy_from= create flow. Merged Aug 2026; the
 *   old separate check-in card read as a near-duplicate of the shout-out
 *   card, with the same people listed twice.
 *
 * The attendance toggle writes host-only no_show rows (retractable) and
 * notifies nobody. The dispute banner and the safety/conduct report survive
 * from the old surface unchanged.
 */
export default function PlanWrapUp({ eventId, planTitle, planStartsAt, planHobbies, initialData, id }: PlanWrapUpProps) {
  const initial = isWrapUpPayload(initialData) ? initialData : null;

  const initialShoutouts: Record<string, ShoutoutDraft> = {};
  if (initial?.shoutouts) {
    for (const s of initial.shoutouts) {
      const status = s.status === "pending" || s.status === "approved" || s.status === "rejected"
        ? s.status
        : "none";
      initialShoutouts[s.recipientUserId] = { message: s.message, serverMessage: s.message, serverStatus: status };
    }
  }
  const initialNoShows = new Set<string>(
    (initial?.myReports ?? []).filter((r) => r.issueType === "no_show").map((r) => r.reportedUserId),
  );

  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees ?? []);
  const [viewerIsHost, setViewerIsHost] = useState(!!initial?.viewerIsHost);
  const [loading, setLoading] = useState(initial == null);
  const [dismissed, setDismissed] = useState(!!initial?.dismissed);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const [issuesAgainstMe, setIssuesAgainstMe] = useState<{ id: string; issueType: string; status: string }[]>(
    initial?.issuesAgainstMe ?? [],
  );
  const [disputing, setDisputing] = useState(false);

  /** Attendee ids the host has marked as no-shows (their own reports only). */
  const [noShows, setNoShows] = useState<Set<string>>(initialNoShows);
  const [noShowPending, setNoShowPending] = useState<Record<string, boolean>>({});

  const [conductDialogOpen, setConductDialogOpen] = useState(false);
  const [conductTarget, setConductTarget] = useState<Attendee | null>(null);
  const [conductReason, setConductReason] = useState<string>("");
  const [conductDetails, setConductDetails] = useState("");
  const [conductSubmitting, setConductSubmitting] = useState(false);
  const [conductDone, setConductDone] = useState(false);

  // Chum-status cache. `undefined` = in flight, `null` = check failed (hide
  // the action), boolean = current state.
  const [chumStatus, setChumStatus] = useState<Record<string, boolean | null | undefined>>({});
  const [chumLoading, setChumLoading] = useState<Record<string, boolean>>({});

  const [shoutouts, setShoutouts] = useState<Record<string, ShoutoutDraft>>(initialShoutouts);
  const [shoutoutSending, setShoutoutSending] = useState<Record<string, boolean>>({});

  const avatarBase = getAvatarBaseUrl();

  // Guards against a stale GET stomping optimistic state: React strict mode
  // double-fires the mount effect, and the slower of the two responses can
  // land AFTER the host has already toggled a row, silently reverting the
  // visible state while the write sits committed on the server. `loadSeqRef`
  // drops out-of-order responses entirely; `noShowsDirtyRef` stops any load
  // from overwriting the checklist once the host has touched it.
  const loadSeqRef = useRef(0);
  const noShowsDirtyRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const res = await apiFetch(`/events/${eventId}/wrap-up`, { auth: true });
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as PlanWrapUpInitialData;
      if (seq !== loadSeqRef.current) return;
      if (data.dismissed) { setDismissed(true); setLoading(false); return; }
      setAttendees(data.attendees);
      setViewerIsHost(!!data.viewerIsHost);
      if (data.shoutouts && data.shoutouts.length > 0) {
        const next: Record<string, ShoutoutDraft> = {};
        for (const s of data.shoutouts) {
          const status = s.status === "pending" || s.status === "approved" || s.status === "rejected"
            ? s.status
            : "none";
          next[s.recipientUserId] = { message: s.message, serverMessage: s.message, serverStatus: status };
        }
        setShoutouts(next);
      }
      if (data.myReports && data.myReports.length > 0 && !noShowsDirtyRef.current) {
        setNoShows(new Set(data.myReports.filter((r) => r.issueType === "no_show").map((r) => r.reportedUserId)));
      }
      if (data.issuesAgainstMe && data.issuesAgainstMe.length > 0) {
        setIssuesAgainstMe(data.issuesAgainstMe);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    if (initial) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const ensureChumStatus = useCallback(async (userId: string) => {
    setChumStatus((prev) => {
      if (userId in prev) return prev;
      return { ...prev, [userId]: undefined };
    });
    try {
      const res = await apiFetch(`/chums/check/${userId}`, { auth: true });
      const data = (await res.json()) as { ok?: boolean; isSaved?: boolean };
      setChumStatus((prev) => ({ ...prev, [userId]: data.ok ? (data.isSaved ?? false) : null }));
    } catch {
      setChumStatus((prev) => ({ ...prev, [userId]: null }));
    }
  }, []);

  const toggleChum = useCallback(async (userId: string) => {
    const current = chumStatus[userId];
    if (current === null || current === undefined) return;
    setChumLoading((prev) => ({ ...prev, [userId]: true }));
    setChumStatus((prev) => ({ ...prev, [userId]: !current }));
    try {
      const res = await apiFetch(`/chums/${userId}`, {
        auth: true,
        method: current ? "DELETE" : "POST",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!data.ok) setChumStatus((prev) => ({ ...prev, [userId]: current }));
    } catch {
      setChumStatus((prev) => ({ ...prev, [userId]: current }));
    } finally {
      setChumLoading((prev) => ({ ...prev, [userId]: false }));
    }
  }, [chumStatus]);

  const shoutoutWindowClosed = isShoutoutWindowClosed(planStartsAt);

  // The shout-out panel is the first thing everyone sees, so chum status is
  // fetched as soon as the surface loads (not gated behind a submit any more).
  useEffect(() => {
    if (loading || dismissed || shoutoutWindowClosed) return;
    for (const a of attendees) {
      if (!(a.userId in chumStatus)) void ensureChumStatus(a.userId);
    }
  }, [loading, dismissed, shoutoutWindowClosed, attendees, chumStatus, ensureChumStatus]);

  const setShoutoutMessage = (userId: string, value: string) => {
    setShoutouts((prev) => {
      const existing = prev[userId];
      const trimmed = value.slice(0, SHOUTOUT_MAX_LENGTH);
      return {
        ...prev,
        [userId]: {
          message: trimmed,
          serverMessage: existing?.serverMessage ?? "",
          serverStatus: existing?.serverStatus ?? "none",
        },
      };
    });
  };

  const handleSendShoutout = async (userId: string) => {
    const draft = shoutouts[userId];
    const message = draft?.message?.trim() ?? "";
    if (!message) return;
    const slotEditable = !draft || draft.serverStatus === "none" || draft.serverStatus === "pending";
    const messageChanged = message !== (draft?.serverMessage?.trim() ?? "");
    if (!slotEditable || !messageChanged) return;
    setShoutoutSending((prev) => ({ ...prev, [userId]: true }));
    try {
      const res = await apiFetch(`/events/${eventId}/shoutout`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: userId, message }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (res.ok && data.ok) {
        setShoutouts((prev) => ({
          ...prev,
          [userId]: { message, serverMessage: message, serverStatus: "pending" },
        }));
      }
    } catch { /* silent, the user can retry */ }
    setShoutoutSending((prev) => ({ ...prev, [userId]: false }));
  };

  /** Host check-in write: optimistic flip, POST to record a no-show, DELETE to
   *  retract one. Nothing here notifies anyone. */
  const toggleNoShow = async (userId: string, cameValue: boolean) => {
    if (noShowPending[userId]) return;
    noShowsDirtyRef.current = true;
    const currentlyNoShow = noShows.has(userId);
    const wantNoShow = !cameValue;
    if (wantNoShow === currentlyNoShow) return;
    setNoShowPending((prev) => ({ ...prev, [userId]: true }));
    setNoShows((prev) => {
      const next = new Set(prev);
      if (wantNoShow) next.add(userId); else next.delete(userId);
      return next;
    });
    try {
      const res = await apiFetch(`/events/${eventId}/attendance-issue`, {
        auth: true,
        method: wantNoShow ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wantNoShow ? { reportedUserId: userId, issueType: "no_show" } : { reportedUserId: userId }),
      });
      if (!res.ok) throw new Error("write failed");
    } catch {
      // Revert the optimistic flip so the UI never lies about what is stored.
      setNoShows((prev) => {
        const next = new Set(prev);
        if (wantNoShow) next.delete(userId); else next.add(userId);
        return next;
      });
    } finally {
      setNoShowPending((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleDispute = async () => {
    setDisputing(true);
    try {
      const res = await apiFetch(`/events/${eventId}/attendance-dispute`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setIssuesAgainstMe((prev) => prev.map((i) => i.status === "active" ? { ...i, status: "disputed" } : i));
      }
    } catch { /* silent */ }
    setDisputing(false);
  };

  const handleConductReport = async () => {
    if (!conductTarget || !conductReason) return;
    setConductSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/conduct-report`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId: conductTarget.userId,
          reason: conductReason,
          details: conductDetails.trim() || undefined,
        }),
      });
      if (res.ok) setConductDone(true);
    } catch { /* silent */ }
    setConductSubmitting(false);
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await apiFetch(`/events/${eventId}/wrap-up/dismiss`, {
        auth: true,
        method: "POST",
      });
      if (res.ok) {
        setDismissed(true);
        setDismissDialogOpen(false);
      }
    } catch { /* silent */ }
    setDismissing(false);
  };

  if (loading) return null;
  if (dismissed) return null;
  // Non-hosts with nobody to shout out and nothing against them have no surface.
  // The host card always renders (run-it-again is useful even for a plan
  // nobody else joined).
  if (!viewerIsHost && attendees.length === 0 && issuesAgainstMe.length === 0) return null;

  const planContextLine = formatPlanContext(planTitle, planStartsAt);
  const checkableAttendees = attendees.filter((a) => !a.isHost && a.rsvpStatus === "going");
  // After the shout-out window the host card shrinks to pure bookkeeping, so
  // only the people the attendance record covers keep a row.
  const hostRows = shoutoutWindowClosed ? checkableAttendees : attendees;

  const openConductDialog = (target: Attendee | null) => {
    setConductTarget(target);
    setConductDone(false);
    setConductReason("");
    setConductDetails("");
    setConductDialogOpen(true);
  };

  /** One person row, shared by the host card and the attendee card. The host
   *  card adds the private Came / No-show toggle (withAttendance) and, once
   *  the 7-day shout-out window has passed, drops the public actions and
   *  keeps only the bookkeeping (withShoutouts=false). */
  const renderPersonRow = (a: Attendee, withAttendance: boolean, withShoutouts: boolean) => {
    const profileHref = a.username ? `/u/${a.username.replace(/^@/, "")}` : null;
    const realName = a.name?.trim() || null;
    const handle = a.handle
      ?? (a.username ? `@${a.username.replace(/^@/, "")}` : null);
    const primaryLabel = realName || handle || a.displayName;
    const saved = chumStatus[a.userId];
    const showChum = withShoutouts && saved !== null;
    const draft = shoutouts[a.userId];
    const status = draft?.serverStatus ?? "none";
    const message = draft?.message ?? "";
    const locked = status === "approved" || status === "rejected";
    const sending = !!shoutoutSending[a.userId];
    const sendable =
      message.trim().length > 0 &&
      message.trim() !== (draft?.serverMessage?.trim() ?? "") &&
      !locked;
    const checkable = withAttendance && !a.isHost && a.rsvpStatus === "going";
    const isNoShow = checkable && noShows.has(a.userId);
    return (
      <Paper
        key={a.userId}
        variant="outlined"
        sx={{
          p: { xs: 1.5, sm: 1.75 },
          borderRadius: 2.5,
          borderColor: isNoShow ? "#fde68a" : "grey.200",
          bgcolor: isNoShow ? "#fffbeb" : undefined,
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1.25, sm: 1.5 }}
          alignItems={{ xs: "stretch", sm: "center" }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <UserAvatar
              src={`${avatarBase}/users/${a.userId}/avatar`}
              name={a.displayName}
              username={a.username}
              size={40}
              sx={{ flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                <Typography
                  component={profileHref ? Link : "span"}
                  {...(profileHref ? { href: profileHref } : {})}
                  sx={{
                    fontWeight: 700,
                    fontSize: "0.9375rem",
                    color: profileHref ? "primary.dark" : "text.primary",
                    textDecoration: "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    "&:hover": profileHref ? { textDecoration: "underline" } : {},
                  }}
                >
                  {primaryLabel}
                </Typography>
                {a.isHost && (
                  <Chip
                    label="Host"
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      bgcolor: "primary.main",
                      color: "#fff",
                      flexShrink: 0,
                      "& .MuiChip-label": { px: 0.75 },
                    }}
                  />
                )}
              </Stack>
              {/* Honest moderation caption: shout-outs sit in a review queue
                  until a moderator approves them, so never promise a
                  timeline. */}
              {withShoutouts && status === "pending" && (
                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem" }}>
                  Sent for review. It appears on their profile once approved.
                </Typography>
              )}
              {withShoutouts && status === "approved" && (
                <Typography variant="caption" sx={{ color: "success.dark", fontSize: "0.6875rem", fontWeight: 600 }}>
                  Shout-out live on their profile
                </Typography>
              )}
            </Box>
            {checkable && (
              <Tooltip title="Private, for your records only. Nobody is notified." arrow>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={isNoShow ? "no_show" : "came"}
                  onChange={(_, value) => {
                    if (value === null) return;
                    void toggleNoShow(a.userId, value === "came");
                  }}
                  disabled={!!noShowPending[a.userId]}
                  sx={{ flexShrink: 0 }}
                >
                  <ToggleButton
                    value="came"
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      px: 1.25,
                      py: 0.375,
                      "&.Mui-selected": {
                        bgcolor: "#dcfce7",
                        color: "#166534",
                        "&:hover": { bgcolor: "#bbf7d0" },
                      },
                    }}
                  >
                    Came
                  </ToggleButton>
                  <ToggleButton
                    value="no_show"
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      px: 1.25,
                      py: 0.375,
                      "&.Mui-selected": {
                        bgcolor: "#fef3c7",
                        color: "#92400e",
                        "&:hover": { bgcolor: "#fde68a" },
                      },
                    }}
                  >
                    No-show
                  </ToggleButton>
                </ToggleButtonGroup>
              </Tooltip>
            )}
          </Stack>
          {showChum && (
            <Tooltip title={saved ? "Remove from your Chums" : "Add to your Chums"} arrow>
              <Button
                onClick={() => toggleChum(a.userId)}
                disabled={!!chumLoading[a.userId] || saved === undefined}
                size="small"
                variant={saved ? "outlined" : "contained"}
                color={saved ? "inherit" : "primary"}
                startIcon={saved
                  ? <HowToRegRoundedIcon sx={{ fontSize: 17 }} />
                  : <PersonAddRoundedIcon sx={{ fontSize: 17 }} />}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2,
                  fontSize: "0.78rem",
                  px: 1.5,
                  py: 0.5,
                  flexShrink: 0,
                  alignSelf: { xs: "stretch", sm: "center" },
                  ...(saved ? {
                    borderColor: "success.light",
                    color: "success.dark",
                    bgcolor: "#f0fdf4",
                    "&:hover": { borderColor: "success.main", bgcolor: "#dcfce7" },
                  } : {
                    boxShadow: "none",
                    "&:hover": { boxShadow: "none", opacity: 0.92 },
                  }),
                }}
              >
                {saved ? "Saved as Chum" : "Save to Chums"}
              </Button>
            </Tooltip>
          )}
          {withShoutouts && (
            <Tooltip title={`Send ${primaryLabel} a private message`} arrow>
              <Button
                component={Link}
                href={`/inbox?to=${a.userId}`}
                size="small"
                variant="outlined"
                color="inherit"
                startIcon={<MailRoundedIcon sx={{ fontSize: 17 }} />}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2,
                  fontSize: "0.78rem",
                  px: 1.5,
                  py: 0.5,
                  flexShrink: 0,
                  alignSelf: { xs: "stretch", sm: "center" },
                  color: "text.secondary",
                  borderColor: "divider",
                  "&:hover": { borderColor: "text.secondary", bgcolor: "action.hover" },
                }}
              >
                Message
              </Button>
            </Tooltip>
          )}
        </Stack>
        {withShoutouts && !locked && (
          <Stack direction="row" spacing={1} alignItems="stretch" sx={{ mt: 1.25 }}>
            <TextField
              value={message}
              onChange={(e) => setShoutoutMessage(a.userId, e.target.value)}
              placeholder={`Give ${primaryLabel} a shout-out for their profile (optional)`}
              multiline
              // No row cap: autosize measures the placeholder too,
              // and any fixed cap clips its last line mid-glyph at
              // phone widths once a long display name pushes it
              // past the cap. Content is bounded anyway by
              // SHOUTOUT_MAX_LENGTH, so the field cannot run away.
              fullWidth
              size="small"
              inputProps={{ maxLength: SHOUTOUT_MAX_LENGTH }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  bgcolor: "background.default",
                  fontSize: "0.8125rem",
                },
              }}
            />
            <Button
              onClick={() => handleSendShoutout(a.userId)}
              disabled={!sendable || sending}
              size="small"
              variant="outlined"
              startIcon={<CampaignRoundedIcon sx={{ fontSize: 16 }} />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2,
                fontSize: "0.78rem",
                px: 1.5,
                flexShrink: 0,
                // The row Stack is alignItems: "stretch", so the
                // button always matches the TextField's rendered
                // height. minHeight unsets the 44px button floor.
                minHeight: 0,
                alignSelf: "stretch",
              }}
            >
              {sending ? "Sending…" : status === "pending" ? "Update" : "Send"}
            </Button>
          </Stack>
        )}
      </Paper>
    );
  };

  return (
    <>
      <Box
        id={id}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, sm: 2.5 },
          scrollMarginTop: SECTION_SCROLL_MARGIN,
        }}
      >
        {/* Dispute banner for attendance records against the current user.
            Survives from the old surface: the record is public and
            host-recorded, so the person it describes keeps their recourse. */}
        {issuesAgainstMe.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, sm: 2.25 },
              borderRadius: 3,
              borderColor: issuesAgainstMe.every((i) => i.status === "disputed") ? "grey.300" : "#fbbf24",
              bgcolor: issuesAgainstMe.every((i) => i.status === "disputed") ? "#f8fafc" : "#fffbeb",
            }}
          >
            <Typography fontWeight={700} sx={{ fontSize: "0.9375rem", mb: 0.5 }}>
              {issuesAgainstMe.every((i) => i.status === "disputed")
                ? "You disputed an attendance concern on this plan"
                : "An attendance concern was raised about you for this plan"}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, lineHeight: 1.55 }}>
              {issuesAgainstMe.every((i) => i.status === "disputed")
                ? "Your dispute has been recorded. A moderator may review if needed."
                : "If you believe this is inaccurate, you can dispute it. Your dispute is private and the reporter will not be notified."}
            </Typography>
            {issuesAgainstMe.some((i) => i.status === "active") && (
              <Button
                size="small"
                variant="outlined"
                onClick={handleDispute}
                disabled={disputing}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
              >
                {disputing ? "Disputing…" : "Dispute this concern"}
              </Button>
            )}
          </Paper>
        )}

        {/* ── Host: check-in, shout-outs, and run-it-again in one card ── */}
        {viewerIsHost && (
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, borderColor: "grey.200", bgcolor: "background.paper" }}
          >
            <Typography
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.125rem", sm: "1.25rem" },
                lineHeight: 1.25,
                mb: hostRows.length > 0 ? 0.25 : 1.75,
              }}
            >
              How did {planTitle?.trim() ? `"${planTitle.trim()}"` : "your plan"} go?
            </Typography>
            {hostRows.length > 0 && (
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontSize: "0.8125rem", lineHeight: 1.55, mb: 1.75 }}
              >
                {shoutoutWindowClosed
                  ? "Mark who made it. This is private, for your records only, and nobody is notified."
                  : "The Came and No-show marks are private, for your records only, and nobody is notified. Shout-outs are the opposite: short public notes on someone's profile, the funnier the better. You can also save people to your Chums for next time. All of it is optional."}
              </Typography>
            )}
            {hostRows.length > 0 && (
              <Stack spacing={1.5}>
                {hostRows.map((a) => renderPersonRow(a, true, !shoutoutWindowClosed))}
              </Stack>
            )}
            {!shoutoutWindowClosed && planHobbies && planHobbies.length > 0 && (
              <Box sx={{ mt: 1.75 }}>
                <PlanHobbyAddSuggestion planHobbies={planHobbies} />
              </Box>
            )}
            {hostRows.length > 0 && <Divider sx={{ my: 2 }} />}
            <Button
              component={Link}
              href={`${createEventHref}?copy_from=${eventId}`}
              variant="contained"
              startIcon={<EventRepeatRoundedIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2.5,
                boxShadow: "none",
                "&:hover": { boxShadow: "none", opacity: 0.94 },
              }}
            >
              Run it again
            </Button>
            <Typography variant="caption" sx={{ display: "block", color: "text.disabled", fontSize: "0.75rem", mt: 0.75 }}>
              Starts a new plan pre-filled from this one. You just pick the date.
            </Typography>
          </Paper>
        )}

        {/* ── Attendee: shout-outs, Save to Chums, Message ──────────────── */}
        {!viewerIsHost && attendees.length > 0 && !shoutoutWindowClosed && (
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, borderColor: "grey.200", bgcolor: "background.paper" }}
          >
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.25, mb: 0.25 }}>
              Anyone deserve a shout-out?
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontSize: "0.8125rem", lineHeight: 1.55, mb: 1.75 }}
            >
              {planContextLine ? `${planContextLine}. ` : ""}Shout-outs are short public notes on someone&apos;s profile, the funnier the better. You can also save people to your Chums for next time. All of it is optional.
            </Typography>
            <Stack spacing={1.5}>
              {attendees.map((a) => renderPersonRow(a, false, true))}
            </Stack>
            {planHobbies && planHobbies.length > 0 && (
              <Box sx={{ mt: 1.75 }}>
                <PlanHobbyAddSuggestion planHobbies={planHobbies} />
              </Box>
            )}
          </Paper>
        )}

        {/* ── Quiet footer: safety escalation + opt-out ─────────────────── */}
        {attendees.length > 0 && (
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 0.75, sm: 2.5 }}
            justifyContent="center"
            alignItems="center"
            sx={{ pt: 0.5 }}
          >
            <Button
              onClick={() => openConductDialog(attendees.length === 1 ? attendees[0] : null)}
              variant="text"
              size="small"
              startIcon={<ShieldOutlinedIcon sx={{ fontSize: 16 }} />}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8125rem",
                color: "text.secondary",
                backgroundColor: "transparent",
                "&:hover": { bgcolor: "action.hover", color: "error.dark" },
              }}
            >
              Report a safety or conduct concern
            </Button>
            <Button
              onClick={() => setDismissDialogOpen(true)}
              variant="text"
              size="small"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.8125rem",
                color: "text.disabled",
                backgroundColor: "transparent",
                "&:hover": { bgcolor: "action.hover", color: "text.secondary" },
              }}
            >
              Hide this
            </Button>
          </Stack>
        )}
      </Box>

      {/* Conduct report dialog, unchanged from the old surface: safety
          reporting survives the rating grid it used to live behind. */}
      <Dialog
        open={conductDialogOpen}
        onClose={() => setConductDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {conductDone ? (
          <DialogContent sx={{ p: 0 }}>
            <DialogSuccessState
              title="Report received"
              message="Our team will review this confidentially. The person you reported will not be notified."
              onClose={() => setConductDialogOpen(false)}
            />
          </DialogContent>
        ) : (
          <>
            <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
              Report a concern
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  This report is confidential and will not be shared with the person you are reporting.
                </Typography>
                <FormControl fullWidth size="small">
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>Who?</Typography>
                  <Select
                    value={conductTarget?.userId ?? ""}
                    onChange={(e) => {
                      const a = attendees.find((att) => att.userId === e.target.value);
                      if (a) setConductTarget(a);
                    }}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="" disabled>Select a person</MenuItem>
                    {attendees.map((a) => (
                      <MenuItem key={a.userId} value={a.userId}>{a.displayName}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>What happened?</Typography>
                  <Select
                    value={conductReason}
                    onChange={(e) => setConductReason(e.target.value)}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="" disabled>Select a reason</MenuItem>
                    {CONDUCT_REASONS.map((r) => (
                      <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>Details (optional)</Typography>
                  <TextField
                    value={conductDetails}
                    onChange={(e) => setConductDetails(e.target.value)}
                    placeholder="Any additional context..."
                    multiline
                    rows={3}
                    fullWidth
                    size="small"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setConductDialogOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
                Cancel
              </Button>
              <Button
                onClick={handleConductReport}
                disabled={!conductTarget || !conductReason || conductSubmitting}
                variant="contained"
                color="error"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  "&.Mui-disabled": { bgcolor: "grey.200", color: "grey.500" },
                }}
              >
                {conductSubmitting ? "Submitting..." : "Submit report"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Hide-this confirmation */}
      <Dialog
        open={dismissDialogOpen}
        onClose={() => setDismissDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        <DialogContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              px: { xs: 2, sm: 3 },
              pt: { xs: 3, sm: 3.5 },
              pb: { xs: 2.75, sm: 3 },
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: "grey.100",
                color: "text.secondary",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <VisibilityOffOutlinedIcon sx={{ fontSize: 28 }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", mb: 0.75 }}>
              Hide this for good?
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.875rem", lineHeight: 1.55, maxWidth: 320, mb: 2.5 }}>
              This card will not be shown again for this plan. Shout-outs you already sent are unaffected.
            </Typography>
            <Stack direction="row" spacing={1.25}>
              <Button
                onClick={() => setDismissDialogOpen(false)}
                variant="outlined"
                color="inherit"
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5 }}
              >
                Keep it
              </Button>
              <Button
                onClick={handleDismiss}
                disabled={dismissing}
                variant="contained"
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", "&:hover": { boxShadow: "none" } }}
              >
                {dismissing ? "Hiding…" : "Hide it"}
              </Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact success-confirmation block used inside the conduct dialog. */
function DialogSuccessState({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        px: { xs: 1, sm: 2 },
        pt: { xs: 3, sm: 3.5 },
        pb: { xs: 2.75, sm: 3 },
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          bgcolor: "success.main",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          mb: 2,
          boxShadow: "0 4px 14px rgba(22, 163, 74, 0.28)",
        }}
      >
        <CheckRoundedIcon sx={{ fontSize: 36 }} />
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", lineHeight: 1.3, mb: 0.75 }}>
        {title}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          fontSize: "0.875rem",
          lineHeight: 1.55,
          maxWidth: 320,
          mb: 2.5,
        }}
      >
        {message}
      </Typography>
      <Button
        onClick={onClose}
        variant="contained"
        color="primary"
        sx={{
          textTransform: "none",
          fontWeight: 700,
          borderRadius: 2.5,
          px: 4,
          py: 0.875,
          fontSize: "0.875rem",
          boxShadow: "none",
          "&:hover": { boxShadow: "none", opacity: 0.94 },
        }}
      >
        Done
      </Button>
    </Box>
  );
}

/** Short contextual reminder for the shout-out header ("You met at <title>
 *  on <date>"). Returns null when neither field is available. */
function formatPlanContext(title: string | undefined, startsAtIso: string | undefined): string | null {
  const cleanTitle = title?.trim();
  let dateStr: string | null = null;
  if (startsAtIso) {
    const d = new Date(startsAtIso);
    if (!isNaN(d.getTime())) {
      dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
  }
  if (cleanTitle && dateStr) return `You met at ${cleanTitle} on ${dateStr}`;
  if (cleanTitle) return `You met at ${cleanTitle}`;
  if (dateStr) return `You met on ${dateStr}`;
  return null;
}
