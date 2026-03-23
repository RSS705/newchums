"use client";

import { useCallback, useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
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
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

type Response = "agree" | "maybe" | "disagree" | null;
type Prompt = "reliability" | "sociability" | "presentation" | "match_quality" | "hosting_skills";

type Attendee = {
  userId: string;
  displayName: string;
  isHost: boolean;
};

type FeedbackState = Record<string, Partial<Record<Prompt, Response>>>;

const PROMPTS: { key: Prompt; label: string; hostOnly?: boolean }[] = [
  { key: "reliability", label: "Showed up and followed through reliably" },
  { key: "sociability", label: "I\u2019d spend time with this person again" },
  { key: "presentation", label: "This person showed basic personal care for an in-person gathering" },
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
  const [expanded, setExpanded] = useState(true);
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

  const avatarBase = getAvatarBaseUrl();

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/feedback`, { auth: true });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json() as {
        attendees: Attendee[];
        feedback: { reviewee_user_id: string; prompt: string; response: string }[];
        attendanceIssues: { reported_user_id: string; issue_type: string }[];
      };
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

  if (loading) return null;
  if (attendees.length === 0) return null;

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
          onClick={() => setExpanded((p) => !p)}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: { xs: 2, sm: 2.5 },
            py: { xs: 1.75, sm: 2 },
            cursor: "pointer",
            bgcolor: submitted ? "#f0fdf4" : "#fffbeb",
            "&:hover": { bgcolor: submitted ? "#dcfce7" : "#fef3c7" },
            transition: "background-color 0.15s",
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
          {expanded
            ? <ExpandLessRoundedIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
            : <ExpandMoreRoundedIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
          }
        </Box>

        <Collapse in={expanded}>
          <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: { xs: 1.5, sm: 2 }, pb: { xs: 2, sm: 2.5 } }}>
            {!submitted && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                Everything is optional and private. Tap to rate each person, it only takes a moment.
              </Typography>
            )}

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
                submitted={submitted}
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
                    {submitting ? "Saving..." : submitted ? "Update feedback" : "Submit feedback"}
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

            {/* Conduct report */}
            <Divider sx={{ my: 2.5 }} />
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
          </Box>
        </Collapse>
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
    </>
  );
}

function PersonFeedbackCard({
  attendee,
  responses,
  onResponse,
  submitted,
  avatarBase,
  onReportIssue,
  hasReportedIssue,
}: {
  attendee: Attendee;
  responses: Partial<Record<Prompt, Response>>;
  onResponse: (prompt: Prompt, value: Response) => void;
  submitted: boolean;
  avatarBase: string;
  onReportIssue: () => void;
  hasReportedIssue: boolean;
}) {
  const prompts = PROMPTS.filter((p) => !p.hostOnly || attendee.isHost);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        overflow: "hidden",
        borderColor: "grey.200",
      }}
    >
      {/* Person header */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2, py: 1.5, bgcolor: "grey.50" }}
      >
        <Avatar
          src={`${avatarBase}/users/${attendee.userId}/avatar`}
          sx={{ width: 40, height: 40, fontSize: "1rem" }}
        >
          {attendee.displayName[0]?.toUpperCase()}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {attendee.displayName}
          </Typography>
          {attendee.isHost && (
            <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600, fontSize: "0.75rem" }}>
              Host
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Prompt rows */}
      <Stack divider={<Divider />}>
        {prompts.map((p) => {
          const current = responses[p.key] ?? null;
          return (
            <Box key={p.key} sx={{ px: 2, py: 1.5 }}>
              <Typography
                variant="body1"
                sx={{
                  color: "text.primary",
                  fontWeight: 500,
                  mb: 1,
                  lineHeight: 1.5,
                }}
              >
                {p.label}
              </Typography>
              <Stack direction="row" spacing={1}>
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
                        py: { xs: 0.875, sm: 0.75 },
                        px: 1,
                        borderRadius: 1.5,
                        border: "1.5px solid",
                        borderColor: isSelected ? "transparent" : "grey.300",
                        bgcolor: isSelected ? opt.selectedBg : "transparent",
                        color: isSelected ? opt.selectedColor : "text.secondary",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: "0.875rem",
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                        userSelect: "none",
                        "&:hover": {
                          bgcolor: isSelected ? opt.selectedBg : opt.hoverBg,
                          borderColor: isSelected ? "transparent" : "grey.400",
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
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: hasReportedIssue ? "#f0fdf4" : "#fffbeb",
          borderTop: "1px solid",
          borderColor: "grey.200",
        }}
      >
        {hasReportedIssue ? (
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main" }} />
            <Typography variant="body2" sx={{ color: "success.dark", fontWeight: 600 }}>
              Attendance issue reported
            </Typography>
          </Stack>
        ) : (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            onClick={onReportIssue}
            sx={{ cursor: "pointer", "&:hover .issue-text": { textDecoration: "underline" } }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            <Typography
              className="issue-text"
              variant="body2"
              sx={{ color: "text.secondary", fontWeight: 500 }}
            >
              Let us know if this person didn&apos;t show up or arrived very late
            </Typography>
          </Stack>
        )}
      </Box>
    </Paper>
  );
}
