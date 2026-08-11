"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import MuiLink from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

type ActivityEntry = {
  id: string;
  user_id: string;
  method: string;
  path: string;
  route: string | null;
  status: number | null;
  occurred_at: string;
  email: string;
  username: string | null;
  name: string | null;
};

type ActivityResponse = {
  ok: boolean;
  entries: ActivityEntry[];
  total: number;
  unique_users: number;
  active_days: number;
  has_more: boolean;
};

const PAGE_SIZE = 50;

const EXCLUDE_RESEARCH_KEY = "nc_admin_activity_exclude_research";

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

const WINDOW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
];

function formatWhen(iso: string): string {
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

function statusColor(status: number | null): string {
  if (status == null) return "text.disabled";
  if (status >= 500) return "error.main";
  if (status >= 400) return "warning.main";
  return "text.secondary";
}

function StatCard({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, minWidth: 140, flex: "1 1 0" }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
        {tooltip && (
          <Tooltip title={tooltip} arrow placement="top">
            <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
          </Tooltip>
        )}
      </Stack>
      <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export default function AdminActivityLogClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");

  const [days, setDays] = useState("7");
  const [userQuery, setUserQuery] = useState("");
  const [pathQuery, setPathQuery] = useState("");
  // Hide research-excluded accounts (the flag from the growth tooling; in
  // practice the admin's own test accounts). Persisted per browser so the
  // log stays decluttered across visits. localStorage is the store itself,
  // read via useSyncExternalStore: the server snapshot is false, so SSR
  // hydration matches and the saved value applies right after mount.
  const excludeResearch = useSyncExternalStore(
    subscribeToStorage,
    () => {
      try {
        return window.localStorage.getItem(EXCLUDE_RESEARCH_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const handleExcludeResearchChange = (checked: boolean) => {
    try {
      window.localStorage.setItem(EXCLUDE_RESEARCH_KEY, checked ? "1" : "0");
      // Same-tab writes don't fire "storage" natively; dispatch one so the
      // store re-reads.
      window.dispatchEvent(new StorageEvent("storage", { key: EXCLUDE_RESEARCH_KEY }));
    } catch { /* storage unavailable; the toggle just stays off */ }
  };
  // Debounced copies of the two text filters so we don't refetch per keystroke
  const [appliedUserQuery, setAppliedUserQuery] = useState("");
  const [appliedPathQuery, setAppliedPathQuery] = useState("");

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [activeDays, setActiveDays] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setAppliedUserQuery(userQuery.trim());
      setAppliedPathQuery(pathQuery.trim());
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [userQuery, pathQuery]);

  const buildQuery = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      params.set("days", days);
      params.set("limit", String(PAGE_SIZE));
      if (offset > 0) params.set("offset", String(offset));
      if (userId) params.set("user_id", userId);
      if (appliedUserQuery) params.set("q", appliedUserQuery);
      if (appliedPathQuery) params.set("path", appliedPathQuery);
      if (excludeResearch) params.set("exclude_research", "1");
      return params.toString();
    },
    [days, userId, appliedUserQuery, appliedPathQuery, excludeResearch],
  );

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await apiFetch(`/admin/activity?${buildQuery(offset)}`, { auth: true });
      if (!res.ok) throw new Error("Failed to load activity");
      const json = (await res.json()) as ActivityResponse;
      if (!json.ok) throw new Error("Failed to load activity");
      return json;
    },
    [buildQuery],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(0)
      .then((json) => {
        if (cancelled) return;
        setEntries(json.entries);
        setTotal(json.total);
        setUniqueUsers(json.unique_users);
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
      setUniqueUsers(json.unique_users);
      setActiveDays(json.active_days);
      setHasMore(json.has_more);
    } catch {
      setError("Failed to load more activity");
    }
    setLoadingMore(false);
  };

  const filteredUserLabel = userId
    ? entries.find((e) => e.user_id === userId)?.email ?? userId
    : null;

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", py: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
        <IconButton component={Link} href="/admin/kpis" size="small" aria-label="Back to KPIs">
          <ArrowBackRoundedIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>
          User activity log
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, ml: 5.5 }}>
        One row per authenticated API request, newest first. This is the raw signal behind the
        Return behavior metrics. Query strings are not recorded, and entries are kept for 90 days.
        Times are shown in your local timezone.
      </Typography>

      {/* Summary stats */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap">
        <StatCard
          label="Requests"
          value={total.toLocaleString()}
          tooltip="Authenticated API requests matching the current filters."
        />
        <StatCard
          label="Unique users"
          value={uniqueUsers.toLocaleString()}
          tooltip="Distinct accounts behind the matching requests."
        />
        <StatCard
          label="Active days"
          value={activeDays.toLocaleString()}
          tooltip="Distinct UTC days with at least one matching request. Most useful when filtered to a single user: it shows how often they come back."
        />
      </Stack>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 2.5 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
          <TextField
            select
            size="small"
            label="Window"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            {WINDOW_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Search user"
            placeholder="Email, handle, or name"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
          />
          <TextField
            size="small"
            label="Path contains"
            placeholder="e.g. /events"
            value={pathQuery}
            onChange={(e) => setPathQuery(e.target.value)}
            sx={{ minWidth: 180, flex: 1 }}
          />
          {userId && (
            <Chip
              label={`User: ${filteredUserLabel}`}
              size="small"
              onDelete={() => router.replace("/admin/kpis/activity")}
              sx={{ maxWidth: 260 }}
            />
          )}
          <Tooltip
            title="Hides requests from accounts flagged research-excluded in the growth tooling (your test accounts)."
            arrow
          >
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={excludeResearch}
                  onChange={(e) => handleExcludeResearchChange(e.target.checked)}
                />
              }
              label="Hide research accounts"
              slotProps={{ typography: { sx: { fontSize: "0.8125rem", fontWeight: 600, color: "text.secondary" } } }}
              sx={{ mr: 0, flexShrink: 0 }}
            />
          </Tooltip>
        </Stack>
      </Paper>

      {/* Table */}
      {loading ? (
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={32} />
        </Stack>
      ) : error ? (
        <Typography color="error" sx={{ py: 4, textAlign: "center" }}>
          {error}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
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
                        py: 1.25,
                        bgcolor: "grey.50",
                      },
                    }}
                  >
                    <TableCell>When</TableCell>
                    <TableCell>User</TableCell>
                    <TableCell>Method</TableCell>
                    <TableCell>Path</TableCell>
                    <TableCell align="right">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6, borderBottom: 0 }}>
                        <Typography variant="body2" color="text.secondary">
                          No activity matches these filters.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((e) => (
                      <TableRow
                        key={e.id}
                        hover
                        sx={{
                          "& td": { py: 1, fontSize: "0.8125rem", verticalAlign: "top" },
                          "&:last-child td": { borderBottom: 0 },
                        }}
                      >
                        <TableCell sx={{ whiteSpace: "nowrap", fontWeight: 500 }}>
                          {formatWhen(e.occurred_at)}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 220 }}>
                          <MuiLink
                            component={Link}
                            href={`/admin/chums/${e.user_id}`}
                            underline="hover"
                            sx={{ fontWeight: 600, display: "block", lineHeight: 1.3 }}
                          >
                            {e.name ?? (e.username ? `@${e.username}` : e.email)}
                          </MuiLink>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: "monospace", fontSize: "0.6875rem", wordBreak: "break-all" }}
                          >
                            {e.email}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
                          {e.method}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Tooltip title={e.route ?? ""} arrow placement="top-start">
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: "monospace", fontSize: "0.75rem", wordBreak: "break-all" }}
                            >
                              {e.path}
                            </Typography>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right" sx={{ fontFamily: "monospace", color: statusColor(e.status) }}>
                          {e.status ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", pt: 0.5 }}>
              {loadingMore ? (
                <CircularProgress size={24} />
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

          <Typography variant="caption" color="text.disabled" sx={{ textAlign: "center" }}>
            Showing {entries.length.toLocaleString()} of {total.toLocaleString()} requests
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
