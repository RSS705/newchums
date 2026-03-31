"use client";

import { useCallback, useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Link from "next/link";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

type Response = "agree" | "maybe" | "disagree" | null;
type Prompt = "reliability" | "sociability" | "presentation" | "match_quality" | "hosting_skills";

type Attendee = {
  userId: string;
  displayName: string;
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

type PlanFeedbackProps = {
  eventId: string;
};

export default function PlanFeedback({ eventId }: PlanFeedbackProps) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>({});
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueTarget, setIssueTarget] = useState<Attendee | null>(null);
  const [issueType, setIssueType] = useState<string>("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueDone, setIssueDone] = useState(false);
  const [reportedIssues, setReportedIssues] = useState<Set<string>>(new Set());

  const [conductDialogOpen, setConductDialogOpen] = useState(false);
  const [conductTarget, setConductTarget] = useState<Attendee | null>(null);
  const [conductReason, setConductReason] = useState<string>("");
  const [conductDetails, setConductDetails] = useState("");
  const [conductSubmitting, setConductSubmitting] = useState(false);
  const [conductDone, setConductDone] = useState(false);

  const [issuesAgainstMe, setIssuesAgainstMe] = useState<{ id: string; issueType: string; status: string }[]>([]);
  const [disputing, setDisputing] = useState(false);

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
      };
      if (data.dismissed) { setDismissed(true); setLoading(false); return; }
      setAttendees(data.attendees);

      if (data.feedback.length > 0) {
        const state: FeedbackState = {};
        for (const f of data.feedback) {
          if (!state[f.reviewee_user_id]) state[f.reviewee_user_id] = {};
          state[f.reviewee_user_id][f.prompt as Prompt] = f.response as Response;
        }
        setFeedback(state);
        setSubmitted(true);
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

  useEffect(() => { load(); }, [load]);

  const setResponse = (userId: string, prompt: Prompt, value: Response) => {
    setFeedback((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], [prompt]: prev[userId]?.[prompt] === value ? null : value },
    }));
  };

  const handleSubmit = async () => {
    const entries: { revieweeUserId: string; prompt: string; response: string }[] = [];
    for (const [userId, prompts] of Object.entries(feedback)) {
      for (const [prompt, response] of Object.entries(prompts)) {
        if (response) entries.push({ revieweeUserId: userId, prompt, response });
      }
    }
    if (entries.length === 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/feedback`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      if (res.ok) setSubmitted(true);
    } catch { /* silent */ }
    setSubmitting(false);
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

  if (loading) return null;
  if (dismissed) return null;
  if (attendees.length === 0 && issuesAgainstMe.length === 0) return null;

  const hasAnyFeedback = Object.values(feedback).some((prompts) =>
    Object.values(prompts).some((v) => v != null),
  );

  const currentAttendee = attendees[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === attendees.length - 1;
  const currentHasResponse = currentAttendee
    ? Object.values(feedback[currentAttendee.userId] ?? {}).some((v) => v != null)
    : false;

  const openIssueForPerson = (attendee: Attendee) => {
    setIssueTarget(attendee);
    setIssueDone(false);
    setIssueType("");
    setIssueDialogOpen(true);
  };

  return (
    <>
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 3,
          overflow: "hidden",
          borderColor: submitted ? "success.light" : "grey.300",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: { xs: 2, sm: 2.5 },
            py: { xs: 1.75, sm: 2 },
            bgcolor: submitted ? "#f0fdf4" : "#fffbeb",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.5}>
            {submitted ? (
              <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 24 }} />
            ) : (
              <Box sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                bgcolor: "#f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 800,
                color: "#fff",
                flexShrink: 0,
              }}>
                !
              </Box>
            )}
            <Box>
              <Typography fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" }, lineHeight: 1.3 }}>
                {submitted ? "Feedback submitted" : "How did it go?"}
              </Typography>
              {!submitted && (
                <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.3, display: { xs: "none", sm: "block" } }}>
                  Quick, private feedback to improve future matches
                </Typography>
              )}
            </Box>
          </Stack>
        </Box>

        <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: { xs: 1.5, sm: 2 }, pb: { xs: 2, sm: 2.5 } }}>
            {/* Dispute banner for attendance issues against the current user */}
            {issuesAgainstMe.length > 0 && (
              <Box sx={{
                mb: 2,
                p: 2,
                borderRadius: 2,
                bgcolor: issuesAgainstMe.every((i) => i.status === "disputed") ? "#f0f4f8" : "#fef3c7",
                border: "1px solid",
                borderColor: issuesAgainstMe.every((i) => i.status === "disputed") ? "grey.300" : "#fbbf24",
              }}>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  {issuesAgainstMe.every((i) => i.status === "disputed")
                    ? "You disputed an attendance concern on this plan"
                    : "An attendance concern was raised about you for this plan"
                  }
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {issuesAgainstMe.every((i) => i.status === "disputed")
                    ? "Your dispute has been recorded. A moderator may review if needed."
                    : "If you believe this is inaccurate, you can dispute it. Your dispute is private and the reporter will not be notified."
                  }
                </Typography>
                {issuesAgainstMe.some((i) => i.status === "active") && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={handleDispute}
                    disabled={disputing}
                    sx={{ textTransform: "none", fontWeight: 600 }}
                  >
                    {disputing ? "Disputing..." : "Dispute this concern"}
                  </Button>
                )}
              </Box>
            )}

            {/* ── Submitted: compact done state ── */}
            {submitted ? (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: "0.875rem" }}>
                  Thanks for sharing your feedback. It helps improve matches for everyone.
                </Typography>

                <Divider sx={{ my: 2 }} />
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => { setConductDialogOpen(true); setConductDone(false); setConductReason(""); setConductDetails(""); }}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      borderRadius: 2,
                      borderColor: "grey.300",
                      color: "text.secondary",
                      "&:hover": { borderColor: "error.main", color: "error.main", bgcolor: "#fef2f2" },
                    }}
                  >
                    Report a safety or conduct concern
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setDismissDialogOpen(true)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                      color: "text.disabled",
                      bgcolor: "transparent",
                      "&:hover": { color: "text.secondary", bgcolor: "action.hover" },
                    }}
                  >
                    Hide
                  </Button>
                </Stack>
              </>
            ) : (
              <>
                {/* Progress indicator */}
                {attendees.length > 1 && (
                  <Stack direction="row" alignItems="center" justifyContent="center" spacing={1} sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" fontWeight={600}>
                      {currentIndex + 1} of {attendees.length}
                    </Typography>
                    <Stack direction="row" spacing={0.5}>
                      {attendees.map((_, i) => (
                        <Box
                          key={i}
                          onClick={() => setCurrentIndex(i)}
                          sx={{
                            width: i === currentIndex ? 18 : 8,
                            height: 8,
                            borderRadius: 4,
                            bgcolor: i === currentIndex ? "primary.main" : "grey.300",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                        />
                      ))}
                    </Stack>
                  </Stack>
                )}

                {/* Current person card */}
                {currentAttendee && (
                  <PersonFeedbackCard
                    attendee={currentAttendee}
                    responses={feedback[currentAttendee.userId] ?? {}}
                    onResponse={(prompt, value) => setResponse(currentAttendee.userId, prompt, value)}
                    avatarBase={avatarBase}
                    onReportIssue={() => openIssueForPerson(currentAttendee)}
                    hasReportedIssue={
                      Array.from(reportedIssues).some((k) => k.startsWith(currentAttendee.userId + ":"))
                    }
                  />
                )}

                {/* Stepper navigation */}
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ mt: 2 }}
                >
                  <Box sx={{ flex: 1 }}>
                    {!isFirst && (
                      <IconButton
                        onClick={() => setCurrentIndex((i) => i - 1)}
                        size="small"
                        sx={{ border: "1px solid", borderColor: "grey.300", borderRadius: 2, px: 1.5 }}
                      >
                        <ChevronLeftRoundedIcon sx={{ fontSize: 20 }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.25 }}>Back</Typography>
                      </IconButton>
                    )}
                  </Box>

                  <Box sx={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                    {isLast ? (
                        <Button
                        onClick={handleSubmit}
                        disabled={submitting || !hasAnyFeedback}
                        variant="contained"
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          borderRadius: 2,
                          px: 3,
                          py: 0.875,
                          fontSize: "0.9375rem",
                          "&.Mui-disabled": { bgcolor: "grey.200", color: "grey.500" },
                        }}
                      >
                        {submitting ? "Saving..." : "Submit feedback"}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setCurrentIndex((i) => i + 1)}
                        variant={currentHasResponse ? "contained" : "outlined"}
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          borderRadius: 2,
                          px: 2.5,
                          py: 0.875,
                          fontSize: "0.9375rem",
                          ...(currentHasResponse ? {} : { borderColor: "grey.300", color: "text.secondary" }),
                        }}
                        endIcon={<ChevronRightRoundedIcon sx={{ fontSize: 20 }} />}
                      >
                        {currentHasResponse ? "Next person" : "Skip"}
                      </Button>
                    )}
                  </Box>
                </Stack>

                {/* Conduct report & dismiss */}
                <Divider sx={{ my: 2 }} />
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => { setConductDialogOpen(true); setConductDone(false); setConductReason(""); setConductDetails(""); }}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      borderRadius: 2,
                      borderColor: "grey.300",
                      color: "text.secondary",
                      "&:hover": { borderColor: "error.main", color: "error.main", bgcolor: "#fef2f2" },
                    }}
                  >
                    Report a safety or conduct concern
                  </Button>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => setDismissDialogOpen(true)}
                    sx={{
                      textTransform: "none",
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                      color: "text.disabled",
                      bgcolor: "transparent",
                      "&:hover": { color: "text.secondary", bgcolor: "action.hover" },
                    }}
                  >
                    I don&apos;t want to leave feedback
                  </Button>
                </Stack>
              </>
            )}
          </Box>
      </Paper>

      {/* Attendance issue dialog */}
      <Dialog
        open={issueDialogOpen}
        onClose={() => setIssueDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
          Report attendance issue
        </DialogTitle>
        <DialogContent>
          {issueDone ? (
            <Stack spacing={1.5} alignItems="center" sx={{ py: 2 }}>
              <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 36 }} />
              <Typography variant="body2" color="text.secondary">Issue reported. Thank you.</Typography>
            </Stack>
          ) : (
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
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setIssueDialogOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
            {issueDone ? "Close" : "Cancel"}
          </Button>
          {!issueDone && (
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
          )}
        </DialogActions>
      </Dialog>

      {/* Conduct report dialog */}
      <Dialog
        open={conductDialogOpen}
        onClose={() => setConductDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
          Report a concern
        </DialogTitle>
        <DialogContent>
          {conductDone ? (
            <Stack spacing={1.5} alignItems="center" sx={{ py: 2 }}>
              <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 36 }} />
              <Typography variant="body2" color="text.secondary">Report submitted. We take these seriously.</Typography>
            </Stack>
          ) : (
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
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConductDialogOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
            {conductDone ? "Close" : "Cancel"}
          </Button>
          {!conductDone && (
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
          )}
        </DialogActions>
      </Dialog>

      {/* Dismiss confirmation dialog */}
      <Dialog
        open={dismissDialogOpen}
        onClose={() => setDismissDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: "1.0625rem", pb: 0.5 }}>
          {submitted ? "Hide feedback for this plan?" : "Skip feedback for this plan?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {submitted
              ? "Your feedback has been saved. This will permanently hide this section from your view."
              : "This will permanently hide the feedback section for this plan. You won't be able to leave feedback later."}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDismissDialogOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            onClick={handleDismiss}
            disabled={dismissing}
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            {dismissing ? "Hiding..." : submitted ? "Yes, hide" : "Yes, skip feedback"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function PersonFeedbackCard({
  attendee,
  responses,
  onResponse,
  avatarBase,
  onReportIssue,
  hasReportedIssue,
}: {
  attendee: Attendee;
  responses: Partial<Record<Prompt, Response>>;
  onResponse: (prompt: Prompt, value: Response) => void;
  avatarBase: string;
  onReportIssue: () => void;
  hasReportedIssue: boolean;
}) {
  const prompts = PROMPTS.filter((p) => !p.hostOnly || attendee.isHost);
  const profileHref = attendee.username
    ? `/u/${attendee.username.replace(/^@/, "")}`
    : null;

  const nameContent = (
    <Typography
      component={profileHref ? Link : "span"}
      {...(profileHref ? { href: profileHref } : {})}
      fontWeight={700}
      sx={{
        fontSize: "0.9375rem",
        lineHeight: 1.3,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: 0,
        textDecoration: "none",
        color: profileHref ? "primary.main" : "text.primary",
        "&:hover": profileHref ? { textDecoration: "underline" } : {},
      }}
    >
      {attendee.displayName}
    </Typography>
  );

  return (
    <Box>
      {/* Person header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.25}
        sx={{ mb: 2 }}
      >
        <Avatar
          src={`${avatarBase}/users/${attendee.userId}/avatar`}
          sx={{ width: 32, height: 32, fontSize: "0.875rem" }}
        >
          {attendee.displayName[0]?.toUpperCase()}
        </Avatar>
        {nameContent}
        {attendee.isHost && (
          <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, fontSize: "0.75rem", flexShrink: 0 }}>
            Host
          </Typography>
        )}
      </Stack>

      {/* Prompt rows */}
      <Stack spacing={1.75}>
        {prompts.map((p) => {
          const current = responses[p.key] ?? null;
          return (
            <Box key={p.key}>
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  fontWeight: 500,
                  mb: 0.75,
                  lineHeight: 1.4,
                  fontSize: "0.9375rem",
                }}
              >
                {p.label}
              </Typography>
              <Stack direction="row" spacing={0.75}>
                {RESPONSE_OPTIONS.map((opt) => {
                  const isSelected = current === opt.value;
                  return (
                    <Box
                      key={opt.value}
                      onClick={() => onResponse(p.key, opt.value)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onResponse(p.key, opt.value); } }}
                      sx={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        py: 0.625,
                        px: 1,
                        borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: isSelected ? "transparent" : "grey.200",
                        bgcolor: isSelected ? opt.selectedBg : "transparent",
                        color: isSelected ? opt.selectedColor : "text.disabled",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                        userSelect: "none",
                        "&:hover": {
                          bgcolor: isSelected ? opt.selectedBg : opt.hoverBg,
                          borderColor: isSelected ? "transparent" : "grey.300",
                        },
                      }}
                    >
                      {opt.label}
                    </Box>
                  );
                })}
              </Stack>
            </Box>
          );
        })}
      </Stack>

      {/* Per-person attendance issue prompt */}
      <Box sx={{ mt: 2 }}>
        {hasReportedIssue ? (
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "success.main" }} />
            <Typography variant="caption" sx={{ color: "success.dark", fontWeight: 600 }}>
              Attendance issue reported
            </Typography>
          </Stack>
        ) : (
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            onClick={onReportIssue}
            sx={{ cursor: "pointer", "&:hover .issue-text": { textDecoration: "underline" } }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            <Typography
              className="issue-text"
              variant="body2"
              sx={{ color: "text.secondary", fontWeight: 500, fontSize: "0.8125rem" }}
            >
              Let us know if this person didn&apos;t show up or arrived very late
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
