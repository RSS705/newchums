"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
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
import CallMergeIcon from "@mui/icons-material/CallMerge";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import RestoreIcon from "@mui/icons-material/Restore";
import SearchIcon from "@mui/icons-material/Search";
import { AppButton, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type InterestRow = {
  id: string;
  name: string;
  slug: string;
  category: string;
  created_at: string | null;
  is_deleted: boolean;
  created_by_user_id: string | null;
  username: string | null;
};

type SortField = "name" | "created_at";
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

export default function AdminInterestsClient() {
  const [rows, setRows] = useState<InterestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Edit dialog
  const [editRow, setEditRow] = useState<InterestRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete dialog
  const [deleteRow, setDeleteRow] = useState<InterestRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Restore
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Merge dialog
  const [mergeSource, setMergeSource] = useState<InterestRow | null>(null);
  const [mergeTarget, setMergeTarget] = useState<InterestRow | null>(null);
  const [mergeSubmitting, setMergeSubmitting] = useState(false);

  const toast = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchInterests = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await apiFetch(`/admin/interests${qs}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        setRows(data.interests ?? []);
      } else {
        toast.error("Failed to load interests");
      }
    } catch {
      toast.error("Failed to load interests");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInterests(debouncedSearch);
  }, [debouncedSearch, fetchInterests]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (sortBy === "name") {
        const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        return sortDir === "asc" ? cmp : -cmp;
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortDir === "asc" ? aTime - bTime : bTime - aTime;
    });
  }, [rows, sortBy, sortDir]);

  function handleSortClick(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  }

  function openEdit(row: InterestRow) {
    setEditRow(row);
    setEditName(row.name);
    setEditCategory(row.category ?? "");
  }

  function closeEdit() {
    setEditRow(null);
    setEditName("");
    setEditCategory("");
  }

  async function handleEditSave() {
    if (!editRow) return;
    if (!editName.trim()) {
      toast.error("Name cannot be empty");
      return;
    }
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/admin/interests/${editRow.id}`, {
        auth: true,
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), category: editCategory.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === editRow.id
              ? { ...r, name: editName.trim(), category: editCategory.trim() }
              : r,
          ),
        );
        toast.success("Interest updated");
        closeEdit();
      } else {
        toast.error(data.error?.message ?? "Failed to update interest");
      }
    } catch {
      toast.error("Failed to update interest");
    } finally {
      setEditSubmitting(false);
    }
  }

  function openDelete(row: InterestRow) {
    setDeleteRow(row);
  }

  function closeDelete() {
    setDeleteRow(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteRow) return;
    setDeleteSubmitting(true);
    try {
      const res = await apiFetch(`/admin/interests/${deleteRow.id}`, {
        auth: true,
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === deleteRow.id ? { ...r, is_deleted: true } : r,
          ),
        );
        toast.success(`"${deleteRow.name}" has been deleted`);
        closeDelete();
      } else {
        const msg = data.error?.code === "ALREADY_DELETED"
          ? "This interest is already deleted"
          : "Failed to delete interest";
        toast.error(msg);
      }
    } catch {
      toast.error("Failed to delete interest");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleRestore(row: InterestRow) {
    setRestoringId(row.id);
    try {
      const res = await apiFetch(`/admin/interests/${row.id}/restore`, {
        auth: true,
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, is_deleted: false } : r));
        toast.success(`"${row.name}" restored`);
      } else {
        toast.error(data.error?.message ?? "Failed to restore");
      }
    } catch {
      toast.error("Failed to restore");
    } finally {
      setRestoringId(null);
    }
  }

  function openMerge(row: InterestRow) {
    setMergeSource(row);
    setMergeTarget(null);
  }

  function closeMerge() {
    setMergeSource(null);
    setMergeTarget(null);
  }

  async function handleMergeConfirm() {
    if (!mergeSource || !mergeTarget) return;
    setMergeSubmitting(true);
    try {
      const res = await apiFetch("/admin/interests/merge", {
        auth: true,
        method: "POST",
        body: JSON.stringify({
          sourceInterestId: mergeSource.id,
          targetInterestId: mergeTarget.id,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const { movedCount, dedupedCount, eventsMovedCount, eventsDedupedCount } = data as {
          movedCount: number;
          dedupedCount: number;
          eventsMovedCount: number;
          eventsDedupedCount: number;
        };
        const userPart =
          `${movedCount} user${movedCount !== 1 ? "s" : ""} moved` +
          (dedupedCount > 0 ? `, ${dedupedCount} deduplicated` : "");
        const eventTotal = eventsMovedCount + eventsDedupedCount;
        const eventPart = eventTotal > 0
          ? ` · ${eventTotal} plan${eventTotal !== 1 ? "s" : ""} updated`
          : "";
        toast.success(
          `Merged "${mergeSource.name}" into "${mergeTarget.name}". ${userPart}${eventPart}.`,
        );
        // Mark source as deleted in local state and refresh
        setRows((prev) =>
          prev.map((r) => (r.id === mergeSource.id ? { ...r, is_deleted: true } : r)),
        );
        closeMerge();
      } else {
        toast.error(data.error?.message ?? "Merge failed");
      }
    } catch {
      toast.error("Merge failed");
    } finally {
      setMergeSubmitting(false);
    }
  }

  // Active interests available as merge targets (exclude deleted and the source itself)
  const mergeTargetOptions = useMemo(
    () => rows.filter((r) => !r.is_deleted && r.id !== mergeSource?.id),
    [rows, mergeSource],
  );

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Interests
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Review, edit, and remove user-submitted hobbies. Deleting an interest removes it from
          the hobby selector and disconnects all users. Merge first if you want to preserve connections.
        </Typography>
      </Box>

      {/* Search bar */}
      <TextField
        size="small"
        placeholder="Search by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ maxWidth: 340 }}
      />

      {/* Table */}
      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  backgroundColor: (theme) =>
                    theme.palette.mode === "light" ? "grey.50" : "grey.900",
                }}
              >
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === "name"}
                    direction={sortBy === "name" ? sortDir : "asc"}
                    onClick={() => handleSortClick("name")}
                  >
                    Interest
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }}>Slug</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", sm: "table-cell" } }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === "created_at"}
                    direction={sortBy === "created_at" ? sortDir : "asc"}
                    onClick={() => handleSortClick("created_at")}
                  >
                    Created
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }}>Added By</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {debouncedSearch ? "No interests match your search." : "No interests found."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow
                    key={row.id}
                    sx={{
                      opacity: row.is_deleted ? 0.5 : 1,
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {row.name}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}
                      >
                        {row.slug}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      <Typography variant="body2" color="text.secondary">
                        {row.category || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(row.created_at)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Typography variant="body2" color="text.secondary">
                        {row.username ?? (row.created_by_user_id ? "Unknown" : "System")}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.is_deleted ? "Deleted" : "Active"}
                        size="small"
                        color={row.is_deleted ? "default" : "success"}
                        variant={row.is_deleted ? "outlined" : "filled"}
                        sx={{ fontSize: "0.75rem" }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {row.is_deleted ? (
                          <Tooltip title="Restore">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleRestore(row)}
                              disabled={restoringId === row.id}
                            >
                              {restoringId === row.id
                                ? <CircularProgress size={16} />
                                : <RestoreIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <>
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openEdit(row)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Merge into another">
                              <IconButton size="small" onClick={() => openMerge(row)}>
                                <CallMergeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => openDelete(row)}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && sorted.length > 0 && (
          <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary">
              {sorted.length} {sorted.length === 1 ? "interest" : "interests"}
              {debouncedSearch ? " matching" : " total"}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Edit dialog */}
      <Dialog open={Boolean(editRow)} onClose={closeEdit} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Interest</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <AppTextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              autoFocus
            />
            <AppTextField
              label="Category"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              fullWidth
              placeholder="Leave blank if none"
            />
            {editRow && (
              <Typography variant="caption" color="text.secondary">
                Slug: <code>{editRow.slug}</code> (not changed)
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeEdit} disabled={editSubmitting}>
            Cancel
          </Button>
          <AppButton
            variant="contained"
            onClick={handleEditSave}
            disabled={editSubmitting}
            startIcon={editSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Save
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={Boolean(deleteRow)} onClose={closeDelete} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Interest</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Are you sure you want to delete{" "}
            <strong>&ldquo;{deleteRow?.name}&rdquo;</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            It will be hidden from the hobby selector and removed from all users&apos; profiles.
            Use Merge first if you want to preserve those connections.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDelete} disabled={deleteSubmitting}>
            Cancel
          </Button>
          <AppButton
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            disabled={deleteSubmitting}
            startIcon={deleteSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            Delete
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={Boolean(mergeSource)} onClose={closeMerge} maxWidth="sm" fullWidth>
        <DialogTitle>Merge Interest</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                Source (will be deleted)
              </Typography>
              <Typography variant="body1" fontWeight={600}>
                {mergeSource?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                {mergeSource?.slug}
              </Typography>
            </Box>

            <Box>
              <Typography
                component="label"
                variant="subtitle1"
                fontWeight={600}
                sx={{ display: "block", mb: 0.625 }}
              >
                Merge into (target)
              </Typography>
              <Autocomplete
                options={mergeTargetOptions}
                getOptionLabel={(opt) => opt.name}
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
                value={mergeTarget}
                onChange={(_, val) => setMergeTarget(val)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={undefined}
                    placeholder="Search active interests…"
                    size="small"
                    fullWidth
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Stack direction="column" spacing={0}>
                      <Typography variant="body2">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                        {option.slug}
                      </Typography>
                    </Stack>
                  </Box>
                )}
                noOptionsText="No active interests found"
              />
            </Box>

            {mergeTarget && (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: "warning.50",
                  border: "1px solid",
                  borderColor: "warning.200",
                }}
              >
                <Typography variant="body2">
                  All users and plans tagged with <strong>{mergeSource?.name}</strong> will be
                  moved to <strong>{mergeTarget.name}</strong>. Any that already have both will be
                  deduplicated. <strong>{mergeSource?.name}</strong> will then be marked as deleted.
                </Typography>
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeMerge} disabled={mergeSubmitting}>
            Cancel
          </Button>
          <AppButton
            variant="contained"
            onClick={handleMergeConfirm}
            disabled={mergeSubmitting || !mergeTarget}
            startIcon={mergeSubmitting ? <CircularProgress size={16} color="inherit" /> : <CallMergeIcon />}
          >
            Merge
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
