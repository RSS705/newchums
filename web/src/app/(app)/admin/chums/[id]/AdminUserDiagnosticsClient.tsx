"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
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
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import MuiLink from "@mui/material/Link";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import IconButton from "@mui/material/IconButton";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import AdminHardDeleteDialog from "@/components/admin/AdminHardDeleteDialog";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";

type AttendanceIssue = {
  id: string;
  planId: string;
  planTitle: string | null;
  issueType: string;
  isHostReport: boolean;
  status: string;
  createdAt: string;
  reporterUserId: string;
  reporterLabel: string;
};
type ConductReport = { reason: string; count: number };
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
  attendanceIssues: AttendanceIssue[];
  conductReports: ConductReport[];
  planStats: PlanStats;
  objectives?: ObjectivesData;
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

  const { user, attendanceIssues, conductReports, planStats } = data;

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

      {/* Attendance Issues */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <SectionTitle>Attendance Issue Reports (received)</SectionTitle>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5 }}>
          Host-recorded no-show records with status and admin controls. Reporter identity is shown for admin use only. Dismissing a record is the one action that restores the person&apos;s public &ldquo;Shows up&rdquo; credit.
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
                                        x.id === ai.id ? { ...x, status: "dismissed" } : x,
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
                                        x.id === ai.id ? { ...x, status: "confirmed" } : x,
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

      {/* Attendance record reference */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, bgcolor: "action.hover" }}>
        <SectionTitle>Attendance Record Reference</SectionTitle>
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Collection:</strong> Hosts record no-shows from their private post-plan check-in. Attendee-to-attendee reporting and the hidden metric scoring were removed in July 2026.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Public effect:</strong> The profile &ldquo;Shows up&rdquo; ratio counts committed plans without a non-dismissed no-show or very-late record. <strong>Dismissed</strong> is the only status that stops a record from counting; disputed and confirmed records still count.
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
            <strong>Recourse:</strong> The reported person can dispute from the plan page, which flags the record for review here. Nobody is notified at any step.
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
