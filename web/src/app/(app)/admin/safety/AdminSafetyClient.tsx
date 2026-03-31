"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import Link from "next/link";
import { apiFetch } from "@/lib/apiClient";

type UserRef = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
};

type ConcernReport = {
  id: string;
  planId: string;
  planTitle: string | null;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: UserRef;
  reported: UserRef;
};

const REASON_LABELS: Record<string, string> = {
  rude_aggressive: "Rude or aggressive behavior",
  harassment: "Harassment or inappropriate comments",
  boundary_issue: "Boundary issue",
  discriminatory: "Discriminatory behavior",
  unsafe_intoxicated: "Unsafe or intoxicated behavior",
  disruptive: "Disruptive behavior",
  property_damage: "Damage to property/items",
  other: "Other",
};

const STATUS_COLORS: Record<string, "error" | "warning" | "success" | "default"> = {
  new: "error",
  reviewed: "warning",
  closed: "success",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function userLabel(u: UserRef): string {
  if (u.name?.trim()) return u.name.trim();
  if (u.username) return `@${u.username.replace(/^@/, "")}`;
  return u.email;
}

export default function AdminSafetyClient() {
  const [reports, setReports] = useState<ConcernReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "reviewed" | "closed">("all");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/concern-reports", { auth: true });
      if (!res.ok) {
        setError("Failed to load reports");
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { ok: boolean; reports: ConcernReport[] };
      if (json.ok) setReports(json.reports);
      else setError("Failed to load reports");
    } catch {
      setError("Failed to load reports");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (reportId: string, newStatus: string) => {
    try {
      const res = await apiFetch(`/admin/concern-reports/${reportId}/status`, {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r)),
        );
      }
    } catch {
      /* silent */
    }
  };

  if (loading) {
    return (
      <Stack alignItems="center" sx={{ py: 8 }}>
        <CircularProgress size={32} />
      </Stack>
    );
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const newCount = reports.filter((r) => r.status === "new").length;
  const reviewedCount = reports.filter((r) => r.status === "reviewed").length;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Safety &amp; Concern Reports
        </Typography>
        <Typography variant="body2" color="text.secondary">
          User-submitted conduct and safety concern reports from the post-plan feedback form.
        </Typography>
      </Box>

      {/* Filter chips */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        <Chip
          label={`All (${reports.length})`}
          variant={filter === "all" ? "filled" : "outlined"}
          onClick={() => setFilter("all")}
          sx={{ fontWeight: filter === "all" ? 700 : 400 }}
        />
        <Chip
          label={`New (${newCount})`}
          color="error"
          variant={filter === "new" ? "filled" : "outlined"}
          onClick={() => setFilter("new")}
          sx={{ fontWeight: filter === "new" ? 700 : 400 }}
        />
        <Chip
          label={`Reviewed (${reviewedCount})`}
          color="warning"
          variant={filter === "reviewed" ? "filled" : "outlined"}
          onClick={() => setFilter("reviewed")}
          sx={{ fontWeight: filter === "reviewed" ? 700 : 400 }}
        />
        <Chip
          label={`Closed (${reports.filter((r) => r.status === "closed").length})`}
          color="success"
          variant={filter === "closed" ? "filled" : "outlined"}
          onClick={() => setFilter("closed")}
          sx={{ fontWeight: filter === "closed" ? 700 : 400 }}
        />
      </Stack>

      {filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2, textAlign: "center" }}>
          <Typography color="text.secondary">
            {filter === "all" ? "No concern reports have been submitted yet." : `No ${filter} reports.`}
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {filtered.map((report) => {
            const isExpanded = expandedId === report.id;
            return (
              <Paper
                key={report.id}
                variant="outlined"
                sx={{
                  borderRadius: 2,
                  overflow: "hidden",
                  borderColor: report.status === "new" ? "error.light" : "grey.300",
                }}
              >
                {/* Header row, clickable */}
                <Box
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2.5,
                    py: 1.75,
                    cursor: "pointer",
                    bgcolor: report.status === "new" ? "#fef2f2" : undefined,
                    "&:hover": { bgcolor: report.status === "new" ? "#fee2e2" : "action.hover" },
                    transition: "background-color 0.15s",
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Chip
                      label={report.status}
                      size="small"
                      color={STATUS_COLORS[report.status] ?? "default"}
                      variant="outlined"
                      sx={{ fontSize: "0.7rem", textTransform: "capitalize", flexShrink: 0 }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {REASON_LABELS[report.reason] ?? report.reason}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {userLabel(report.reporter)} reported {userLabel(report.reported)} &middot; {formatDate(report.createdAt)}
                      </Typography>
                    </Box>
                  </Stack>
                  {isExpanded ? (
                    <ExpandLessRoundedIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
                  ) : (
                    <ExpandMoreRoundedIcon sx={{ color: "text.secondary", flexShrink: 0 }} />
                  )}
                </Box>

                {/* Expanded detail */}
                <Collapse in={isExpanded}>
                  <Box sx={{ px: 2.5, pb: 2.5, pt: 1 }}>
                    <Stack spacing={2}>
                      {/* People */}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Reporter
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            {userLabel(report.reporter)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {report.reporter.email}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Button
                              component={Link}
                              href={`/admin/chums/${report.reporter.id}`}
                              size="small"
                              variant="text"
                              sx={{ textTransform: "none", fontSize: "0.75rem", p: 0, minWidth: 0 }}
                            >
                              View diagnostics
                            </Button>
                          </Box>
                        </Box>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Reported person
                          </Typography>
                          <Typography variant="body2" fontWeight={500}>
                            {userLabel(report.reported)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {report.reported.email}
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Button
                              component={Link}
                              href={`/admin/chums/${report.reported.id}`}
                              size="small"
                              variant="text"
                              sx={{ textTransform: "none", fontSize: "0.75rem", p: 0, minWidth: 0 }}
                            >
                              View diagnostics
                            </Button>
                          </Box>
                        </Box>
                      </Stack>

                      {/* Plan */}
                      <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          Related plan
                        </Typography>
                        <Typography variant="body2">
                          {report.planTitle ?? "Untitled plan"}
                        </Typography>
                        <Button
                          component={Link}
                          href={`/events/${report.planId}`}
                          size="small"
                          variant="text"
                          sx={{ textTransform: "none", fontSize: "0.75rem", p: 0, minWidth: 0, mt: 0.25 }}
                        >
                          View plan
                        </Button>
                      </Box>

                      {/* Reason + details */}
                      <Box>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          Concern reason
                        </Typography>
                        <Typography variant="body2" fontWeight={500}>
                          {REASON_LABELS[report.reason] ?? report.reason}
                        </Typography>
                      </Box>

                      {report.details && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" fontWeight={600}>
                            Details provided
                          </Typography>
                          <Paper
                            variant="outlined"
                            sx={{ p: 1.5, mt: 0.5, borderRadius: 1.5, bgcolor: "grey.50" }}
                          >
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                              {report.details}
                            </Typography>
                          </Paper>
                        </Box>
                      )}

                      {/* Submitted at */}
                      <Typography variant="caption" color="text.secondary">
                        Submitted: {formatDate(report.createdAt)}
                      </Typography>

                      {/* Admin actions */}
                      <Stack direction="row" spacing={1}>
                        {report.status === "new" && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ textTransform: "none", fontSize: "0.8125rem" }}
                            onClick={() => updateStatus(report.id, "reviewed")}
                          >
                            Mark as reviewed
                          </Button>
                        )}
                        {report.status !== "closed" && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            sx={{ textTransform: "none", fontSize: "0.8125rem" }}
                            onClick={() => updateStatus(report.id, "closed")}
                          >
                            Close report
                          </Button>
                        )}
                        {report.status === "closed" && (
                          <Button
                            size="small"
                            variant="outlined"
                            sx={{ textTransform: "none", fontSize: "0.8125rem" }}
                            onClick={() => updateStatus(report.id, "new")}
                          >
                            Reopen
                          </Button>
                        )}
                      </Stack>
                    </Stack>
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
