"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import MuiLink from "@mui/material/Link";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import IconButton from "@mui/material/IconButton";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import AdminHardDeleteDialog from "@/components/admin/AdminHardDeleteDialog";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";

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
type AttendanceIssue = {
  id: string;
  planId: string;
  planTitle: string | null;
  issueType: string;
  isHostReport: boolean;
  confidence: number;
  appliedPenalty: number;
  status: string;
  createdAt: string;
  reporterUserId: string;
  reporterLabel: string;
};
type ConductReport = { reason: string; count: number };
type PrefData = { reliability: string; sociability: string; presentation: string; hosting: string; ageYears: number | null; updatedAt: string } | null;
type UserInfo = { id: string; email: string; username: string | null; name: string | null; createdAt: string; lastActiveAt: string | null; role: string | null; isSuspended: boolean };
type PlanStats = { plans_going: number; plans_hosted: number };

type ObjectivesData = {
  tutorialOff: boolean;
  nextStepKey: string | null;
  completed: Array<{ key: string; title: string; completedAt: string | null }>;
  incomplete: Array<{ key: string; title: string }>;
};

type DiagnosticsData = {
  user: UserInfo;
  metrics: MetricRow[];
  preferences: PrefData;
  attendanceIssues: AttendanceIssue[];
  conductReports: ConductReport[];
  feedbackReceived: FeedbackAgg[];
  recentFeedback: RecentFeedback[];
  planStats: PlanStats;
  objectives?: ObjectivesData;
};

const METRIC_LABELS: Record<string, string> = {
  reliability: "Reliability",
  sociability: "Sociability",
  presentation: "Cleanliness & Consideration",
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
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return "-"; }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 1.5 }}>
      {children}
    </Typography>
  );
}

type ActivityEntry = {
  id: string;
  method: string;
  path: string;
  route: string | null;
  status: number | null;
  occurred_at: string;
};

const ACTIVITY_SECTION_PAGE_SIZE = 25;

function formatActivityWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function activityStatusColor(status: number | null): string {
  if (status == null) return "text.disabled";
  if (status >= 500) return "error.main";
  if (status >= 400) return "warning.main";
  return "text.secondary";
}

/** Per-user request log fed by GET /admin/activity (one row per authenticated
 *  API request, 90-day retention). Fixed 30-day window here; the "Full log"
 *  link opens the KPI activity drill-in pre-filtered to this user for wider
 *  windows and path filtering. */
function RecentActivitySection({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await apiFetch(
        `/admin/activity?user_id=${userId}&days=30&limit=${ACTIVITY_SECTION_PAGE_SIZE}&offset=${offset}`,
        { auth: true },
      );
      if (!res.ok) throw new Error("Failed to load activity");
      const json = (await res.json()) as {
        ok: boolean;
        entries: ActivityEntry[];
        total: number;
        active_days: number;
        has_more: boolean;
      };
      if (!json.ok) throw new Error("Failed to load activity");
      return json;
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(0)
      .then((json) => {
        if (cancelled) return;
        setEntries(json.entries);
        setTotal(json.total);
        setActiveDays(json.active_days);
        setHasMore(json.has_more);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load activity");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const json = await fetchPage(entries.length);
      setEntries((prev) => [...prev, ...json.entries]);
      setTotal(json.total);
      setActiveDays(json.active_days);
      setHasMore(json.has_more);
    } catch {
      setError("Failed to load activity");
    }
    setLoadingMore(false);
  };

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
        <SectionTitle>Recent Activity</SectionTitle>
        <MuiLink
          component={Link}
          href={`/admin/kpis/activity?user_id=${userId}`}
          underline="hover"
          variant="body2"
          sx={{
            fontWeight: 600,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          Full log
          <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />
        </MuiLink>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
        {loading
          ? "Loading authenticated API requests from the last 30 days..."
          : `${total.toLocaleString()} authenticated API request${total !== 1 ? "s" : ""} on ${activeDays.toLocaleString()} day${activeDays !== 1 ? "s" : ""} in the last 30 days. Times are local. Entries are kept for 90 days; use the full log for older windows.`}
      </Typography>
      {loading ? (
        <Stack alignItems="center" sx={{ py: 3 }}>
          <CircularProgress size={24} />
        </Stack>
      ) : error ? (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      ) : entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No requests in the last 30 days.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow
                  sx={{
                    "& th": {
                      fontWeight: 700,
                      fontSize: "0.6875rem",
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: "text.secondary",
                      py: 1,
                    },
                  }}
                >
                  <TableCell>When</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>Path</TableCell>
                  <TableCell align="right">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.map((e) => (
                  <TableRow
                    key={e.id}
                    hover
                    sx={{
                      "& td": { py: 0.75, fontSize: "0.8125rem", verticalAlign: "top" },
                      "&:last-child td": { borderBottom: 0 },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                      {formatActivityWhen(e.occurred_at)}
                    </TableCell>
                    <TableCell sx={{ fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {e.method}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 340 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}
                      >
                        {e.path}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontFamily: "monospace", color: activityStatusColor(e.status) }}
                    >
                      {e.status ?? "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center" }}>
              {loadingMore ? (
                <CircularProgress size={20} />
              ) : (
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleLoadMore}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 3 }}
                >
                  Load more
                </Button>
              )}
            </Box>
          )}
        </Stack>
      )}
    </Paper>
  );
}

function EditableMetricRow({
  metricKey,
  metricRow,
  userId,
  onSaved,
}: {
  metricKey: string;
  metricRow: MetricRow | null;
  userId: string;
  onSaved: (updated: { score: number }) => void;
}) {
  const score = metricRow?.score ?? 50;
  const signals = metricRow?.signalCount ?? 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(score));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleEdit = () => {
    setDraft(score.toFixed(2));
    setSaveError(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError(null);
  };

  const handleSave = async () => {
    const val = parseFloat(draft);
    if (isNaN(val) || val < 0 || val > 100) {
      setSaveError("Score must be 0–100");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch(`/admin/users/${userId}/metrics`, {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metric: metricKey, score: val }),
      });
      if (res.ok) {
        onSaved({ score: val });
        setEditing(false);
      } else {
        const json = await res.json().catch(() => ({}));
        setSaveError((json as { error?: string }).error ?? "Failed to save");
      }
    } catch {
      setSaveError("Network error");
    }
    setSaving(false);
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600}>
          {METRIC_LABELS[metricKey] ?? metricKey}
        </Typography>
        {editing ? (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <TextField
              inputRef={inputRef}
              size="small"
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); void handleSave(); }
                if (e.key === "Escape") handleCancel();
              }}
              inputProps={{ min: 0, max: 100, step: 0.01, style: { fontFamily: "monospace", fontSize: "0.8125rem", width: 72, textAlign: "right", padding: "4px 8px" } }}
              disabled={saving}
              error={!!saveError}
            />
            <IconButton size="small" onClick={() => void handleSave()} disabled={saving} color="success">
              <CheckRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <IconButton size="small" onClick={handleCancel} disabled={saving}>
              <CloseRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
            {saveError && (
              <Typography variant="caption" color="error" sx={{ ml: 0.5 }}>{saveError}</Typography>
            )}
          </Stack>
        ) : (
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
              {score.toFixed(2)} &middot; {signals} signal{signals !== 1 ? "s" : ""}
            </Typography>
            <IconButton size="small" onClick={handleEdit} sx={{ ml: 0.25, p: 0.25 }}>
              <EditRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
            </IconButton>
          </Stack>
        )}
      </Stack>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, editing ? (parseFloat(draft) || 0) : score))}
        color={scoreColor(editing ? (parseFloat(draft) || 0) : score)}
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
}

export default function AdminUserDiagnosticsClient() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
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
            {user.name ?? "-"} &middot; {user.username ? `@${user.username}` : "no handle"} &middot;{" "}
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
          <Box>
            <Typography variant="caption" color="text.secondary">Last login</Typography>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1rem" }}>{formatDate(user.lastActiveAt)}</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Recent activity (per-request log) */}
      <RecentActivitySection userId={userId} />

      {/* Hidden Metrics */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Hidden Metric Scores</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Baseline is 50.00. Scores move based on feedback signals. Scores are never exposed to normal users.
          Click the edit icon to adjust a score manually.
        </Typography>
        <Stack spacing={2}>
          {allMetrics.map((key) => (
            <EditableMetricRow
              key={key}
              metricKey={key}
              metricRow={metricMap[key] ?? null}
              userId={userId}
              onSaved={(updated) => {
                setData((prev) => {
                  if (!prev) return prev;
                  const existing = prev.metrics.find((m) => m.metric === key);
                  if (existing) {
                    return {
                      ...prev,
                      metrics: prev.metrics.map((m) =>
                        m.metric === key ? { ...m, score: updated.score, updatedAt: new Date().toISOString() } : m,
                      ),
                    };
                  }
                  return {
                    ...prev,
                    metrics: [...prev.metrics, { metric: key, score: updated.score, signalCount: 0, updatedAt: new Date().toISOString() }],
                  };
                });
              }}
            />
          ))}
        </Stack>
      </Paper>

      {/* Chum Preferences */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Chum Preferences</SectionTitle>
        {preferences ? (
          <Stack spacing={1.5}>
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
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 120 }}>
                Age range:
              </Typography>
              <Chip
                label={preferences.ageYears == null ? "Any age" : `Within ${preferences.ageYears} years`}
                size="small"
                variant="outlined"
              />
            </Stack>
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
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Detailed per-issue view with confidence, status, and admin controls. Reporter identity is shown for admin use only.
        </Typography>
        {attendanceIssues.length > 0 ? (
          <TableContainer sx={{ maxHeight: 400 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Plan</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reporter</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Host?</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Confidence</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Penalty</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attendanceIssues.map((ai) => (
                  <TableRow
                    key={ai.id}
                    sx={{
                      bgcolor: ai.status === "dismissed" ? "#fafafa" : ai.status === "disputed" ? "#fffbeb" : ai.status === "confirmed" ? "#f0fdf4" : undefined,
                      opacity: ai.status === "dismissed" ? 0.6 : 1,
                    }}
                  >
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{formatDate(ai.createdAt)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ai.planTitle ?? "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{ISSUE_LABELS[ai.issueType] ?? ai.issueType}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ai.reporterLabel}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {ai.isHostReport ? <Chip label="Host" size="small" color="info" variant="outlined" sx={{ fontSize: "0.7rem" }} /> : "-"}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}>
                        {ai.confidence.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: "monospace", fontSize: "0.8125rem", color: "error.main" }}>
                        {ai.appliedPenalty.toFixed(2)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ai.status}
                        size="small"
                        variant="outlined"
                        color={ai.status === "dismissed" ? "default" : ai.status === "confirmed" ? "success" : ai.status === "disputed" ? "warning" : "info"}
                        sx={{ fontSize: "0.7rem", textTransform: "capitalize" }}
                      />
                    </TableCell>
                    <TableCell>
                      {ai.status !== "dismissed" && ai.status !== "confirmed" && (
                        <Stack direction="row" spacing={0.5}>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            sx={{ textTransform: "none", fontSize: "0.7rem", py: 0.25, px: 1, minWidth: 0 }}
                            onClick={async () => {
                              try {
                                const res = await apiFetch(`/admin/attendance-issues/${ai.id}/status`, {
                                  auth: true,
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "dismissed" }),
                                });
                                if (res.ok) {
                                  setData((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      attendanceIssues: prev.attendanceIssues.map((x) =>
                                        x.id === ai.id ? { ...x, status: "dismissed", confidence: 0, appliedPenalty: 0 } : x,
                                      ),
                                    };
                                  });
                                }
                              } catch { /* silent */ }
                            }}
                          >
                            Dismiss
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            sx={{ textTransform: "none", fontSize: "0.7rem", py: 0.25, px: 1, minWidth: 0 }}
                            onClick={async () => {
                              try {
                                const res = await apiFetch(`/admin/attendance-issues/${ai.id}/status`, {
                                  auth: true,
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ status: "confirmed" }),
                                });
                                if (res.ok) {
                                  setData((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      attendanceIssues: prev.attendanceIssues.map((x) =>
                                        x.id === ai.id ? { ...x, status: "confirmed", confidence: 1.0 } : x,
                                      ),
                                    };
                                  });
                                }
                              } catch { /* silent */ }
                            }}
                          >
                            Confirm
                          </Button>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
                        {f.reporterLabel ?? "-"}
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

      {/* Objectives / Nudge Progress */}
      {data.objectives && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <SectionTitle>Objectives Progress</SectionTitle>
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Chip
                label={`Tutorial tips: ${data.objectives.tutorialOff ? "OFF" : "ON"}`}
                size="small"
                color={data.objectives.tutorialOff ? "default" : "primary"}
                variant="outlined"
              />
              <Chip
                label={`${data.objectives.completed.length} of ${data.objectives.completed.length + data.objectives.incomplete.length} completed`}
                size="small"
                variant="outlined"
              />
              {data.objectives.nextStepKey && !data.objectives.tutorialOff && (
                <Chip
                  label={`Next step: ${data.objectives.nextStepKey}`}
                  size="small"
                  color="primary"
                  variant="filled"
                />
              )}
            </Stack>

            {data.objectives.completed.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Completed
                </Typography>
                <Stack spacing={0.5}>
                  {data.objectives.completed.map((o) => (
                    <Stack key={o.key} direction="row" spacing={1} alignItems="center">
                      <CheckRoundedIcon sx={{ fontSize: 16, color: "success.main" }} />
                      <Typography variant="body2">{o.title}</Typography>
                      {o.completedAt && (
                        <Typography variant="caption" color="text.disabled">
                          {formatDate(o.completedAt)}
                        </Typography>
                      )}
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}

            {data.objectives.incomplete.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                  Not yet completed
                </Typography>
                <Stack spacing={0.5}>
                  {data.objectives.incomplete.map((o) => (
                    <Stack key={o.key} direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid", borderColor: "grey.300", flexShrink: 0 }} />
                      <Typography variant="body2" color="text.secondary">{o.title}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        </Paper>
      )}

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
            <strong>Attendance issues (Reliability):</strong> Raw penalties: No-show = &minus;10, Very late = &minus;8, Late cancel = &minus;5.
            Effective penalty = raw &times; confidence (host reports: 1.0, uncorroborated non-host: 0.75, disputed: 0.5, dismissed: 0, confirmed/corroborated: 1.0).
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Hosting Skills:</strong> Only moves from feedback on plans the user hosted (the &ldquo;hosting_skills&rdquo; prompt).
          </Typography>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" fontWeight={600}>Tolerance thresholds:</Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Open to anyone:</strong> No threshold applied, all users pass.<br />
            <strong>Preferred:</strong> Score must be &ge; 35 (tolerates mild negative average).<br />
            <strong>Important:</strong> Score must be &ge; 45 (tolerates only small negative average).<br />
            <strong>Required:</strong> Score must be &ge; 55 (firm minimum, near-baseline or positive required).
          </Typography>
        </Stack>
      </Paper>
      {/* Danger zone: test-data hygiene */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, borderColor: "error.light" }}>
        <SectionTitle>Danger zone</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Hard delete removes this account and everything attached to it (hosted plans, RSVPs,
          chat, funnel analytics rows) in one audited transaction. No emails or notifications are
          sent. Super admin accounts cannot be hard-deleted.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteForeverRoundedIcon />}
          disabled={data?.user?.role === "super_admin"}
          onClick={() => setHardDeleteOpen(true)}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Hard delete this account
        </Button>
      </Paper>

      <AdminHardDeleteDialog
        open={hardDeleteOpen}
        subjectType="user"
        subjectId={userId}
        subjectLabel={data?.user?.username ?? data?.user?.email ?? undefined}
        onClose={() => setHardDeleteOpen(false)}
        onDeleted={() => router.push("/admin/chums")}
      />

    </Stack>
  );
}
