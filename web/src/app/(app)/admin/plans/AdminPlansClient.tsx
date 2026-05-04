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
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
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
import EditRoundedIcon from "@mui/icons-material/EditRounded";
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
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  hide_from_explore: boolean;
  host_name: string | null;
  host_username: string | null;
  host_email: string | null;
  going_count: number;
  maybe_count: number;
  total_rsvps: number;
};

type AdminCommunityRow = {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  status: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
};

type SortField = "created_at" | "starts_at" | "title" | "host_name" | "going_count";
type SortDir = "asc" | "desc";

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "-";
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
      hour12: true,
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

  const [editTarget, setEditTarget] = useState<PlanRow | null>(null);
  const [editPicked, setEditPicked] = useState<{ id: string; name: string; slug: string } | null>(null);
  const [editHideFromExplore, setEditHideFromExplore] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editCommunityQuery, setEditCommunityQuery] = useState("");
  const [editCommunityResults, setEditCommunityResults] = useState<AdminCommunityRow[]>([]);
  const [editCommunitySearching, setEditCommunitySearching] = useState(false);
  const editCommunityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const openEdit = (plan: PlanRow) => {
    setEditTarget(plan);
    setEditPicked(
      plan.community_id && plan.community_slug
        ? { id: plan.community_id, name: plan.community_name ?? plan.community_slug, slug: plan.community_slug }
        : null,
    );
    setEditHideFromExplore(plan.hide_from_explore);
    setEditCommunityQuery("");
    setEditCommunityResults([]);
  };

  const closeEdit = () => {
    if (editSubmitting) return;
    setEditTarget(null);
    setEditCommunityQuery("");
    setEditCommunityResults([]);
  };

  const handleEditCommunityQuery = (val: string) => {
    setEditCommunityQuery(val);
    if (editCommunityDebounceRef.current) clearTimeout(editCommunityDebounceRef.current);
    const q = val.trim();
    if (!q) {
      setEditCommunityResults([]);
      setEditCommunitySearching(false);
      return;
    }
    setEditCommunitySearching(true);
    editCommunityDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/admin/communities?q=${encodeURIComponent(q)}&limit=15`, { auth: true });
        const data = await res.json();
        if (data.ok && Array.isArray(data.communities)) {
          setEditCommunityResults((data.communities as AdminCommunityRow[]).slice(0, 15));
        } else {
          setEditCommunityResults([]);
        }
      } catch {
        setEditCommunityResults([]);
      }
      setEditCommunitySearching(false);
    }, 300);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const nextCommunityId = editPicked?.id ?? null;
    if (editTarget.visibility === "invite_only" && nextCommunityId !== null) {
      toast.error("Invite-only plans cannot be linked to a community");
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/admin/plans/${editTarget.id}/community`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          community_id: nextCommunityId,
          hide_from_explore: nextCommunityId !== null && editHideFromExplore,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        plan?: { community_id: string | null; hide_from_explore: boolean; community_name: string | null; community_slug: string | null };
      };
      if (data.ok && data.plan) {
        const updated = data.plan;
        setPlans((prev) => prev.map((p) =>
          p.id === editTarget.id
            ? {
                ...p,
                community_id: updated.community_id,
                community_name: updated.community_name,
                community_slug: updated.community_slug,
                hide_from_explore: updated.hide_from_explore,
              }
            : p,
        ));
        toast.success(
          updated.community_id
            ? `Linked to "${updated.community_name ?? "community"}"`
            : "Community link cleared",
        );
        closeEdit();
      } else if (data.error === "NOT_FOUND") {
        toast.error("This plan no longer exists");
      } else {
        toast.error(data.message || "Failed to update plan");
      }
    } catch {
      toast.error("Network error");
    }
    setEditSubmitting(false);
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
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel active={sortField === "created_at"} direction={sortField === "created_at" ? sortDir : "desc"} onClick={() => handleSort("created_at")}>
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === "title"} direction={sortField === "title" ? sortDir : "asc"} onClick={() => handleSort("title")}>
                    Title
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  <TableSortLabel active={sortField === "host_name"} direction={sortField === "host_name" ? sortDir : "asc"} onClick={() => handleSort("host_name")}>
                    Host
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  <TableSortLabel active={sortField === "starts_at"} direction={sortField === "starts_at" ? sortDir : "desc"} onClick={() => handleSort("starts_at")}>
                    Date/Time
                  </TableSortLabel>
                </TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Visibility</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }} align="right">
                  <TableSortLabel active={sortField === "going_count"} direction={sortField === "going_count" ? sortDir : "desc"} onClick={() => handleSort("going_count")}>
                    Attendance
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Location</TableCell>
                <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>Community</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((plan) => (
                <TableRow key={plan.id} hover sx={{ "&:last-child td": { borderBottom: 0 } }}>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem", display: { xs: "none", md: "table-cell" } }}>
                    {formatDate(plan.created_at)}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 240 }}>
                    <NextLink href={`/events/${plan.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                        {plan.title}
                      </Typography>
                    </NextLink>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", display: { xs: "none", sm: "table-cell" } }}>
                    <Box>
                      <Typography variant="body2" noWrap>
                        {plan.host_name || plan.host_username?.replace(/^@/, "") || "-"}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" noWrap>
                        {plan.host_email || ""}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem", display: { xs: "none", sm: "table-cell" } }}>
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
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Chip
                      label={visibilityLabel(plan.visibility)}
                      size="small"
                      variant="outlined"
                      sx={{ fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem", display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="body2" component="span" fontWeight={600}>{plan.going_count}</Typography>
                    <Typography variant="body2" component="span" color="text.secondary"> going</Typography>
                    {plan.maybe_count > 0 && (
                      <Typography variant="body2" component="span" color="text.secondary">, {plan.maybe_count} maybe</Typography>
                    )}
                    {plan.max_seats != null && (
                      <Typography variant="caption" component="span" color="text.disabled"> / {plan.max_seats}</Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", maxWidth: 160, display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="body2" noWrap color="text.secondary">
                      {plan.location_type === "online"
                        ? "Online"
                        : plan.location_name || plan.location_address || "-"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", maxWidth: 180, display: { xs: "none", lg: "table-cell" } }}>
                    {plan.community_id && plan.community_slug ? (
                      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                        <NextLink href={`/communities/${plan.community_slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                          <Typography variant="body2" noWrap fontWeight={600} sx={{ "&:hover": { textDecoration: "underline" } }}>
                            {plan.community_name || plan.community_slug}
                          </Typography>
                        </NextLink>
                        {plan.hide_from_explore && (
                          <Typography variant="caption" color="text.disabled">
                            Members only
                          </Typography>
                        )}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.disabled">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="Edit community link">
                        <IconButton size="small" onClick={() => openEdit(plan)}>
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove plan">
                        <IconButton size="small" color="error" onClick={() => setRemoveTarget(plan)}>
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
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

      {/* Edit (link to community) dialog */}
      <Dialog open={!!editTarget} onClose={closeEdit} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit plan</DialogTitle>
        <DialogContent>
          {editTarget && (
            <Stack spacing={2.5} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Plan
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {editTarget.title}
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  Hosted by {editTarget.host_name || editTarget.host_username?.replace(/^@/, "") || "unknown"}
                </Typography>
              </Box>

              {editTarget.visibility === "invite_only" ? (
                <Box sx={{ p: 1.5, borderRadius: 1.5, border: "1px solid", borderColor: "warning.light", bgcolor: "warning.light", color: "warning.dark" }}>
                  <Typography variant="body2">
                    This plan is invite-only and cannot be linked to a community. Change its visibility before linking.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.625 }}>
                      Linked community
                    </Typography>
                    {editPicked ? (
                      <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                          {editPicked.name}
                        </Typography>
                        <Button size="small" onClick={() => setEditPicked(null)} sx={{ textTransform: "none" }}>
                          Clear
                        </Button>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">
                        Not linked to any community.
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, lineHeight: 1.5 }}>
                      Super admin override. The host doesn&apos;t need to be a member of the chosen community, and they won&apos;t be notified.
                    </Typography>
                  </Box>

                  <TextField
                    size="small"
                    placeholder="Search communities by name, slug, or owner…"
                    value={editCommunityQuery}
                    onChange={(e) => handleEditCommunityQuery(e.target.value)}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                          </InputAdornment>
                        ),
                      },
                    }}
                  />

                  {editCommunityQuery.trim() !== "" && (
                    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5, maxHeight: 260, overflowY: "auto" }}>
                      {editCommunitySearching ? (
                        <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                          <CircularProgress size={20} />
                        </Box>
                      ) : editCommunityResults.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                          No matching communities.
                        </Typography>
                      ) : (
                        editCommunityResults.map((c) => {
                          const selected = editPicked?.id === c.id;
                          const isClosed = c.status === "closed";
                          return (
                            <Box
                              key={c.id}
                              onClick={isClosed ? undefined : () => setEditPicked({ id: c.id, name: c.name, slug: c.slug })}
                              sx={{
                                px: 1.5,
                                py: 1,
                                cursor: isClosed ? "default" : "pointer",
                                bgcolor: selected ? "action.selected" : "transparent",
                                opacity: isClosed ? 0.55 : 1,
                                borderBottom: "1px solid",
                                borderColor: "divider",
                                "&:last-child": { borderBottom: 0 },
                                "&:hover": isClosed ? {} : { bgcolor: "action.hover" },
                              }}
                            >
                              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight={600} noWrap>
                                    {c.name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    {c.slug}
                                    {c.owner_email ? ` · owner ${c.owner_email}` : ""}
                                  </Typography>
                                </Box>
                                <Stack direction="row" spacing={0.5}>
                                  {c.visibility === "private" && (
                                    <Chip label="Private" size="small" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                                  )}
                                  {isClosed && (
                                    <Chip label="Closed" size="small" color="error" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                                  )}
                                </Stack>
                              </Stack>
                            </Box>
                          );
                        })
                      )}
                    </Box>
                  )}

                  {editPicked !== null && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={editHideFromExplore}
                          onChange={(e) => setEditHideFromExplore(e.target.checked)}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            Only show this plan to community members
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            When on, this plan only appears in the community feed and to members in their Explore.
                          </Typography>
                        </Box>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                  )}
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEdit} disabled={editSubmitting} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={editSubmitting || editTarget?.visibility === "invite_only"}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            {editSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
