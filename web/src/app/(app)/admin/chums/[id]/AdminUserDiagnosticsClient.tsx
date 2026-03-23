"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import IconButton from "@mui/material/IconButton";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

type MetricRow = { metric: string; score: number; signalCount: number; updatedAt: string };
type FeedbackAgg = { prompt: string; response: string; count: number };
type RecentFeedback = {
  prompt: string;
  response: string;
  createdAt: string;
  planTitle: string;
  planDate: string;
  reviewerUserId?: string;
  reporterLabel?: string;
};
type AttendanceIssue = { issue_type: string; count: number };
type ConductReport = { reason: string; count: number };
type PrefData = { enabled: boolean; reliability: string; sociability: string; presentation: string; hosting: string; updatedAt: string } | null;
type UserInfo = { id: string; email: string; username: string | null; name: string | null; createdAt: string; role: string | null; isSuspended: boolean };
type PlanStats = { plans_going: number; plans_hosted: number };

type DiagnosticsData = {
  user: UserInfo;
  metrics: MetricRow[];
  preferences: PrefData;
  attendanceIssues: AttendanceIssue[];
  conductReports: ConductReport[];
  feedbackReceived: FeedbackAgg[];
  recentFeedback: RecentFeedback[];
  planStats: PlanStats;
};

const METRIC_LABELS: Record<string, string> = {
  reliability: "Reliability",
  sociability: "Sociability",
  presentation: "Personal Care",
  hosting_skills: "Hosting Skills",
  match_quality: "Match Quality",
};

const PREF_LABELS: Record<string, string> = {
  open: "Open to anyone",
  preferred: "Preferred",
  important: "Important",
  required: "Required",
};

const ISSUE_LABELS: Record<string, string> = {
  no_show: "No-show",
  late_cancel: "Cancelled too late",
  very_late: "Arrived very late",
};

const CONDUCT_LABELS: Record<string, string> = {
  rude_aggressive: "Rude or aggressive",
  harassment: "Harassment",
  boundary_issue: "Boundary issue",
  discriminatory: "Discriminatory",
  unsafe_intoxicated: "Unsafe / intoxicated",
  disruptive: "Disruptive",
  property_damage: "Property damage",
  other: "Other",
};

const RESPONSE_LABELS: Record<string, string> = {
  agree: "Yes",
  maybe: "Somewhat",
  disagree: "No",
};

function scoreColor(score: number): "success" | "warning" | "error" | "info" {
  if (score >= 60) return "success";
  if (score >= 40) return "warning";
  if (score >= 20) return "error";
  return "error";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return "—"; }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export default function AdminUserDiagnosticsClient() {
  const params = useParams();
  const userId = params.id as string;
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/users/${userId}/diagnostics`, { auth: true });
      if (!res.ok) {
        setError(res.status === 404 ? "User not found" : "Failed to load diagnostics");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { ok: boolean } & DiagnosticsData;
      if (json.ok) setData(json);
      else setError("Failed to load diagnostics");
    } catch {
      setError("Failed to load diagnostics");
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress size={32} />
      </Stack>
    );
  }

  if (error || !data) {
    return (
      <Stack spacing={2}>
        <Box>
          <IconButton component={Link} href="/admin/chums" size="small" sx={{ mb: 1 }}>
            <ArrowBackRoundedIcon />
          </IconButton>
        </Box>
        <Typography color="error">{error ?? "Unknown error"}</Typography>
      </Stack>
    );
  }

  const { user, metrics, preferences, attendanceIssues, conductReports, feedbackReceived, recentFeedback, planStats } = data;

  const allMetrics = ["reliability", "sociability", "presentation", "hosting_skills", "match_quality"];
  const metricMap = Object.fromEntries(metrics.map((m) => [m.metric, m]));

  return (
    <Stack spacing={3}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <IconButton component={Link} href="/admin/chums" size="small">
          <ArrowBackRoundedIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 0.25 }}>
            User Diagnostics
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.name ?? "—"} &middot; {user.username ? `@${user.username}` : "no handle"} &middot;{" "}
            <span style={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>{user.email}</span>
          </Typography>
        </Box>
        {user.isSuspended && <Chip label="Suspended" size="small" color="error" variant="outlined" />}
      </Stack>

      {/* Plan stats */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={4}>
          <Box>
            <Typography variant="caption" color="text.secondary">Plans going</Typography>
            <Typography variant="h6" fontWeight={700}>{planStats.plans_going}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Plans hosted</Typography>
            <Typography variant="h6" fontWeight={700}>{planStats.plans_hosted}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">Joined</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1rem" }}>{formatDate(user.createdAt)}</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Hidden Metrics */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Hidden Metric Scores</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Baseline is 50.00. Scores move based on feedback signals. Scores are never exposed to normal users.
        </Typography>
        <Stack spacing={2}>
          {allMetrics.map((key) => {
            const m = metricMap[key];
            const score = m?.score ?? 50;
            const signals = m?.signalCount ?? 0;
            return (
              <Box key={key}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {METRIC_LABELS[key] ?? key}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                    {score.toFixed(2)} &middot; {signals} signal{signals !== 1 ? "s" : ""}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(100, Math.max(0, score))}
                  color={scoreColor(score)}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {/* Chum Preferences */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Chum Preferences</SectionTitle>
        {preferences ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" fontWeight={600}>Enabled:</Typography>
              <Chip label={preferences.enabled ? "Yes" : "No"} size="small" color={preferences.enabled ? "success" : "default"} />
            </Stack>
            {(["reliability", "sociability", "presentation", "hosting"] as const).map((key) => (
              <Stack key={key} direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120 }}>
                  {METRIC_LABELS[key === "hosting" ? "hosting_skills" : key === "presentation" ? "presentation" : key] ?? key}:
                </Typography>
                <Chip
                  label={PREF_LABELS[preferences[key]] ?? preferences[key]}
                  size="small"
                  variant="outlined"
                  color={preferences[key] === "required" ? "error" : preferences[key] === "important" ? "warning" : "default"}
                />
              </Stack>
            ))}
            <Typography variant="caption" color="text.secondary">
              Last updated: {formatDate(preferences.updatedAt)}
            </Typography>
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">No preferences saved (using defaults).</Typography>
        )}
      </Paper>

      {/* Attendance Issues */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Attendance Issue Reports (received)</SectionTitle>
        {attendanceIssues.length > 0 ? (
          <Stack spacing={1}>
            {attendanceIssues.map((a) => (
              <Stack key={a.issue_type} direction="row" justifyContent="space-between">
                <Typography variant="body2">{ISSUE_LABELS[a.issue_type] ?? a.issue_type}</Typography>
                <Chip label={a.count} size="small" color={a.issue_type === "no_show" ? "error" : "warning"} />
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">No attendance issues reported against this user.</Typography>
        )}
      </Paper>

      {/* Conduct / Safety Reports */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Conduct / Safety Reports (received)</SectionTitle>
        {conductReports.length > 0 ? (
          <Stack spacing={1}>
            {conductReports.map((r) => (
              <Stack key={r.reason} direction="row" justifyContent="space-between">
                <Typography variant="body2">{CONDUCT_LABELS[r.reason] ?? r.reason}</Typography>
                <Chip label={r.count} size="small" color="error" variant="outlined" />
              </Stack>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">No conduct reports against this user.</Typography>
        )}
      </Paper>

      {/* Feedback Summary */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Feedback Received (aggregated)</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Anonymized totals of how others have rated this user across all plans. Reporter identities are not shown.
        </Typography>
        {feedbackReceived.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Metric</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Yes</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Somewhat</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>No</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allMetrics.map((metric) => {
                  const entries = feedbackReceived.filter((f) => f.prompt === metric);
                  if (entries.length === 0) return null;
                  const countByResponse = Object.fromEntries(entries.map((e) => [e.response, e.count]));
                  return (
                    <TableRow key={metric}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {METRIC_LABELS[metric] ?? metric}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ color: "success.main", fontWeight: 600 }}>
                          {countByResponse.agree ?? 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ color: "warning.main", fontWeight: 600 }}>
                          {countByResponse.maybe ?? 0}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="body2" sx={{ color: "error.main", fontWeight: 600 }}>
                          {countByResponse.disagree ?? 0}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary">No feedback received yet.</Typography>
        )}
      </Paper>

      {/* Recent Feedback Timeline */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Recent Feedback Timeline</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Most recent 50 feedback signals received. Plan title and reporter identity are shown for context.
        </Typography>
        {recentFeedback.length > 0 ? (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reporter</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Metric</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Response</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentFeedback.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{formatDate(f.createdAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.planTitle}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.reporterLabel ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{METRIC_LABELS[f.prompt] ?? f.prompt}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={RESPONSE_LABELS[f.response] ?? f.response}
                        size="small"
                        color={f.response === "agree" ? "success" : f.response === "maybe" ? "warning" : "error"}
                        variant="outlined"
                        sx={{ fontSize: "0.75rem" }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary">No feedback received yet.</Typography>
        )}
      </Paper>

      <Divider />

      {/* Score Explanation */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "action.hover" }}>
        <SectionTitle>Score Derivation Reference</SectionTitle>
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Baseline:</strong> Every metric starts at <strong>50.00</strong> with 0 signals. This represents a neutral, unrated state.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Feedback movement:</strong> Each feedback signal nudges the score toward a target using weighted averaging.
            &ldquo;Yes&rdquo; targets 80, &ldquo;Somewhat&rdquo; targets 50, &ldquo;No&rdquo; targets 20.
            The nudge size = (target &minus; current) &divide; (signal_count + 5), ensuring early signals have larger effect and later ones converge.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Attendance issues (Reliability):</strong> No-show = &minus;8 immediate penalty, Late cancel = &minus;5, Very late = &minus;3. These are direct penalties, not averaged.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Hosting Skills:</strong> Only moves from feedback on plans the user hosted (the &ldquo;hosting_skills&rdquo; prompt).
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" fontWeight={600}>Tolerance thresholds:</Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Open to anyone:</strong> No threshold applied &mdash; all users pass.<br />
            <strong>Preferred:</strong> Score must be &ge; 35 (tolerates mild negative average).<br />
            <strong>Important:</strong> Score must be &ge; 45 (tolerates only small negative average).<br />
            <strong>Required:</strong> Score must be &ge; 55 (firm minimum &mdash; near-baseline or positive required).
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}
