"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SearchIcon from "@mui/icons-material/Search";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type PlanRow = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  visibility: string;
  host_user_id: string;
  created_at: string;
  canceled_at: string | null;
  max_seats: number | null;
  location_type: string;
  location_name: string | null;
  location_address: string | null;
  host_name: string | null;
  host_username: string | null;
  host_email: string | null;
  going_count: number;
  maybe_count: number;
  total_rsvps: number;
};

type SortField = "created_at" | "starts_at" | "title" | "host_name" | "going_count";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function visibilityLabel(v: string): string {
  if (v === "invite_only") return "Invite only";
  if (v === "chums_only") return "Chums only";
  return "Public";
}

function statusColor(status: string, canceledAt: string | null): "default" | "success" | "error" | "warning" {
  if (canceledAt || status === "canceled") return "error";
  return "success";
}

function statusLabel(status: string, canceledAt: string | null, startsAt: string): string {
  if (canceledAt || status === "canceled") return "Canceled";
  if (new Date(startsAt) < new Date()) return "Past";
  return "Active";
}

export default function AdminPlansClient() {
  const toast = useToast();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PlanRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const fetchPlans = useCallback(async (q?: string, status?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status && status !== "all") params.set("status", status);
      const qs = params.toString();
      const res = await apiFetch(`/admin/plans${qs ? `?${qs}` : ""}`, { auth: true });
      if (res.ok) {
        const data = (await res.json()) as { plans: PlanRow[] };
        setPlans(data.plans ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPlans("", statusFilter); }, [fetchPlans, statusFilter]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPlans(val, statusFilter), 300);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "title" || field === "host_name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...plans];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "created_at": cmp = (a.created_at ?? "").localeCompare(b.created_at ?? ""); break;
        case "starts_at": cmp = (a.starts_at ?? "").localeCompare(b.starts_at ?? ""); break;
        case "title": cmp = (a.title ?? "").localeCompare(b.title ?? ""); break;
        case "host_name": cmp = (a.host_name ?? "").localeCompare(b.host_name ?? ""); break;
        case "going_count": cmp = a.going_count - b.going_count; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [plans, sortField, sortDir]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveSubmitting(true);
    try {
      const res = await apiFetch(`/admin/plans/${removeTarget.id}/remove`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: removeReason.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== removeTarget.id));
        toast.success(`"${removeTarget.title}" has been removed and the host has been notified`);
        setRemoveTarget(null);
        setRemoveReason("");
      } else if (data.error === "NOT_FOUND") {
        toast.error("This plan no longer exists");
      } else {
        toast.error("Failed to remove plan");
      }
    } catch {
      toast.error("Network error");
    }
    setRemoveSubmitting(false);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography
          component="h1"
          sx={{ mb: 0.5, lineHeight: 1.25, fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.02em", fontWeight: 700 }}
        >
          Plans
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
          All plans created on NewChums. Review for compliance and moderation.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search by title, host name, or email…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{ flex: 1, maxWidth: { sm: 360 } }}
        />
        <Select
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          <MenuItem value="upcoming">Upcoming</MenuItem>
          <MenuItem value="past">Past</MenuItem>
          <MenuItem value="canceled">Canceled</MenuItem>
        </Select>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {plans.length} plan{plans.length !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : sorted.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="body1" color="text.secondary">
            {search ? "No plans match your search." : "No plans found."}
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", bgcolor: "grey.50" } }}>
                <TableCell>
                  <TableSortLabel active={sortField === "created_at"} direction={sortField === "created_at" ? sortDir : "desc"} onClick={() => handleSort("created_at")}>
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === "title"} direction={sortField === "title" ? sortDir : "asc"} onClick={() => handleSort("title")}>
                    Title
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === "host_name"} direction={sortField === "host_name" ? sortDir : "asc"} onClick={() => handleSort("host_name")}>
                    Host
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === "starts_at"} direction={sortField === "starts_at" ? sortDir : "desc"} onClick={() => handleSort("starts_at")}>
                    Date/Time
                  </TableSortLabel>
                </TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortField === "going_count"} direction={sortField === "going_count" ? sortDir : "desc"} onClick={() => handleSort("going_count")}>
                    Attendance
                  </TableSortLabel>
                </TableCell>
                <TableCell>Location</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((plan) => (
                <TableRow key={plan.id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                    {formatDate(plan.created_at)}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <NextLink href={`/events/${plan.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                        {plan.title}
                      </Typography>
                    </NextLink>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem" }}>
                    <Box>
                      <Typography variant="body2" noWrap>
                        {plan.host_name || plan.host_username?.replace(/^@/, "") || "—"}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" noWrap>
                        {plan.host_email || ""}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                    {formatDateTime(plan.starts_at)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={statusLabel(plan.status, plan.canceled_at, plan.starts_at)}
                      size="small"
                      color={statusColor(plan.status, plan.canceled_at)}
                      variant={plan.canceled_at || plan.status === "canceled" ? "filled" : "outlined"}
                      sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={visibilityLabel(plan.visibility)}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                    <Typography variant="body2" component="span" fontWeight={600}>{plan.going_count}</Typography>
                    <Typography variant="body2" component="span" color="text.secondary"> going</Typography>
                    {plan.maybe_count > 0 && (
                      <Typography variant="body2" component="span" color="text.secondary">, {plan.maybe_count} maybe</Typography>
                    )}
                    {plan.max_seats != null && (
                      <Typography variant="caption" component="span" color="text.disabled"> / {plan.max_seats}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", maxWidth: 160 }}>
                    <Typography variant="body2" noWrap color="text.secondary">
                      {plan.location_type === "online"
                        ? "Online"
                        : plan.location_name || plan.location_address || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title="Remove plan">
                      <IconButton size="small" color="error" onClick={() => setRemoveTarget(plan)}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Remove confirmation dialog */}
      <Dialog open={!!removeTarget} onClose={() => { if (!removeSubmitting) { setRemoveTarget(null); setRemoveReason(""); } }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Remove plan</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This will permanently delete <strong>&ldquo;{removeTarget?.title}&rdquo;</strong> and all associated data (RSVPs, invites, chat messages). The host will receive an email notification with a Terms of Use warning. This action cannot be undone.
          </Typography>
          <TextField
            label="Reason (optional)"
            placeholder="e.g. Violates community guidelines"
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            fullWidth
            multiline
            rows={2}
            size="small"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setRemoveTarget(null); setRemoveReason(""); }} disabled={removeSubmitting}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleRemove} disabled={removeSubmitting}>
            {removeSubmitting ? "Removing…" : "Remove plan"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
