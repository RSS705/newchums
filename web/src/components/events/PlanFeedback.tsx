"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fade from "@mui/material/Fade";
import FormControl from "@mui/material/FormControl";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import Link from "next/link";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import PlanHobbyAddSuggestion, { type PlanHobby } from "./PlanHobbyAddSuggestion";

type Response = "agree" | "maybe" | "disagree" | null;
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

const PROMPTS: { key: Prompt; label: string; hostOnly?: boolean }[] = [
  { key: "reliability", label: "Showed up and followed through reliably" },
  { key: "sociability", label: "I'd spend time with this person again" },
  { key: "presentation", label: "This person showed basic in-person cleanliness and consideration" },
  { key: "match_quality", label: "This was a good match for me" },
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
 *  state — if it's 'approved' or 'rejected' the slot is locked and the
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
  /** Plan title shown in the participant hero as a contextual reminder. */
  planTitle?: string;
  /** Plan start time (ISO) shown in the participant hero as a contextual reminder. */
  planStartsAt?: string;
  /** Hobbies attached to the plan. When the viewer is in the post-submit
   *  "thanks" state and is missing at least one of these on their profile,
   *  we show a single inline button to add them. */
  planHobbies?: PlanHobby[];
  /** Optional payload pre-fetched by the parent (used when the visitor was
   *  deep-linked via ?section=feedback). When provided, the component skips
   *  its own initial fetch and renders content on first paint. */
  initialData?: unknown;
};

function isFeedbackPayload(value: unknown): value is PlanFeedbackInitialData {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.attendees) && Array.isArray(v.feedback) && Array.isArray(v.attendanceIssues);
}

export default function PlanFeedback({ eventId, planTitle, planStartsAt, planHobbies, initialData }: PlanFeedbackProps) {
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
  /** Reviewees we've already saved to the API in this session (or from prior
   *  visits). Drives the per-step "submitted" check on the progress bar. */
  const [submittedSet, setSubmittedSet] = useState<Set<string>>(initialSubmittedSet);
  // When the parent prefetched the payload there's nothing to load — render
  // content on first paint instead of returning null.
  const [loading, setLoading] = useState(initial == null);
  const [submitted, setSubmitted] = useState(initiallySubmitted);
  const [submitting, setSubmitting] = useState(false);
  /** Cross-fade key bumped on every advance to play a subtle slide between
   *  attendees. Keeps the experience guided rather than survey-flat. */
  const [stepNonce, setStepNonce] = useState(0);
  const [dismissed, setDismissed] = useState(initiallyDismissed);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // Ref on the top of the feedback section. Used both for the per-step
  // recenter (between attendees) and as a fallback target for the success
  // state, so the next page or confirmation always begins at the top of the
  // form on mobile rather than mid-screen behind the bottom of the previous
  // step.
  const formTopRef = useRef<HTMLDivElement>(null);
  // Ref on the "Thanks for sharing your feedback" panel so we can scroll the
  // viewer up to it after they submit the last attendee. Without this the
  // success state can render below the fold (especially on mobile, where the
  // last interaction was at the bottom of the form) and feel like nothing
  // happened.
  const thanksPanelRef = useRef<HTMLDivElement>(null);
  // Tracks whether the latest flip into `submitted=true` was the user's own
  // submit action vs. an initial hydration from the API. We only want to
  // auto-scroll on the former.
  const justSubmittedRef = useRef(false);
  useEffect(() => {
    if (!submitted || !justSubmittedRef.current) return;
    justSubmittedRef.current = false;
    // Wait one frame for the success Paper to mount, then ease the viewport
    // up to the top of the feedback section so the confirmation card sits
    // squarely in view. We prefer formTopRef (the section anchor) so the
    // section header is included; fall back to the panel itself if the
    // anchor is missing for any reason.
    requestAnimationFrame(() => {
      const target = formTopRef.current ?? thanksPanelRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [submitted]);

  /** Scroll the viewport to the top of the feedback section. Called after
   *  each per-attendee step submits, so the next page begins at the top
   *  rather than wherever the previous step's button happened to land. */
  const scrollFormToTop = useCallback(() => {
    requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const avatarBase = getAvatarBaseUrl();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/feedback`, { auth: true });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as {
        dismissed?: boolean;
        attendees: Attendee[];
        feedback: { reviewee_user_id: string; prompt: string; response: string }[];
        attendanceIssues: { reported_user_id: string; issue_type: string }[];
        issuesAgainstMe?: { id: string; issueType: string; status: string }[];
        shoutouts?: { recipientUserId: string; message: string; status: string }[];
      };
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
    // Optimistic flip — revert on failure.
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

  const setResponse = (userId: string, prompt: Prompt, value: Response) => {
    setFeedback((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [prompt]: prev[userId]?.[prompt] === value ? null : value },
    }));
  };

  const SHOUTOUT_MAX_LENGTH = 280;

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

  /** Submit just the current attendee's responses (if any) and advance.
   *  This drives the "Submit & Next" CTA — the focal action of the redesigned
   *  flow. Empty responses are allowed: we simply skip-and-advance without
   *  hitting the API (the backend rejects empty entries arrays).
   *
   *  Also fires the shout-out POST in the same step if the user has typed
   *  one and the slot is still editable. Shout-out failures are silent and
   *  do NOT block the Submit & Next flow — feedback always wins.
   *
   *  On the last attendee, we flip into the "submitted" thanks state after
   *  the save (or after the skip, since the user has now walked the queue).
   */
  const handleSubmitAndNext = async (attendee: Attendee, isLastAttendee: boolean) => {
    const responses = feedback[attendee.userId] ?? {};
    const entries: { revieweeUserId: string; prompt: string; response: string }[] = [];
    for (const [prompt, response] of Object.entries(responses)) {
      if (response) entries.push({ revieweeUserId: attendee.userId, prompt, response });
    }

    setSubmitting(true);

    if (entries.length > 0) {
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
            next.add(attendee.userId);
            return next;
          });
        }
      } catch { /* silent */ }
    }

    // Fire the shout-out POST if the user has a non-empty draft, the slot is
    // still editable (none/pending), and the message has actually changed
    // since the last server-confirmed value. Optimistically flip to "pending"
    // on success; revert quietly on failure so the user can retry.
    const draft = shoutouts[attendee.userId];
    const draftMessage = draft?.message?.trim() ?? "";
    const slotEditable = !draft || draft.serverStatus === "none" || draft.serverStatus === "pending";
    const messageChanged = draftMessage !== (draft?.serverMessage?.trim() ?? "");
    if (draftMessage.length > 0 && slotEditable && messageChanged) {
      try {
        const res = await apiFetch(`/events/${eventId}/shoutout`, {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientUserId: attendee.userId, message: draftMessage }),
        });
        const data = (await res.json()) as { ok?: boolean; status?: string };
        if (res.ok && data.ok) {
          setShoutouts((prev) => ({
            ...prev,
            [attendee.userId]: {
              message: draftMessage,
              serverMessage: draftMessage,
              serverStatus: "pending",
            },
          }));
        }
      } catch { /* silent — shout-out is best-effort */ }
    }

    setSubmitting(false);

    if (isLastAttendee) {
      // Flag this transition as user-initiated so the success panel
      // auto-scrolls into view (see effect on `submitted` above).
      justSubmittedRef.current = true;
      setSubmitted(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setStepNonce((n) => n + 1);
      // Recenter to the top of the feedback section so the next attendee's
      // hero card is immediately visible. Especially important on mobile
      // where the previous step's submit button is at the bottom of the
      // viewport when this fires.
      scrollFormToTop();
    }
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
        setDismissed(true);
        setDismissDialogOpen(false);
      }
    } catch { /* silent */ }
    setDismissing(false);
  };

  // Lazy-load the current attendee's chum status the first time we land on
  // them. Cached in `chumStatus`, so flipping back/forward doesn't refetch.
  // MUST stay above the early returns below to keep hook order stable across
  // renders (Rules of Hooks).
  const currentAttendee = attendees[currentIndex];
  useEffect(() => {
    if (!currentAttendee) return;
    if (currentAttendee.userId in chumStatus) return;
    void ensureChumStatus(currentAttendee.userId);
  }, [currentAttendee, chumStatus, ensureChumStatus]);

  if (loading) return null;
  if (dismissed) return null;
  if (attendees.length === 0 && issuesAgainstMe.length === 0) return null;

  const total = attendees.length;
  const completedCount = attendees.filter((a) => submittedSet.has(a.userId)).length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;
  const currentHasResponse = currentAttendee
    ? Object.values(feedback[currentAttendee.userId] ?? {}).some((v) => v != null)
    : false;
  const currentReportedIssue = currentAttendee
    ? Array.from(reportedIssues).some((k) => k.startsWith(currentAttendee.userId + ":"))
    : false;
  const currentChumSaved = currentAttendee
    ? (chumStatus[currentAttendee.userId] ?? undefined)
    : undefined;
  const currentChumLoading = currentAttendee ? !!chumLoading[currentAttendee.userId] : false;
  const currentPrompts = currentAttendee
    ? PROMPTS.filter((p) => !p.hostOnly || currentAttendee.isHost)
    : [];
  const currentResponses = currentAttendee ? (feedback[currentAttendee.userId] ?? {}) : {};
  const currentProfileHref = currentAttendee?.username
    ? `/u/${currentAttendee.username.replace(/^@/, "")}`
    : null;
  const planContextLine = formatPlanContext(planTitle, planStartsAt);
  const showChumAction = currentChumSaved !== null;

  const openIssueForPerson = (attendee: Attendee) => {
    setIssueTarget(attendee);
    setIssueDone(false);
    setIssueType("");
    setIssueDialogOpen(true);
  };

  const openConductForPerson = (attendee: Attendee | null) => {
    setConductTarget(attendee);
    setConductDone(false);
    setConductReason("");
    setConductDetails("");
    setConductDialogOpen(true);
  };

  return (
    <>
      <Box
        ref={formTopRef}
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: { xs: 2, sm: 2.5 },
          // Reserve breathing room above the section so a sticky app bar
          // doesn't crop the heading when we scroll the form to the top
          // between steps or on completion.
          scrollMarginTop: { xs: 80, sm: 96 },
        }}
      >
        {/* Dispute banner for attendance issues against the current user.
            Lives above the flow because it's about the viewer, not the
            person currently being reviewed. */}
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

        {/* ── 0. Intro / what is this screen ────────────────────────────
            Compact header so users instantly understand what this is, why
            it matters, and that it's optional. Hidden once the form is
            submitted to keep the success state focused. */}
        {!submitted && (
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
              You&rsquo;re leaving quick, private feedback for people from this plan. This helps NewChums make better matches and more reliable plans over time.
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
              Answer what you can, skip what you want.
            </Typography>
          </Box>
        )}

        {submitted ? (
          /* ── Done state ──────────────────────────────────────────────── */
          <Paper
            ref={thanksPanelRef}
            variant="outlined"
            sx={{
              p: { xs: 3, sm: 3.5 },
              borderRadius: 4,
              borderColor: "success.light",
              background: "linear-gradient(180deg, #f0fdf4 0%, #ffffff 70%)",
              textAlign: "center",
              // Reserve a bit of breathing room above the heading so a
              // sticky app bar doesn't crop the title when we scroll into
              // view post-submit.
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
                already follows every hobby on this plan, in which case the
                Paper collapses cleanly to its heading + body. */}
            {planHobbies && planHobbies.length > 0 && (
              <PlanHobbyAddSuggestion planHobbies={planHobbies} />
            )}
          </Paper>
        ) : (
          <>
            {/* ── 1. Progress area ─────────────────────────────────────── */}
            <Paper
              variant="outlined"
              sx={{
                p: { xs: 1.75, sm: 2 },
                borderRadius: 3,
                borderColor: "grey.200",
                bgcolor: "background.paper",
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      bgcolor: "primary.50",
                      color: "primary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      border: "1px solid",
                      borderColor: "primary.light",
                    }}
                  >
                    {currentIndex + 1}
                  </Box>
                  <Box sx={{ lineHeight: 1.2 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem", lineHeight: 1.2 }}>
                      Feedback {currentIndex + 1} of {total}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
                      {completedCount === 0
                        ? "Quick and private"
                        : completedCount === total
                          ? "All saved, review or finish"
                          : `${completedCount} of ${total} saved`}
                    </Typography>
                  </Box>
                </Stack>
                {total > 1 && (
                  <Stack direction="row" spacing={0.5}>
                    {attendees.map((a, i) => {
                      const done = submittedSet.has(a.userId);
                      const isCurrent = i === currentIndex;
                      return (
                        <Tooltip key={a.userId} title={a.displayName} arrow>
                          <Box
                            onClick={() => { setCurrentIndex(i); setStepNonce((n) => n + 1); scrollFormToTop(); }}
                            sx={{
                              width: isCurrent ? 22 : 10,
                              height: 10,
                              borderRadius: 5,
                              bgcolor: done ? "success.main" : isCurrent ? "primary.main" : "grey.300",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              "&:hover": { opacity: 0.85 },
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Stack>
                )}
              </Stack>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  bgcolor: "grey.100",
                  "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: "primary.main" },
                }}
              />
            </Paper>

            {/* Card-based per-attendee flow. The Fade keyed on stepNonce
                produces a subtle cross-fade between attendees so the change
                feels guided rather than jumping between form pages. */}
            <Fade in key={stepNonce} timeout={220}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 2, sm: 2.25 } }}>
                {/* ── 2. Participant hero card ───────────────────────── */}
                {currentAttendee && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: { xs: 2.25, sm: 2.75 },
                      borderRadius: 4,
                      borderColor: "primary.light",
                      background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
                    }}
                  >
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={{ xs: 2, sm: 2.5 }}
                      alignItems={{ xs: "stretch", sm: "center" }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={2}
                        sx={{ flex: 1, minWidth: 0 }}
                      >
                        <Avatar
                          src={`${avatarBase}/users/${currentAttendee.userId}/avatar`}
                          sx={{
                            width: { xs: 60, sm: 68 },
                            height: { xs: 60, sm: 68 },
                            fontSize: "1.5rem",
                            border: "3px solid #fff",
                            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
                            flexShrink: 0,
                          }}
                        >
                          {currentAttendee.displayName[0]?.toUpperCase()}
                        </Avatar>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {(() => {
                            // Prefer the real / display name as the primary
                            // label so reviewers actually recognize the
                            // person. The handle drops to a smaller secondary
                            // line when both exist (mirrors the public profile
                            // header pattern). If no real name is available we
                            // fall back to the handle alone, which is what the
                            // form used to show in every case.
                            const realName = currentAttendee.name?.trim() || null;
                            const handle = currentAttendee.handle
                              ?? (currentAttendee.username ? `@${currentAttendee.username.replace(/^@/, "")}` : null);
                            const primaryLabel = realName || handle || currentAttendee.displayName;
                            const showHandleLine = !!realName && !!handle && handle !== realName;
                            return (
                              <>
                                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                                  <Typography
                                    component={currentProfileHref ? Link : "span"}
                                    {...(currentProfileHref ? { href: currentProfileHref } : {})}
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: { xs: "1.1875rem", sm: "1.3125rem" },
                                      lineHeight: 1.2,
                                      color: currentProfileHref ? "primary.dark" : "text.primary",
                                      textDecoration: "none",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      minWidth: 0,
                                      "&:hover": currentProfileHref ? { textDecoration: "underline" } : {},
                                    }}
                                  >
                                    {primaryLabel}
                                  </Typography>
                                  {currentAttendee.isHost && (
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
                                </Stack>
                                {showHandleLine && (
                                  <Typography
                                    sx={{
                                      color: "text.secondary",
                                      fontSize: "0.8125rem",
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
                              </>
                            );
                          })()}
                          {planContextLine && (
                            <Typography
                              variant="body2"
                              sx={{
                                color: "text.secondary",
                                fontSize: "0.8125rem",
                                lineHeight: 1.35,
                                mt: 0.25,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {planContextLine}
                            </Typography>
                          )}
                        </Box>
                      </Stack>
                      {showChumAction && (
                        <Tooltip title={currentChumSaved ? "Remove from your Chums" : "Add to your Chums"} arrow>
                          <Button
                            onClick={() => toggleChum(currentAttendee.userId)}
                            disabled={currentChumLoading || currentChumSaved === undefined}
                            size="small"
                            variant={currentChumSaved ? "outlined" : "contained"}
                            color={currentChumSaved ? "inherit" : "primary"}
                            startIcon={currentChumSaved
                              ? <HowToRegRoundedIcon sx={{ fontSize: 18 }} />
                              : <PersonAddRoundedIcon sx={{ fontSize: 18 }} />}
                            sx={{
                              textTransform: "none",
                              fontWeight: 700,
                              borderRadius: 2.5,
                              fontSize: "0.8125rem",
                              px: { xs: 2, sm: 1.75 },
                              py: 0.75,
                              flexShrink: 0,
                              alignSelf: { xs: "stretch", sm: "center" },
                              ...(currentChumSaved ? {
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
                            {currentChumSaved ? "Saved as Chum" : "Save to Chums"}
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  </Paper>
                )}

                {/* ── 3. Feedback modules ────────────────────────────── */}
                {currentAttendee && (
                  <Stack spacing={{ xs: 1.25, sm: 1.5 }}>
                    {currentPrompts.map((p) => {
                      const current = currentResponses[p.key] ?? null;
                      const answered = current !== null;
                      return (
                        <Paper
                          key={p.key}
                          variant="outlined"
                          sx={{
                            p: { xs: 1.75, sm: 2 },
                            borderRadius: 3,
                            borderColor: answered ? "primary.light" : "grey.200",
                            transition: "border-color 0.18s ease",
                            "&:hover": { borderColor: answered ? "primary.main" : "grey.300" },
                          }}
                        >
                          <Typography
                            sx={{
                              color: "text.primary",
                              fontWeight: 600,
                              mb: 1,
                              lineHeight: 1.4,
                              fontSize: { xs: "0.9375rem", sm: "0.9375rem" },
                            }}
                          >
                            {p.label}
                          </Typography>
                          <Stack direction="row" spacing={0.875}>
                            {RESPONSE_OPTIONS.map((opt) => {
                              const isSelected = current === opt.value;
                              return (
                                <Box
                                  key={opt.value}
                                  onClick={() => setResponse(currentAttendee.userId, p.key, opt.value)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setResponse(currentAttendee.userId, p.key, opt.value);
                                    }
                                  }}
                                  sx={{
                                    flex: 1,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    py: { xs: 1, sm: 1.125 },
                                    px: 1,
                                    borderRadius: 999,
                                    border: "1.5px solid",
                                    borderColor: isSelected ? "transparent" : "grey.200",
                                    bgcolor: isSelected ? opt.selectedBg : "background.paper",
                                    color: isSelected ? opt.selectedColor : "text.secondary",
                                    fontWeight: isSelected ? 700 : 600,
                                    fontSize: "0.875rem",
                                    cursor: "pointer",
                                    transition: "all 0.12s ease",
                                    userSelect: "none",
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
                        </Paper>
                      );
                    })}
                  </Stack>
                )}

                {/* ── 3b. Shout-out (optional) ───────────────────────── */}
                {currentAttendee && (() => {
                  const draft = shoutouts[currentAttendee.userId];
                  const status = draft?.serverStatus ?? "none";
                  const message = draft?.message ?? "";
                  const locked = status === "approved" || status === "rejected";
                  const charsLeft = SHOUTOUT_MAX_LENGTH - message.length;
                  return (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: { xs: 2, sm: 2.25 },
                        borderRadius: 3,
                        borderColor: status === "approved" ? "success.light" : "primary.light",
                        background: status === "approved"
                          ? "linear-gradient(135deg, #f0fdf4 0%, #ffffff 65%)"
                          : "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
                      }}
                    >
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>
                          Shout-out
                        </Typography>
                        {status === "pending" && (
                          <Chip
                            label="Awaiting review"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              borderColor: "grey.300",
                              color: "text.secondary",
                              "& .MuiChip-label": { px: 0.875 },
                            }}
                          />
                        )}
                        {status === "approved" && (
                          <Chip
                            label="Sent"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.6875rem",
                              fontWeight: 700,
                              bgcolor: "success.main",
                              color: "#fff",
                              "& .MuiChip-label": { px: 0.875 },
                            }}
                          />
                        )}
                        {status === "rejected" && (
                          <Chip
                            label="Not approved"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                              borderColor: "grey.300",
                              color: "text.disabled",
                              "& .MuiChip-label": { px: 0.875 },
                            }}
                          />
                        )}
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontSize: "0.75rem",
                          lineHeight: 1.5,
                          display: "block",
                          mb: 1.25,
                        }}
                      >
                        {locked
                          ? status === "approved"
                            ? "Your shout-out has been sent to this person."
                            : "Our team didn't approve this one. You can use the safety section below if something needs reporting."
                          : "Optional. Give them a fun or memorable shout-out for their public profile. There may be a short delay before it appears."}
                      </Typography>
                      <TextField
                        value={message}
                        onChange={(e) => setShoutoutMessage(currentAttendee.userId, e.target.value)}
                        placeholder="Easy to be around, great vibes, would join again"
                        multiline
                        minRows={2}
                        maxRows={4}
                        fullWidth
                        size="small"
                        disabled={locked}
                        inputProps={{ maxLength: SHOUTOUT_MAX_LENGTH }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            borderRadius: 2,
                            bgcolor: "background.paper",
                            fontSize: "0.875rem",
                          },
                        }}
                      />
                      {!locked && (
                        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.5 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              color: charsLeft < 20 ? "warning.dark" : "text.disabled",
                              fontSize: "0.6875rem",
                              fontWeight: 600,
                            }}
                          >
                            {message.length}/{SHOUTOUT_MAX_LENGTH}
                          </Typography>
                        </Stack>
                      )}
                    </Paper>
                  );
                })()}

                {/* ── 4. Primary action area ───────────────────────────
                    Three-column layout on sm+: Back (left), primary CTA
                    (centered), and an empty mirror column. The mirror keeps
                    the CTA visually centered regardless of whether the Back
                    button is rendered, and gives the CTA room to be a bit
                    wider via minWidth. On xs we keep the column-reverse
                    stretch layout so the button stays full-width on mobile. */}
                <Stack
                  direction={{ xs: "column-reverse", sm: "row" }}
                  alignItems={{ xs: "stretch", sm: "center" }}
                  justifyContent={{ xs: "flex-start", sm: "space-between" }}
                  spacing={{ xs: 1, sm: 1.5 }}
                  sx={{ mt: { xs: 0.5, sm: 1 } }}
                >
                  <Box
                    sx={{
                      flex: { sm: 1 },
                      display: "flex",
                      justifyContent: { xs: "center", sm: "flex-start" },
                    }}
                  >
                    {!isFirst && (
                      <Button
                        onClick={() => { setCurrentIndex((i) => i - 1); setStepNonce((n) => n + 1); }}
                        variant="text"
                        startIcon={<ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />}
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          color: "text.secondary",
                          borderRadius: 2,
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        Back
                      </Button>
                    )}
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "center",
                      width: { xs: "100%", sm: "auto" },
                    }}
                  >
                    <Button
                      onClick={() => currentAttendee && handleSubmitAndNext(currentAttendee, isLast)}
                      disabled={submitting || !currentAttendee}
                      variant="contained"
                      color="primary"
                      endIcon={isLast
                        ? <CheckRoundedIcon sx={{ fontSize: 20 }} />
                        : <ArrowForwardRoundedIcon sx={{ fontSize: 20 }} />}
                      sx={{
                        textTransform: "none",
                        fontWeight: 700,
                        borderRadius: 2.5,
                        px: { xs: 3, sm: 4.5 },
                        py: { xs: 1.125, sm: 1.25 },
                        fontSize: "0.9375rem",
                        minWidth: { xs: "100%", sm: 240 },
                        boxShadow: "0 2px 8px rgba(230, 91, 19, 0.25)",
                        "&:hover": { boxShadow: "0 4px 14px rgba(230, 91, 19, 0.30)", opacity: 0.96 },
                        "&.Mui-disabled": { boxShadow: "none", bgcolor: "grey.200", color: "grey.500" },
                      }}
                    >
                      {submitting
                        ? "Saving…"
                        : currentHasResponse
                          ? (isLast ? "Submit & finish" : "Submit & next")
                          : (isLast ? "Skip & finish" : "Skip & next")}
                    </Button>
                  </Box>

                  {/* Mirror of the Back column to keep the CTA centered. */}
                  <Box sx={{ flex: { sm: 1 }, display: { xs: "none", sm: "block" } }} />
                </Stack>

                {/* ── 5. Unusual issues section ──────────────────────── */}
                {/* Clearly separated bottom section. Two equal-weight cards
                    so attendance and safety are easy to find without
                    competing with the primary feedback flow above. */}
                <Box sx={{ mt: { xs: 1.5, sm: 2 } }}>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1.25}
                    sx={{ mb: 1.25 }}
                  >
                    <Box sx={{ flex: 1, height: 1, bgcolor: "grey.200" }} />
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.disabled",
                        fontWeight: 700,
                        fontSize: "0.6875rem",
                        textTransform: "uppercase",
                        letterSpacing: 0.6,
                      }}
                    >
                      Something unusual?
                    </Typography>
                    <Box sx={{ flex: 1, height: 1, bgcolor: "grey.200" }} />
                  </Stack>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 1.25, md: 1.5 }}>
                    {/* Attendance issue */}
                    <Paper
                      variant="outlined"
                      onClick={() => currentAttendee && !currentReportedIssue && openIssueForPerson(currentAttendee)}
                      sx={{
                        flex: 1,
                        p: { xs: 1.75, sm: 2 },
                        borderRadius: 3,
                        borderColor: currentReportedIssue ? "success.light" : "#fbbf24",
                        bgcolor: currentReportedIssue ? "#f0fdf4" : "#fffbeb",
                        cursor: currentReportedIssue ? "default" : "pointer",
                        transition: "all 0.15s ease",
                        "&:hover": currentReportedIssue ? {} : {
                          borderColor: "#d97706",
                          bgcolor: "#fef3c7",
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                        {currentReportedIssue ? (
                          <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 22, flexShrink: 0, mt: 0.125 }} />
                        ) : (
                          <ReportProblemRoundedIcon sx={{ color: "#b45309", fontSize: 22, flexShrink: 0, mt: 0.125 }} />
                        )}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            color: currentReportedIssue ? "success.dark" : "#92400e",
                            lineHeight: 1.3,
                            mb: 0.25,
                          }}>
                            {currentReportedIssue ? "Attendance issue reported" : "Report an attendance issue"}
                          </Typography>
                          <Typography variant="body2" sx={{
                            color: currentReportedIssue ? "text.secondary" : "#78350f",
                            fontSize: "0.75rem",
                            lineHeight: 1.4,
                          }}>
                            {currentReportedIssue
                              ? "Thanks, this helps keep plans reliable."
                              : "No-show, cancelled too late, or arrived very late."}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>

                    {/* Safety / conduct */}
                    <Paper
                      variant="outlined"
                      onClick={() => currentAttendee && openConductForPerson(currentAttendee)}
                      sx={{
                        flex: 1,
                        p: { xs: 1.75, sm: 2 },
                        borderRadius: 3,
                        borderColor: "grey.200",
                        bgcolor: "background.paper",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          borderColor: "error.light",
                          bgcolor: "#fef2f2",
                        },
                      }}
                    >
                      <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                        <ShieldOutlinedIcon sx={{ color: "error.main", fontSize: 22, flexShrink: 0, mt: 0.125 }} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            color: "text.primary",
                            lineHeight: 1.3,
                            mb: 0.25,
                          }}>
                            Report a safety or conduct concern
                          </Typography>
                          <Typography variant="body2" sx={{
                            color: "text.secondary",
                            fontSize: "0.75rem",
                            lineHeight: 1.4,
                          }}>
                            Confidential. Reviewed by the NewChums team.
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  </Stack>

                  <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      onClick={() => setDismissDialogOpen(true)}
                      sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        borderRadius: 2.5,
                        px: { xs: 4, sm: 5 },
                        py: 0.875,
                        minWidth: { xs: 220, sm: 260 },
                        borderColor: "grey.300",
                        color: "text.secondary",
                        "&:hover": {
                          borderColor: "grey.400",
                          color: "text.primary",
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      I&rsquo;d rather skip feedback
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Fade>
          </>
        )}
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

      {/* Dismiss confirmation dialog — polished to feel intentional and
          consistent with the redesigned feedback flow. Mirrors the visual
          rhythm of `DialogSuccessState` (centered icon → heading → body →
          actions) but stays a confirmation, not a success state. */}
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
 *  Manual-close only (no auto-dismiss) — both confirmations should give the
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

/** Build a short contextual reminder of the plan for the participant hero
 *  ("You met at <Plan title> on <date>"). Returns null when neither field is
 *  available so the hero gracefully omits the line. */
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
