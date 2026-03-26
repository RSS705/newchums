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
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
  member_count: number;
  plan_count: number;
  created_at: string;
};

type SortField = "created_at" | "name" | "member_count" | "plan_count";
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
                <TableCell>
                  <TableSortLabel active={sortField === "created_at"} direction={sortField === "created_at" ? sortDir : "desc"} onClick={() => handleSort("created_at")}>
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel active={sortField === "name"} direction={sortField === "name" ? sortDir : "asc"} onClick={() => handleSort("name")}>
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Visibility</TableCell>
                <TableCell>Join mode</TableCell>
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
                <TableCell>Owner</TableCell>
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
                  <TableCell sx={{ whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                    {formatDate(c.created_at)}
                  </TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <NextLink href={`/communities/${c.slug}`} style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                        {c.name}
                      </Typography>
                    </NextLink>
                  </TableCell>
                  <TableCell>
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
                  <TableCell>
                    {c.visibility === "private" ? (
                      <Chip icon={<LockRoundedIcon sx={{ fontSize: "12px !important" }} />} label="Private" size="small" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                    ) : (
                      <Chip label="Public" size="small" variant="outlined" sx={{ fontSize: "0.6875rem" }} />
                    )}
                  </TableCell>
                  <TableCell>
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
                  <TableCell sx={{ fontSize: "0.8125rem" }}>
                    <Box>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>
                        {c.owner_name || c.owner_username?.replace(/^@/, "") || "—"}
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
    </Stack>
  );
}
