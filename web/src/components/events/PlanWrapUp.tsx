"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
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
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
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

type KudosTagInfo = { tag: string; label: string; emoji: string };

/** Kudos state for the viewer on this plan: what they already gave, the tag
 *  catalogue (served by the API so the client never carries its own copy),
 *  and the per-plan cap. */
type KudosPayload = {
  given: { recipientUserId: string; tag: string }[];
  tags: KudosTagInfo[];
  maxPerPlan: number;
  windowClosesAt: string | null;
};

/** Wire-format payload for GET /events/{id}/wrap-up. Exported so callers that
 *  prefetch this endpoint (EventDetailClient on ?section=feedback deep links)
 *  can hand the result straight to <PlanWrapUp> via `initialData`. */
export type PlanWrapUpInitialData = {
  dismissed?: boolean;
  viewerIsHost?: boolean;
  attendees: Attendee[];
  kudos?: KudosPayload;
  issuesAgainstMe?: { id: string; issueType: string; status: string }[];
  myReports?: { reportedUserId: string; issueType: string }[];
};

type PlanWrapUpProps = {
  eventId: string;
  /** Plan title shown in the section headers as a contextual reminder. */
  planTitle?: string;
  /** Plan start time (ISO), drives the kudos window and the context line. */
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

/** The kudos panel stays open for 7 days after the plan starts (the API
 *  enforces the same window). A weekend plan given kudos on the following
 *  weekend is normal human latency. Deliberately decoupled from the chat
 *  lock. The host's attendance check-in and the run-it-again prompt never
 *  expire: bookkeeping has no freshness window. */
const THANKS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isKudosWindowClosed(planStartsAt: string | undefined): boolean {
  if (!planStartsAt) return false;
  const startMs = new Date(planStartsAt).getTime();
  return !isNaN(startMs) && Date.now() >= startMs + THANKS_WINDOW_MS;
}

/**
 * The post-plan surface (replaced the PlanFeedback rating grid in July 2026):
 *
 * - Attendees get the kudos card: per-person "Give kudos" (a fixed tag
 *   catalogue, one tap, anonymous), Save to Chums, Message. No submit gate,
 *   no questions, no free text and nothing to moderate.
 * - The host gets ONE card holding everything: the same per-person rows with
 *   a private Came / No-show toggle added to each, plus the run-it-again
 *   prompt into the existing ?copy_from= create flow. Merged Aug 2026; the
 *   old separate check-in card read as a near-duplicate of the kudos card,
 *   with the same people listed twice.
 *
 * The attendance toggle writes host-only no_show rows (retractable) and
 * notifies nobody. The dispute banner and the safety/conduct report survive
 * from the old surface unchanged.
 */
export default function PlanWrapUp({ eventId, planTitle, planStartsAt, planHobbies, initialData, id }: PlanWrapUpProps) {
  const initial = isWrapUpPayload(initialData) ? initialData : null;

  const initialKudos: Record<string, string> = {};
  for (const k of initial?.kudos?.given ?? []) initialKudos[k.recipientUserId] = k.tag;
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

  /** recipientUserId -> tag the viewer gave on this plan. */
  const [kudosGiven, setKudosGiven] = useState<Record<string, string>>(initialKudos);
  const [kudosTags, setKudosTags] = useState<KudosTagInfo[]>(initial?.kudos?.tags ?? []);
  const [kudosMax, setKudosMax] = useState<number>(initial?.kudos?.maxPerPlan ?? 3);
  const [kudosBusy, setKudosBusy] = useState<Record<string, boolean>>({});
  const [kudosPickerFor, setKudosPickerFor] = useState<Attendee | null>(null);
  const [kudosError, setKudosError] = useState<string | null>(null);

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
      if (data.kudos) {
        const next: Record<string, string> = {};
        for (const k of data.kudos.given ?? []) next[k.recipientUserId] = k.tag;
        setKudosGiven(next);
        setKudosTags(data.kudos.tags ?? []);
        setKudosMax(data.kudos.maxPerPlan ?? 3);
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

  const kudosWindowClosed = isKudosWindowClosed(planStartsAt);

  // The kudos panel is the first thing everyone sees, so chum status is
  // fetched as soon as the surface loads (not gated behind a submit).
  useEffect(() => {
    if (loading || dismissed || kudosWindowClosed) return;
    for (const a of attendees) {
      if (!(a.userId in chumStatus)) void ensureChumStatus(a.userId);
    }
  }, [loading, dismissed, kudosWindowClosed, attendees, chumStatus, ensureChumStatus]);

  const givenCount = Object.keys(kudosGiven).length;

  /** Give (or change) a kudos tag: optimistic, reverted on failure. One tap
   *  in the picker is the whole interaction, so the dialog closes on success. */
  const giveKudos = async (userId: string, tag: string) => {
    if (kudosBusy[userId]) return;
    const previous = kudosGiven[userId];
    setKudosBusy((prev) => ({ ...prev, [userId]: true }));
    setKudosError(null);
    setKudosGiven((prev) => ({ ...prev, [userId]: tag }));
    const revert = () => setKudosGiven((prev) => {
      const next = { ...prev };
      if (previous) next[userId] = previous; else delete next[userId];
      return next;
    });
    try {
      const res = await apiFetch(`/events/${eventId}/kudos`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientUserId: userId, tag }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        revert();
        setKudosError(
          data.error === "KUDOS_WINDOW_CLOSED" ? "Kudos for this plan have closed."
          : data.error === "KUDOS_LIMIT" ? `You can give up to ${kudosMax} kudos per plan.`
          : data.message ?? "Couldn't save that. Try again.",
        );
        return;
      }
      setKudosPickerFor(null);
    } catch {
      revert();
      setKudosError("Couldn't save that. Try again.");
    } finally {
      setKudosBusy((prev) => ({ ...prev, [userId]: false }));
    }
  };

  /** Take a kudos back. Optimistic; reverted on failure. */
  const removeKudos = async (userId: string) => {
    if (kudosBusy[userId]) return;
    const previous = kudosGiven[userId];
    if (!previous) return;
    setKudosBusy((prev) => ({ ...prev, [userId]: true }));
    setKudosGiven((prev) => { const next = { ...prev }; delete next[userId]; return next; });
    try {
      const res = await apiFetch(`/events/${eventId}/kudos/${userId}`, { auth: true, method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
    } catch {
      setKudosGiven((prev) => ({ ...prev, [userId]: previous }));
    } finally {
      setKudosBusy((prev) => ({ ...prev, [userId]: false }));
    }
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
  // After the kudos window the host card shrinks to pure bookkeeping, so
  // only the people the attendance record covers keep a row.
  const hostRows = kudosWindowClosed ? checkableAttendees : attendees;

  const openConductDialog = (target: Attendee | null) => {
    setConductTarget(target);
    setConductDone(false);
    setConductReason("");
    setConductDetails("");
    setConductDialogOpen(true);
  };

  /** One person row, shared by the host card and the attendee card. The host
   *  card adds the private Came / No-show toggle (withAttendance) and, once
   *  the 7-day kudos window has passed, drops the public actions and keeps
   *  only the bookkeeping (withKudos=false). */
  const renderPersonRow = (a: Attendee, withAttendance: boolean, withKudos: boolean) => {
    const profileHref = a.username ? `/u/${a.username.replace(/^@/, "")}` : null;
    const realName = a.name?.trim() || null;
    const handle = a.handle
      ?? (a.username ? `@${a.username.replace(/^@/, "")}` : null);
    const primaryLabel = realName || handle || a.displayName;
    const saved = chumStatus[a.userId];
    const showChum = withKudos && saved !== null;
    const givenTag = kudosGiven[a.userId];
    const givenInfo = givenTag ? kudosTags.find((t) => t.tag === givenTag) : undefined;
    const atLimit = !givenTag && givenCount >= kudosMax;
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
            </Box>
            {checkable && (
              <Tooltip title="Private, for your records only. Nobody is notified." arrow>
                {/* span keeps the tooltip alive while the group is disabled
                    (a disabled element fires no events for MUI to hook); it
                    inherits the group's slot in the row, so it must not
                    shrink at phone widths. */}
                <span style={{ display: "inline-flex", flexShrink: 0 }}>
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
                </span>
              </Tooltip>
            )}
          </Stack>
          {showChum && (
            <Tooltip title={saved ? "Remove from your Chums" : "Add to your Chums"} arrow>
              {/* Box wrapper keeps the tooltip alive while the button is
                  disabled (in-flight chum check or toggle); it takes over
                  the button's slot in the row so xs stretch still works. */}
              <Box
                component="span"
                sx={{ display: "inline-flex", flexShrink: 0, alignSelf: { xs: "stretch", sm: "center" }, "& > button": { width: "100%" } }}
              >
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
              </Box>
            </Tooltip>
          )}
          {withKudos && (
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
        {withKudos && (
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
            {givenInfo ? (
              <Chip
                label={`${givenInfo.emoji} ${givenInfo.label}`}
                onClick={() => { setKudosError(null); setKudosPickerFor(a); }}
                onDelete={() => void removeKudos(a.userId)}
                disabled={!!kudosBusy[a.userId]}
                sx={{
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  height: 30,
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  "& .MuiChip-deleteIcon": { color: "primary.dark", opacity: 0.7, "&:hover": { opacity: 1 } },
                }}
              />
            ) : (
              <Button
                size="small"
                variant="outlined"
                startIcon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 17 }} />}
                onClick={() => { setKudosError(null); setKudosPickerFor(a); }}
                disabled={atLimit || !!kudosBusy[a.userId]}
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2, fontSize: "0.78rem", px: 1.5, py: 0.5 }}
              >
                Give kudos
              </Button>
            )}
            {givenInfo && (
              <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem" }}>
                Tap to change, × to take it back. They won&apos;t see who it was from.
              </Typography>
            )}
            {!givenInfo && atLimit && (
              <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem" }}>
                You&apos;ve given your {kudosMax} kudos for this plan.
              </Typography>
            )}
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

        {/* ── Host: check-in, kudos, and run-it-again in one card ── */}
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
                {kudosWindowClosed
                  ? "Mark who made it. This is private, for your records only, and nobody is notified."
                  : "The Came and No-show marks are private, for your records only, and nobody is notified. Kudos are quick props that collect on someone's profile as counts; nobody sees who gave what. You can also save people to your Chums for next time. All of it is optional."}
              </Typography>
            )}
            {hostRows.length > 0 && (
              <Stack spacing={1.5}>
                {hostRows.map((a) => renderPersonRow(a, true, !kudosWindowClosed))}
              </Stack>
            )}
            {!kudosWindowClosed && planHobbies && planHobbies.length > 0 && (
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

        {/* ── Attendee: kudos, Save to Chums, Message ───────────────────── */}
        {!viewerIsHost && attendees.length > 0 && !kudosWindowClosed && (
          <Paper
            variant="outlined"
            sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3, borderColor: "grey.200", bgcolor: "background.paper" }}
          >
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.25, mb: 0.25 }}>
              Anyone deserve kudos?
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", fontSize: "0.8125rem", lineHeight: 1.55, mb: 1.75 }}
            >
              {planContextLine ? `${planContextLine}. ` : ""}Pick a person, pick a tag. Kudos are anonymous and collect on their profile. You can also save people to your Chums for next time. All of it is optional.
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

      {/* Kudos picker: one tap gives the tag and closes. Tapping the
          current tag again just closes; a different one swaps it. */}
      <Dialog
        open={kudosPickerFor !== null}
        onClose={() => setKudosPickerFor(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
          Kudos for {kudosPickerFor?.name?.trim() || kudosPickerFor?.handle || kudosPickerFor?.displayName || "them"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.55 }}>
            Pick one. It&apos;s anonymous, and it collects on their profile.
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1 }}>
            {kudosTags.map((t) => {
              const target = kudosPickerFor;
              const selected = target ? kudosGiven[target.userId] === t.tag : false;
              return (
                <ButtonBase
                  key={t.tag}
                  onClick={() => {
                    if (!target) return;
                    if (selected) { setKudosPickerFor(null); return; }
                    void giveKudos(target.userId, t.tag);
                  }}
                  disabled={target ? !!kudosBusy[target.userId] : true}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 0.5,
                    p: 1.25,
                    borderRadius: 2.5,
                    border: "2px solid",
                    borderColor: selected ? "primary.main" : "divider",
                    bgcolor: selected ? "primary.light" : "background.default",
                    textAlign: "center",
                    transition: "border-color 0.15s ease, background-color 0.15s ease",
                    "&:hover": { borderColor: "primary.main" },
                  }}
                >
                  <Typography component="span" sx={{ fontSize: "1.75rem", lineHeight: 1 }} aria-hidden>{t.emoji}</Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.25, color: selected ? "primary.dark" : "text.primary" }}>
                    {t.label}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
          {kudosError && (
            <Typography variant="caption" color="error" sx={{ display: "block", mt: 1.25, fontWeight: 600 }}>
              {kudosError}
            </Typography>
          )}
          <Typography variant="caption" sx={{ display: "block", mt: 1.25, color: "text.disabled" }}>
            {givenCount} of {kudosMax} kudos used on this plan.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setKudosPickerFor(null)} sx={{ textTransform: "none", fontWeight: 600 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

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
              This card will not be shown again for this plan. Kudos you already gave are unaffected.
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

/** Short contextual reminder for the kudos header ("You met at <title>
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
