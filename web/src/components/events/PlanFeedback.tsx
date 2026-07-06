"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import Link from "next/link";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { scrollElementIntoView } from "@/lib/scrollUtils";
import { trackEvent } from "@/lib/analytics";
import PlanHobbyAddSuggestion, { type PlanHobby } from "./PlanHobbyAddSuggestion";
import UserAvatar from "@/components/common/UserAvatar";

type Response = "agree" | "maybe" | "disagree" | null;
/** `match_quality` remains in the type so prior saved answers hydrate without
 *  a type error, but it is no longer asked in the UI: the metric is collected
 *  into user_metrics and never consumed by any matching logic. */
type Prompt = "reliability" | "sociability" | "presentation" | "match_quality" | "hosting_skills";

type Attendee = {
  userId: string;
  displayName: string;
  /** Real / display name when available (separate from handle so the UI can
   *  show "Real Name @handle" side-by-side). May be null if the user only has
   *  a handle. */
  name?: string | null;
  /** Pretty handle prefixed with `@`. May be null. */
  handle?: string | null;
  username: string | null;
  isHost: boolean;
};

type FeedbackState = Record<string, Partial<Record<Prompt, Response>>>;

/** The three metrics the matching system actually consumes for everyone,
 *  plus the host-only hosting question. `match_quality` was removed from the
 *  flow because nothing reads it (verified against evaluateChumPreferences
 *  in api/src/lib/chumPreferences.ts). */
const PROMPTS: { key: Prompt; label: string; hostOnly?: boolean }[] = [
  { key: "reliability", label: "Showed up and followed through reliably" },
  { key: "sociability", label: "I'd spend time with this person again" },
  { key: "presentation", label: "Showed basic in-person cleanliness and consideration" },
  { key: "hosting_skills", label: "Ran a well-organized plan", hostOnly: true },
];

const ATTENDANCE_ISSUES = [
  { value: "no_show", label: "No-show" },
  { value: "late_cancel", label: "Cancelled too late" },
  { value: "very_late", label: "Arrived very late" },
] as const;

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

const RESPONSE_OPTIONS: { value: "agree" | "maybe" | "disagree"; label: string; selectedBg: string; selectedColor: string; hoverBg: string }[] = [
  { value: "agree", label: "Yes", selectedBg: "#dcfce7", selectedColor: "#166534", hoverBg: "#bbf7d0" },
  { value: "maybe", label: "Somewhat", selectedBg: "#fef3c7", selectedColor: "#92400e", hoverBg: "#fde68a" },
  { value: "disagree", label: "No", selectedBg: "#f3f4f6", selectedColor: "#4b5563", hoverBg: "#e5e7eb" },
];

/** Per-recipient shout-out draft. `serverMessage` is the value last seen from
 *  the API (for change detection on submit). `serverStatus` is the moderation
 *  state, if it's 'approved' or 'rejected' the slot is locked and the
 *  textarea is read-only. Hoisted to module scope so the prefetch path can
 *  type its initial map without forward-referencing a function-local type. */
type ShoutoutDraft = {
  message: string;
  serverMessage: string;
  serverStatus: "none" | "pending" | "approved" | "rejected";
};

/** Wire-format payload for /events/{id}/feedback. Exported so callers that
 *  prefetch this endpoint (e.g. EventDetailClient on email deep-links) can
 *  hand the result straight to <PlanFeedback> via `initialData` and avoid
 *  the second round-trip + content pop-in. */
export type PlanFeedbackInitialData = {
  dismissed?: boolean;
  attendees: Attendee[];
  feedback: { reviewee_user_id: string; prompt: string; response: string }[];
  attendanceIssues: { reported_user_id: string; issue_type: string }[];
  issuesAgainstMe?: { id: string; issueType: string; status: string }[];
  shoutouts?: { recipientUserId: string; message: string; status: string }[];
};

type PlanFeedbackProps = {
  eventId: string;
  /** Plan title shown in the intro header as a contextual reminder. */
  planTitle?: string;
  /** Plan start time (ISO) shown in the intro header as a contextual reminder. */
  planStartsAt?: string;
  /** Hobbies attached to the plan. When the viewer is in the post-submit
   *  "thanks" state and is missing at least one of these on their profile,
   *  we show a single inline button to add them. */
  planHobbies?: PlanHobby[];
  /** Optional payload pre-fetched by the parent (used when the visitor was
   *  deep-linked via ?section=feedback). When provided, the component skips
   *  its own initial fetch and renders content on first paint. */
  initialData?: unknown;
  /** DOM id attached to the outer wrapper, lets callers use this component
   *  as a scroll anchor (e.g. `?section=feedback` deep-links) without wrapping
   *  it in an extra Box that would otherwise consume Stack-gap when the
   *  component returns null. */
  id?: string;
};

function isFeedbackPayload(value: unknown): value is PlanFeedbackInitialData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.attendees) && Array.isArray(v.feedback) && Array.isArray(v.attendanceIssues);
}

const SHOUTOUT_MAX_LENGTH = 280;

/** The post-submit "Keep the connection going" panel closes 3 days after the
 *  plan starts, the same window as the plan chat lock (see `chatLockDate` in
 *  EventDetailClient), so the whole plan page settles at the same time
 *  instead of leaving one interactive block open forever. */
const FOLLOW_UP_LOCK_MS = 3 * 24 * 60 * 60 * 1000;

function isFollowUpLocked(planStartsAt: string | undefined): boolean {
  if (!planStartsAt) return false;
  const startMs = new Date(planStartsAt).getTime();
  return !isNaN(startMs) && Date.now() >= startMs + FOLLOW_UP_LOCK_MS;
}

export default function PlanFeedback({ eventId, planTitle, planStartsAt, planHobbies, initialData, id }: PlanFeedbackProps) {
  const initial = isFeedbackPayload(initialData) ? initialData : null;

  // Compute initial state from a prefetched payload (when the parent passed
  // `initialData`). Mirrors the logic in load() so the first paint matches
  // what a child-side fetch would have produced.
  const initialFeedbackState: FeedbackState = {};
  const initialSubmittedSet = new Set<string>();
  if (initial) {
    for (const f of initial.feedback) {
      if (!initialFeedbackState[f.reviewee_user_id]) initialFeedbackState[f.reviewee_user_id] = {};
      initialFeedbackState[f.reviewee_user_id][f.prompt as Prompt] = f.response as Response;
      initialSubmittedSet.add(f.reviewee_user_id);
    }
  }
  const initialShoutouts: Record<string, ShoutoutDraft> = {};
  if (initial?.shoutouts) {
    for (const s of initial.shoutouts) {
      const status = s.status === "pending" || s.status === "approved" || s.status === "rejected"
        ? s.status
        : "none";
      initialShoutouts[s.recipientUserId] = { message: s.message, serverMessage: s.message, serverStatus: status };
    }
  }
  const initialReportedIssues = new Set<string>(
    initial?.attendanceIssues.map((i) => `${i.reported_user_id}:${i.issue_type}`) ?? []
  );
  const initialIssuesAgainstMe = initial?.issuesAgainstMe ?? [];
  const initiallyDismissed = !!initial?.dismissed;
  const initiallySubmitted = !!initial && !initial.dismissed
    && initial.attendees.length > 0
    && initial.attendees.every((a) => initialSubmittedSet.has(a.userId));

  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees ?? []);
  const [feedback, setFeedback] = useState<FeedbackState>(initialFeedbackState);
  /** Reviewees whose responses have been saved to the API (this session or a
   *  prior visit). Drives the small per-person "Saved" chip. */
  const [submittedSet, setSubmittedSet] = useState<Set<string>>(initialSubmittedSet);
  // When the parent prefetched the payload there's nothing to load, render
  // content on first paint instead of returning null.
  const [loading, setLoading] = useState(initial == null);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<Attendee | null>(null);
  const [issueType, setIssueType] = useState<string>("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueDone, setIssueDone] = useState(false);
  const [reportedIssues, setReportedIssues] = useState<Set<string>>(initialReportedIssues);

  const [conductDialogOpen, setConductDialogOpen] = useState(false);
  const [conductTarget, setConductTarget] = useState<Attendee | null>(null);
  const [conductReason, setConductReason] = useState<string>("");
  const [conductDetails, setConductDetails] = useState("");
  const [conductSubmitting, setConductSubmitting] = useState(false);
  const [conductDone, setConductDone] = useState(false);

  const [issuesAgainstMe, setIssuesAgainstMe] = useState<{ id: string; issueType: string; status: string }[]>(initialIssuesAgainstMe);
  const [disputing, setDisputing] = useState(false);

  // Chum-status cache for the reviewed attendees. `undefined` = not yet
  // checked, `null` = check failed (hide the action), boolean = current state.
  const [chumStatus, setChumStatus] = useState<Record<string, boolean | null | undefined>>({});
  const [chumLoading, setChumLoading] = useState<Record<string, boolean>>({});

  const [shoutouts, setShoutouts] = useState<Record<string, ShoutoutDraft>>(initialShoutouts);
  const [shoutoutSending, setShoutoutSending] = useState<Record<string, boolean>>({});

  // Ref on the top of the feedback section. Used as the scroll target for
  // the success state so the confirmation always begins at the top of the
  // section on mobile rather than mid-screen behind the submit button.
  const formTopRef = useRef<HTMLDivElement>(null);
  const thanksPanelRef = useRef<HTMLDivElement>(null);
  // Tracks whether the latest flip into `submitted=true` was the user's own
  // submit action vs. an initial hydration from the API. We only want to
  // auto-scroll on the former.
  const justSubmittedRef = useRef(false);
  useEffect(() => {
    if (!submitted || !justSubmittedRef.current) return;
    justSubmittedRef.current = false;
    // Recenter to the top of the feedback section so the confirmation card
    // sits squarely in view. scrollElementIntoView (not scrollIntoView)
    // because the latter can land on a non-scrolling ancestor on mobile,
    // see lib/scrollUtils.
    const target = formTopRef.current ?? thanksPanelRef.current;
    if (target) scrollElementIntoView(target);
  }, [submitted]);

  const avatarBase = getAvatarBaseUrl();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/feedback`, { auth: true });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as PlanFeedbackInitialData;
      if (data.dismissed) { setDismissed(true); setLoading(false); return; }
      setAttendees(data.attendees);

      if (data.shoutouts && data.shoutouts.length > 0) {
        const next: Record<string, ShoutoutDraft> = {};
        for (const s of data.shoutouts) {
          const status = s.status === "pending" || s.status === "approved" || s.status === "rejected"
            ? s.status
            : "none";
          next[s.recipientUserId] = {
            message: s.message,
            serverMessage: s.message,
            serverStatus: status,
          };
        }
        setShoutouts(next);
      }

      if (data.feedback.length > 0) {
        const state: FeedbackState = {};
        const already = new Set<string>();
        for (const f of data.feedback) {
          if (!state[f.reviewee_user_id]) state[f.reviewee_user_id] = {};
          state[f.reviewee_user_id][f.prompt as Prompt] = f.response as Response;
          already.add(f.reviewee_user_id);
        }
        setFeedback(state);
        setSubmittedSet(already);
        // If every eligible attendee has at least one prior response, we're
        // already in the post-submit "thanks" state on first paint.
        if (data.attendees.every((a) => already.has(a.userId))) {
          setSubmitted(true);
        }
      }

      if (data.attendanceIssues.length > 0) {
        setReportedIssues(new Set(data.attendanceIssues.map((i) => `${i.reported_user_id}:${i.issue_type}`)));
      }

      if (data.issuesAgainstMe && data.issuesAgainstMe.length > 0) {
        setIssuesAgainstMe(data.issuesAgainstMe);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [eventId]);

  // Skip the round-trip when the parent prefetched the payload (email
  // ?section=feedback path). The component is already populated from
  // initialData, so a follow-up fetch would only re-paint the same content.
  useEffect(() => {
    if (initial) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const ensureChumStatus = useCallback(async (userId: string) => {
    setChumStatus((prev) => {
      if (userId in prev) return prev;
      // Mark as in-flight so concurrent renders don't refetch.
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
    // Optimistic flip, revert on failure.
    setChumStatus((prev) => ({ ...prev, [userId]: !current }));
    try {
      const res = await apiFetch(`/chums/${userId}`, {
        auth: true,
        method: current ? "DELETE" : "POST",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!data.ok) {
        setChumStatus((prev) => ({ ...prev, [userId]: current }));
      }
    } catch {
      setChumStatus((prev) => ({ ...prev, [userId]: current }));
    } finally {
      setChumLoading((prev) => ({ ...prev, [userId]: false }));
    }
  }, [chumStatus]);

  // Once the viewer reaches the post-submit follow-up panel, lazily fetch
  // chum status for every listed attendee (the panel shows a Save-to-Chums
  // action per person). `ensureChumStatus` self-guards against duplicate
  // fetches via the `userId in prev` check. Skipped entirely once the
  // follow-up window has closed, since the panel won't render.
  useEffect(() => {
    if (!submitted) return;
    if (isFollowUpLocked(planStartsAt)) return;
    for (const a of attendees) {
      if (!(a.userId in chumStatus)) void ensureChumStatus(a.userId);
    }
  }, [submitted, attendees, chumStatus, ensureChumStatus, planStartsAt]);

  // Fire a one-shot analytics event the first time the form is actually
  // shown (eligible viewer, not yet completed). This is the top of the
  // completion funnel; pair with feedback_submitted / feedback_skipped /
  // feedback_dismissed to measure drop-off.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    if (loading || dismissed || submitted) return;
    if (attendees.length === 0) return;
    viewedRef.current = true;
    trackEvent("feedback_viewed", { attendee_count: attendees.length });
  }, [loading, dismissed, submitted, attendees]);

  const setResponse = (userId: string, prompt: Prompt, value: Response) => {
    setFeedback((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [prompt]: prev[userId]?.[prompt] === value ? null : value },
    }));
  };

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

  /** Submit every answered question for every person in ONE batched POST
   *  (the API upserts per (reviewee, prompt), so re-submitting is safe).
   *  Zero answers = a local "finish" with no API call: the thanks panel
   *  shows, but nothing is stored, so the form re-offers next visit.
   *  On API failure we stay on the form and show an inline error instead
   *  of silently discarding the user's answers. */
  const handleSubmitAll = async () => {
    const entries: { revieweeUserId: string; prompt: string; response: string }[] = [];
    const reviewedIds = new Set<string>();
    for (const a of attendees) {
      const responses = feedback[a.userId] ?? {};
      for (const [prompt, response] of Object.entries(responses)) {
        if (response) {
          entries.push({ revieweeUserId: a.userId, prompt, response });
          reviewedIds.add(a.userId);
        }
      }
    }

    if (entries.length === 0) {
      trackEvent("feedback_skipped", { attendee_count: attendees.length });
      justSubmittedRef.current = true;
      setSubmitted(true);
      return;
    }

    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/feedback`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) {
        setSubmittedSet((prev) => {
          const next = new Set(prev);
          reviewedIds.forEach((id) => next.add(id));
          return next;
        });
        trackEvent("feedback_submitted", {
          entry_count: entries.length,
          attendee_count: attendees.length,
        });
        justSubmittedRef.current = true;
        setSubmitted(true);
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    }
    setSubmitting(false);
  };

  /** Send (or update) one shout-out from the post-submit follow-up panel.
   *  Optimistically flips the slot to "pending" on success. */
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

  const handleAttendanceIssue = async () => {
    if (!issueTarget || !issueType) return;
    setIssueSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/attendance-issue`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportedUserId: issueTarget.userId, issueType }),
      });
      if (res.ok) {
        setIssueDone(true);
        setReportedIssues((prev) => new Set(prev).add(`${issueTarget.userId}:${issueType}`));
      }
    } catch { /* silent */ }
    setIssueSubmitting(false);
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

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const res = await apiFetch(`/events/${eventId}/feedback/dismiss`, {
        auth: true,
        method: "POST",
      });
      if (res.ok) {
        trackEvent("feedback_dismissed", { attendee_count: attendees.length });
        setDismissed(true);
        setDismissDialogOpen(false);
      }
    } catch { /* silent */ }
    setDismissing(false);
  };

  if (loading) return null;
  if (dismissed) return null;
  if (attendees.length === 0 && issuesAgainstMe.length === 0) return null;

  const hasAnyResponse = attendees.some((a) =>
    Object.values(feedback[a.userId] ?? {}).some((v) => v != null)
  );
  const planContextLine = formatPlanContext(planTitle, planStartsAt);
  const followUpLocked = isFollowUpLocked(planStartsAt);

  const openIssueDialog = (target: Attendee | null) => {
    setIssueTarget(target);
    setIssueDone(false);
    setIssueType("");
    setIssueDialogOpen(true);
  };

  const openConductDialog = (target: Attendee | null) => {
    setConductTarget(target);
    setConductDone(false);
    setConductReason("");
    setConductDetails("");
    setConductDialogOpen(true);
  };

  return (
    <>
      <Box
        ref={formTopRef}
        id={id}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, sm: 2.5 },
          // Reserve breathing room above the section so a sticky app bar
          // doesn't crop the heading when we scroll to the top on completion.
          scrollMarginTop: { xs: 80, sm: 96 },
        }}
      >
        {/* Dispute banner for attendance issues against the current user.
            Lives above the flow because it's about the viewer, not the
            people being reviewed. */}
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

        {/* ── Intro header ──────────────────────────────────────────────
            One screen, so the header also carries the plan context line
            that used to live on the per-person hero cards. Hidden once
            submitted to keep the success state focused. */}
        {!submitted && attendees.length > 0 && (
          <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
            <Typography
              component="h2"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.125rem", sm: "1.25rem" },
                lineHeight: 1.25,
                color: "text.primary",
                mb: 0.5,
              }}
            >
              How did it go?
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                fontSize: "0.875rem",
                lineHeight: 1.55,
                mb: 0.5,
              }}
            >
              {planContextLine ? `${planContextLine}. ` : ""}A few quick, private questions about the people who were there. Your answers help NewChums make better matches and more reliable plans.
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontSize: "0.75rem",
                fontWeight: 600,
                display: "block",
              }}
            >
              Everything is optional. Answer what you can, skip what you want.
            </Typography>
          </Box>
        )}

        {submitted ? (
          /* ── Done state + follow-up actions ─────────────────────────── */
          <>
            <Paper
              ref={thanksPanelRef}
              variant="outlined"
              sx={{
                p: { xs: 3, sm: 3.5 },
                borderRadius: 4,
                borderColor: "success.light",
                background: "linear-gradient(180deg, #f0fdf4 0%, #ffffff 70%)",
                textAlign: "center",
                scrollMarginTop: { xs: 80, sm: 96 },
              }}
            >
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  bgcolor: "success.main",
                  color: "#fff",
                  mx: "auto",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 4px 14px rgba(22, 163, 74, 0.25)",
                }}
              >
                <CheckRoundedIcon sx={{ fontSize: 32 }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: { xs: "1.125rem", sm: "1.25rem" }, mb: 0.5 }}>
                Thanks for sharing your feedback
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, mx: "auto", lineHeight: 1.55 }}>
                It stays private and helps improve matches for everyone on NewChums.
              </Typography>
              {/* Single inline action: add this plan's hobbies to the viewer's
                  profile so they get notified about similar plans next time.
                  Self-gates: renders nothing while loading or when the viewer
                  already follows every hobby on this plan. */}
              {planHobbies && planHobbies.length > 0 && (
                <PlanHobbyAddSuggestion planHobbies={planHobbies} />
              )}
            </Paper>

            {/* ── Follow-up: keep the connection going ──────────────────
                Save-to-Chums and shout-outs moved here from the old
                per-person carousel steps, so the form itself stays short
                and these become a reward-flavored follow-up instead of
                extra chores before submitting. Hidden once the plan's
                3-day post-start window closes (same as the chat lock). */}
            {attendees.length > 0 && !followUpLocked && (
              <Paper
                variant="outlined"
                sx={{
                  p: { xs: 2, sm: 2.5 },
                  borderRadius: 3,
                  borderColor: "grey.200",
                  bgcolor: "background.paper",
                }}
              >
                <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", mb: 0.25 }}>
                  Keep the connection going
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", fontSize: "0.8125rem", lineHeight: 1.5, mb: 1.75 }}
                >
                  Save people to your Chums so they&rsquo;re easy to invite next time, or leave them a public shout-out.
                </Typography>
                <Stack spacing={1.5}>
                  {attendees.map((a) => {
                    const profileHref = a.username ? `/u/${a.username.replace(/^@/, "")}` : null;
                    const realName = a.name?.trim() || null;
                    const handle = a.handle
                      ?? (a.username ? `@${a.username.replace(/^@/, "")}` : null);
                    const primaryLabel = realName || handle || a.displayName;
                    const saved = chumStatus[a.userId];
                    const showChum = saved !== null;
                    const draft = shoutouts[a.userId];
                    const status = draft?.serverStatus ?? "none";
                    const message = draft?.message ?? "";
                    const locked = status === "approved" || status === "rejected";
                    const sending = !!shoutoutSending[a.userId];
                    const sendable =
                      message.trim().length > 0 &&
                      message.trim() !== (draft?.serverMessage?.trim() ?? "") &&
                      !locked;
                    return (
                      <Paper
                        key={a.userId}
                        variant="outlined"
                        sx={{ p: { xs: 1.5, sm: 1.75 }, borderRadius: 2.5, borderColor: "grey.200" }}
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
                            <Box sx={{ minWidth: 0 }}>
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
                              {status === "pending" && (
                                <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem" }}>
                                  Your shout-out will be visible shortly
                                </Typography>
                              )}
                              {status === "approved" && (
                                <Typography variant="caption" sx={{ color: "success.dark", fontSize: "0.6875rem", fontWeight: 600 }}>
                                  Shout-out sent
                                </Typography>
                              )}
                            </Box>
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
                        </Stack>
                        {/* Shout-out composer: compact inline row. Locked slots
                            (approved / rejected) show status text above instead
                            of an editable field. */}
                        {!locked && (
                          <Stack direction="row" spacing={1} alignItems="stretch" sx={{ mt: 1.25 }}>
                            <TextField
                              value={message}
                              onChange={(e) => setShoutoutMessage(a.userId, e.target.value)}
                              placeholder={`Give ${primaryLabel} a shout-out for their profile (optional)`}
                              multiline
                              maxRows={3}
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
                                // The row Stack is alignItems: "stretch", so
                                // the button always matches the TextField's
                                // rendered height exactly (even if the field
                                // grows to multiple lines). minHeight unsets
                                // the theme's 44px button floor.
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
                  })}
                </Stack>
              </Paper>
            )}
          </>
        ) : attendees.length > 0 ? (
          <>
            {/* ── Per-person feedback cards, all on one screen ─────────
                Replaces the old one-person-at-a-time carousel. A 4-person
                plan is now one screen and one Submit instead of four
                Submit-and-next steps. The pill rows keep the tactile
                yes/somewhat/no interaction from the pill-response pattern
                in docs/UI_Patterns.md, condensed into one card per person. */}
            <Stack spacing={{ xs: 1.75, sm: 2 }}>
              {attendees.map((a) => {
                const prompts = PROMPTS.filter((p) => !p.hostOnly || a.isHost);
                const responses = feedback[a.userId] ?? {};
                const answeredAny = Object.values(responses).some((v) => v != null);
                const profileHref = a.username ? `/u/${a.username.replace(/^@/, "")}` : null;
                const realName = a.name?.trim() || null;
                const handle = a.handle
                  ?? (a.username ? `@${a.username.replace(/^@/, "")}` : null);
                const primaryLabel = realName || handle || a.displayName;
                const showHandleLine = !!realName && !!handle && handle !== realName;
                const previouslySaved = submittedSet.has(a.userId);
                return (
                  <Paper
                    key={a.userId}
                    variant="outlined"
                    sx={{
                      p: { xs: 2, sm: 2.5 },
                      borderRadius: 3.5,
                      borderColor: answeredAny ? "primary.light" : "grey.200",
                      transition: "border-color 0.18s ease",
                    }}
                  >
                    {/* Person header */}
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.75 }}>
                      <UserAvatar
                        src={`${avatarBase}/users/${a.userId}/avatar`}
                        name={a.displayName}
                        username={a.username}
                        size={48}
                        sx={{
                          width: { xs: 44, sm: 48 },
                          height: { xs: 44, sm: 48 },
                          fontSize: "1.125rem",
                          border: "2px solid #fff",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                          <Typography
                            component={profileHref ? Link : "span"}
                            {...(profileHref ? { href: profileHref } : {})}
                            sx={{
                              fontWeight: 700,
                              fontSize: { xs: "1rem", sm: "1.0625rem" },
                              lineHeight: 1.2,
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
                                height: 20,
                                fontSize: "0.6875rem",
                                fontWeight: 700,
                                bgcolor: "primary.main",
                                color: "#fff",
                                flexShrink: 0,
                                "& .MuiChip-label": { px: 0.875 },
                              }}
                            />
                          )}
                          {previouslySaved && (
                            <Chip
                              icon={<CheckRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                              label="Saved"
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                bgcolor: "#f0fdf4",
                                color: "success.dark",
                                flexShrink: 0,
                                "& .MuiChip-icon": { color: "success.main" },
                                "& .MuiChip-label": { px: 0.75 },
                              }}
                            />
                          )}
                        </Stack>
                        {showHandleLine && (
                          <Typography
                            sx={{
                              color: "text.secondary",
                              fontSize: "0.78rem",
                              lineHeight: 1.3,
                              mt: 0.125,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {handle}
                          </Typography>
                        )}
                      </Box>
                    </Stack>

                    {/* Question rows */}
                    <Stack spacing={{ xs: 1.5, sm: 1.25 }}>
                      {prompts.map((p) => {
                        const current = responses[p.key] ?? null;
                        return (
                          <Stack
                            key={p.key}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={{ xs: 0.625, sm: 1.5 }}
                            alignItems={{ xs: "stretch", sm: "center" }}
                          >
                            <Typography
                              sx={{
                                color: "text.primary",
                                fontWeight: 600,
                                lineHeight: 1.35,
                                fontSize: { xs: "0.875rem", sm: "0.875rem" },
                                flex: { sm: 1 },
                                minWidth: 0,
                              }}
                            >
                              {p.label}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.75}
                              sx={{ width: { xs: "100%", sm: 280 }, flexShrink: 0 }}
                            >
                              {RESPONSE_OPTIONS.map((opt) => {
                                const isSelected = current === opt.value;
                                return (
                                  <Box
                                    key={opt.value}
                                    onClick={() => setResponse(a.userId, p.key, opt.value)}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={isSelected}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setResponse(a.userId, p.key, opt.value);
                                      }
                                    }}
                                    sx={{
                                      flex: 1,
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      py: { xs: 0.875, sm: 0.75 },
                                      px: 0.75,
                                      borderRadius: 999,
                                      border: "1.5px solid",
                                      borderColor: isSelected ? "transparent" : "grey.200",
                                      bgcolor: isSelected ? opt.selectedBg : "background.paper",
                                      color: isSelected ? opt.selectedColor : "text.secondary",
                                      fontWeight: isSelected ? 700 : 600,
                                      fontSize: "0.8125rem",
                                      cursor: "pointer",
                                      transition: "all 0.12s ease",
                                      userSelect: "none",
                                      whiteSpace: "nowrap",
                                      boxShadow: isSelected ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                                      "&:hover": {
                                        bgcolor: isSelected ? opt.selectedBg : opt.hoverBg,
                                        borderColor: isSelected ? "transparent" : "grey.300",
                                      },
                                      "&:focus-visible": {
                                        outline: "2px solid",
                                        outlineColor: "primary.main",
                                        outlineOffset: 2,
                                      },
                                    }}
                                  >
                                    {opt.label}
                                  </Box>
                                );
                              })}
                            </Stack>
                          </Stack>
                        );
                      })}
                    </Stack>
                  </Paper>
                );
              })}
            </Stack>

            {/* ── Submit ──────────────────────────────────────────────── */}
            {submitError && (
              <Typography
                variant="body2"
                sx={{ color: "error.dark", fontSize: "0.8125rem", textAlign: "center", fontWeight: 600 }}
              >
                Couldn&rsquo;t save your feedback just now. Your answers are still here, please try again.
              </Typography>
            )}
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              <Button
                onClick={handleSubmitAll}
                disabled={submitting}
                variant="contained"
                color="primary"
                endIcon={<CheckRoundedIcon sx={{ fontSize: 20 }} />}
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: { xs: 3, sm: 4.5 },
                  py: { xs: 1.125, sm: 1.25 },
                  fontSize: "0.9375rem",
                  minWidth: { xs: "100%", sm: 260 },
                  boxShadow: "0 2px 8px rgba(230, 91, 19, 0.25)",
                  "&:hover": { boxShadow: "0 4px 14px rgba(230, 91, 19, 0.30)", opacity: 0.96 },
                  "&.Mui-disabled": { boxShadow: "none", bgcolor: "grey.200", color: "grey.500" },
                }}
              >
                {submitting
                  ? "Saving…"
                  : hasAnyResponse
                    ? "Submit feedback"
                    : "Finish without answering"}
              </Button>
            </Box>

            {/* ── Quiet footer: escalations + opt-out ─────────────────
                The two report paths collapsed from always-visible cards
                (repeated on every carousel step) to a single quiet row.
                Same dialogs, same data, far less visual weight. */}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={{ xs: 0.75, sm: 2.5 }}
              justifyContent="center"
              alignItems="center"
              sx={{ pt: 0.5 }}
            >
              <Button
                onClick={() => openIssueDialog(attendees.length === 1 ? attendees[0] : null)}
                variant="text"
                size="small"
                startIcon={<ReportProblemRoundedIcon sx={{ fontSize: 16 }} />}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  color: "text.secondary",
                  backgroundColor: "transparent",
                  "&:hover": { bgcolor: "action.hover", color: "#92400e" },
                }}
              >
                Report an attendance issue
              </Button>
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
                I&rsquo;d rather skip feedback
              </Button>
            </Stack>
            {reportedIssues.size > 0 && (
              <Typography
                variant="caption"
                sx={{ color: "success.dark", fontSize: "0.75rem", textAlign: "center", fontWeight: 600 }}
              >
                <CheckCircleRoundedIcon sx={{ fontSize: 13, verticalAlign: "-2px", mr: 0.5 }} />
                Attendance issue reported. Thanks, this helps keep plans reliable.
              </Typography>
            )}
          </>
        ) : null}
      </Box>

      {/* Attendance issue dialog */}
      <Dialog
        open={issueDialogOpen}
        onClose={() => setIssueDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {issueDone ? (
          <DialogContent sx={{ p: 0 }}>
            <DialogSuccessState
              title="Issue reported"
              message="Thanks, this helps keep plans reliable for everyone."
              onClose={() => setIssueDialogOpen(false)}
            />
          </DialogContent>
        ) : (
          <>
            <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
              Report attendance issue
            </DialogTitle>
            <DialogContent>
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                <FormControl fullWidth size="small">
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.625 }}>Who?</Typography>
                  <Select
                    value={issueTarget?.userId ?? ""}
                    onChange={(e) => {
                      const a = attendees.find((att) => att.userId === e.target.value);
                      if (a) setIssueTarget(a);
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
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    displayEmpty
                    sx={{ borderRadius: 2 }}
                  >
                    <MenuItem value="" disabled>Select issue type</MenuItem>
                    {ATTENDANCE_ISSUES.map((i) => (
                      <MenuItem key={i.value} value={i.value}>{i.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={() => setIssueDialogOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
                Cancel
              </Button>
              <Button
                onClick={handleAttendanceIssue}
                disabled={!issueTarget || !issueType || issueSubmitting}
                variant="contained"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  "&.Mui-disabled": { bgcolor: "grey.200", color: "grey.500" },
                }}
              >
                {issueSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Conduct report dialog */}
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

      {/* Dismiss confirmation dialog. Mirrors the visual rhythm of
          `DialogSuccessState` (centered icon, heading, body, actions) but
          stays a confirmation, not a success state. */}
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
              px: { xs: 2.5, sm: 3 },
              pt: { xs: 3, sm: 3.5 },
              pb: { xs: 2.25, sm: 2.5 },
            }}
          >
            <Box
              sx={{
                width: 60,
                height: 60,
                borderRadius: "50%",
                bgcolor: "grey.100",
                color: "text.secondary",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mb: 2,
              }}
            >
              <VisibilityOffOutlinedIcon sx={{ fontSize: 30 }} />
            </Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", lineHeight: 1.3, mb: 0.75 }}>
              {submitted ? "Hide feedback for this plan?" : "Skip feedback for this plan?"}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                fontSize: "0.875rem",
                lineHeight: 1.55,
                maxWidth: 360,
                mb: 2.5,
              }}
            >
              {submitted
                ? "Your feedback has been saved. This will permanently hide this section from your view."
                : "This will permanently hide the feedback section for this plan. You won't be able to leave feedback later."}
            </Typography>
            <Stack
              direction={{ xs: "column-reverse", sm: "row" }}
              spacing={1}
              sx={{ width: "100%", justifyContent: "center" }}
            >
              <Button
                onClick={() => setDismissDialogOpen(false)}
                variant="text"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  borderRadius: 2.5,
                  color: "text.secondary",
                  px: 3,
                  py: 0.875,
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDismiss}
                disabled={dismissing}
                variant="contained"
                color="primary"
                sx={{
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: 3,
                  py: 0.875,
                  fontSize: "0.875rem",
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none", opacity: 0.94 },
                  "&.Mui-disabled": { bgcolor: "grey.200", color: "grey.500" },
                }}
              >
                {dismissing ? "Hiding…" : submitted ? "Yes, hide" : "Yes, skip feedback"}
              </Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Compact, balanced success-confirmation block used inside both the attendance
 *  issue dialog and the safety / conduct concern dialog. Replaces the dialog's
 *  title + content + actions when the submission has succeeded so the icon,
 *  heading, message, and dismiss button read as a single coherent unit instead
 *  of three disconnected pieces.
 *
 *  Manual-close only (no auto-dismiss), both confirmations should give the
 *  user a moment to read, especially the safety / conduct one.
 */
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

/** Build a short contextual reminder of the plan for the intro header
 *  ("You met at <Plan title> on <date>"). Returns null when neither field is
 *  available so the header gracefully omits the line. */
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
