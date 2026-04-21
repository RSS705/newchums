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
import Paper from "@mui/material/Paper";
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
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SearchIcon from "@mui/icons-material/Search";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type CommunityRow = {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  join_mode: string;
  status: string;
  location_name: string | null;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
  member_count: number;
  plan_count: number;
  created_at: string;
};

type AdminUserRow = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  is_suspended: boolean;
};

type SortField = "created_at" | "name" | "member_count" | "plan_count";
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

export default function AdminCommunitiesClient() {
  const toast = useToast();
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [removeTarget, setRemoveTarget] = useState<CommunityRow | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  // Change-owner dialog state. One dialog handles both the search + pick
  // and the confirm step; no intermediate state worth splitting out.
  const [changeOwnerTarget, setChangeOwnerTarget] = useState<CommunityRow | null>(null);
  const [changeOwnerQuery, setChangeOwnerQuery] = useState("");
  const [changeOwnerResults, setChangeOwnerResults] = useState<AdminUserRow[]>([]);
  const [changeOwnerSearching, setChangeOwnerSearching] = useState(false);
  const [changeOwnerPicked, setChangeOwnerPicked] = useState<AdminUserRow | null>(null);
  const [changeOwnerSubmitting, setChangeOwnerSubmitting] = useState(false);
  const changeOwnerDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCommunities = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      const res = await apiFetch(`/admin/communities${qs ? `?${qs}` : ""}`, { auth: true });
      const data = await res.json();
      if (data.ok) setCommunities(data.communities ?? []);
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCommunities(); }, [fetchCommunities]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCommunities(val), 300);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "name" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    const arr = [...communities];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "created_at": cmp = (a.created_at ?? "").localeCompare(b.created_at ?? ""); break;
        case "name": cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }); break;
        case "member_count": cmp = a.member_count - b.member_count; break;
        case "plan_count": cmp = a.plan_count - b.plan_count; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [communities, sortField, sortDir]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveSubmitting(true);
    try {
      const res = await apiFetch(`/admin/communities/${removeTarget.id}/remove`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setCommunities((prev) => prev.filter((c) => c.id !== removeTarget.id));
        toast.success(`"${removeTarget.name}" has been removed`);
        setRemoveTarget(null);
      } else if (data.error === "NOT_FOUND") {
        toast.error("This community no longer exists");
      } else {
        toast.error("Failed to remove");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setRemoveSubmitting(false);
  };

  const openChangeOwner = (c: CommunityRow) => {
    setChangeOwnerTarget(c);
    setChangeOwnerQuery("");
    setChangeOwnerResults([]);
    setChangeOwnerPicked(null);
  };

  const closeChangeOwner = () => {
    if (changeOwnerSubmitting) return;
    setChangeOwnerTarget(null);
    setChangeOwnerQuery("");
    setChangeOwnerResults([]);
    setChangeOwnerPicked(null);
  };

  const handleChangeOwnerQuery = (val: string) => {
    setChangeOwnerQuery(val);
    setChangeOwnerPicked(null);
    if (changeOwnerDebounceRef.current) clearTimeout(changeOwnerDebounceRef.current);
    const q = val.trim();
    if (!q) {
      setChangeOwnerResults([]);
      setChangeOwnerSearching(false);
      return;
    }
    setChangeOwnerSearching(true);
    changeOwnerDebounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(`/admin/users?q=${encodeURIComponent(q)}`, { auth: true });
        const data = await res.json();
        if (data.ok && Array.isArray(data.users)) {
          // Cap the rendered list so the dialog stays usable; the server
          // returns the full match set, we only need the first handful.
          setChangeOwnerResults((data.users as AdminUserRow[]).slice(0, 10));
        } else {
          setChangeOwnerResults([]);
        }
      } catch {
        setChangeOwnerResults([]);
      }
      setChangeOwnerSearching(false);
    }, 300);
  };

  const handleConfirmChangeOwner = async () => {
    if (!changeOwnerTarget || !changeOwnerPicked) return;
    if (changeOwnerPicked.id === changeOwnerTarget.owner_user_id) {
      toast.info("That user is already the owner");
      return;
    }
    setChangeOwnerSubmitting(true);
    try {
      const res = await apiFetch(`/admin/communities/${changeOwnerTarget.id}/change-owner`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: changeOwnerPicked.id }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Owner changed for "${changeOwnerTarget.name}"`);
        // Patch the row in place so the new owner is immediately visible
        // in the table without refetching.
        setCommunities((prev) => prev.map((c) =>
          c.id === changeOwnerTarget.id
            ? {
                ...c,
                owner_user_id: changeOwnerPicked.id,
                owner_name: changeOwnerPicked.name,
                owner_username: changeOwnerPicked.username,
                owner_email: changeOwnerPicked.email,
              }
            : c
        ));
        setChangeOwnerTarget(null);
        setChangeOwnerQuery("");
        setChangeOwnerResults([]);
        setChangeOwnerPicked(null);
      } else if (data.error === "USER_SUSPENDED") {
        toast.error("That user is suspended. Unsuspend them before assigning ownership.");
      } else if (data.error === "USER_NOT_FOUND") {
        toast.error("That user no longer exists");
      } else if (data.error === "NOT_FOUND") {
        toast.error("This community no longer exists");
      } else {
        toast.error(data.message || "Could not change owner");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setChangeOwnerSubmitting(false);
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography
          component="h1"
          sx={{ mb: 0.5, lineHeight: 1.25, fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.02em", fontWeight: 700 }}
        >
          Communities
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
          All communities on NewChums. Search, review, and moderate.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search by name, slug, or owner…"
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
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {communities.length} communit{communities.length === 1 ? "y" : "ies"}
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : sorted.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="body1" color="text.secondary">
            {search ? "No communities match your search." : "No communities found."}
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
                  <TableSortLabel active={sortField === "name"} direction={sortField === "name" ? sortDir : "asc"} onClick={() => handleSort("name")}>
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Slug</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Visibility</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Join mode</TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortField === "member_count"} direction={sortField === "member_count" ? sortDir : "desc"} onClick={() => handleSort("member_count")}>
                    Members
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel active={sortField === "plan_count"} direction={sortField === "plan_count" ? sortDir : "desc"} onClick={() => handleSort("plan_count")}>
                    Plans
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>Owner</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((c) => (
                <TableRow
                  key={c.id}
                  hover
                  sx={{
                    opacity: c.status === "closed" ? 0.6 : 1,
                    "&:last-child td": { borderBottom: 0 },
                  }}
                >
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem", display: { xs: "none", md: "table-cell" } }}>
                    {formatDate(c.created_at)}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <NextLink href={`/communities/${c.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                        {c.name}
                      </Typography>
                    </NextLink>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 140, fontFamily: "monospace", fontSize: "0.8125rem" }}>
                      {c.slug}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={c.status === "closed" ? "Closed" : "Active"}
                      size="small"
                      color={c.status === "closed" ? "error" : "success"}
                      variant={c.status === "closed" ? "filled" : "outlined"}
                      sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
                    />
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                    {c.visibility === "private" ? (
                      <Chip icon={<LockRoundedIcon sx={{ fontSize: "12px !important" }} />} label="Private" size="small" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                    ) : (
                      <Chip label="Public" size="small" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      {c.join_mode === "approval_required" ? "Approval" : "Open"}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>{c.member_count}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={600}>{c.plan_count}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.8125rem", display: { xs: "none", sm: "table-cell" } }}>
                    <Box>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                        {c.owner_name || c.owner_username?.replace(/^@/, "") || "-"}
                      </Typography>
                      <Typography variant="caption" color="text.disabled" noWrap>
                        {c.owner_email || ""}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="View community">
                        <IconButton size="small" component={NextLink} href={`/communities/${c.slug}`}>
                          <OpenInNewRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Change owner">
                        <IconButton size="small" onClick={() => openChangeOwner(c)}>
                          <SwapHorizRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove community">
                        <IconButton size="small" color="error" onClick={() => setRemoveTarget(c)}>
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
      <Dialog open={!!removeTarget} onClose={() => { if (!removeSubmitting) setRemoveTarget(null); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Remove community</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will permanently delete <strong>&ldquo;{removeTarget?.name}&rdquo;</strong> and all its membership data. Events linked to this community will have their association cleared. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRemoveTarget(null)} disabled={removeSubmitting} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleRemove} disabled={removeSubmitting} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
            {removeSubmitting ? "Removing…" : "Remove community"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change owner dialog */}
      <Dialog open={!!changeOwnerTarget} onClose={closeChangeOwner} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Change community owner</DialogTitle>
        <DialogContent>
          {changeOwnerTarget && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Community
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {changeOwnerTarget.name}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Current owner
                </Typography>
                <Typography variant="body2">
                  {changeOwnerTarget.owner_name || changeOwnerTarget.owner_username?.replace(/^@/, "") || "(unnamed)"}
                  {changeOwnerTarget.owner_email ? ` · ${changeOwnerTarget.owner_email}` : ""}
                </Typography>
              </Box>
              <TextField
                autoFocus
                size="small"
                placeholder="Search users by email, username, or name"
                value={changeOwnerQuery}
                onChange={(e) => handleChangeOwnerQuery(e.target.value)}
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
              {changeOwnerQuery.trim() !== "" && (
                <Box
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1.5,
                    maxHeight: 260,
                    overflowY: "auto",
                  }}
                >
                  {changeOwnerSearching ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <CircularProgress size={20} />
                    </Box>
                  ) : changeOwnerResults.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      No matching users.
                    </Typography>
                  ) : (
                    changeOwnerResults.map((u) => {
                      const selected = changeOwnerPicked?.id === u.id;
                      const isCurrent = u.id === changeOwnerTarget.owner_user_id;
                      const disabled = isCurrent || u.is_suspended;
                      return (
                        <Box
                          key={u.id}
                          onClick={disabled ? undefined : () => setChangeOwnerPicked(u)}
                          sx={{
                            px: 1.5,
                            py: 1,
                            cursor: disabled ? "default" : "pointer",
                            bgcolor: selected ? "action.selected" : "transparent",
                            opacity: disabled ? 0.55 : 1,
                            borderBottom: "1px solid",
                            borderColor: "divider",
                            "&:last-child": { borderBottom: 0 },
                            "&:hover": disabled ? {} : { bgcolor: "action.hover" },
                          }}
                        >
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={600} noWrap>
                                {u.name || u.username?.replace(/^@/, "") || "(unnamed)"}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>
                                {u.email}
                                {u.username ? ` · @${u.username.replace(/^@/, "")}` : ""}
                              </Typography>
                            </Box>
                            {isCurrent && (
                              <Chip label="Current owner" size="small" variant="outlined" sx={{ ml: 1, fontSize: "0.6875rem" }} />
                            )}
                            {!isCurrent && u.is_suspended && (
                              <Chip label="Suspended" size="small" color="error" variant="outlined" sx={{ ml: 1, fontSize: "0.6875rem" }} />
                            )}
                          </Stack>
                        </Box>
                      );
                    })
                  )}
                </Box>
              )}
              {changeOwnerPicked && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    bgcolor: "action.hover",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    New owner
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {changeOwnerPicked.name || changeOwnerPicked.username?.replace(/^@/, "") || "(unnamed)"}
                    {changeOwnerPicked.email ? ` · ${changeOwnerPicked.email}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75, lineHeight: 1.5 }}>
                    The current owner will stay in the community as a regular member. The new owner will be added or reactivated if needed, and any pending join request they had will be withdrawn.
                  </Typography>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeChangeOwner} disabled={changeOwnerSubmitting} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmChangeOwner}
            disabled={changeOwnerSubmitting || !changeOwnerPicked}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            {changeOwnerSubmitting ? "Changing…" : "Change owner"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
