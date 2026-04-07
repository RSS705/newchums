"use client";

import { useCallback, useEffect, useState } from "react";
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
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import RestoreRoundedIcon from "@mui/icons-material/RestoreRounded";
import MergeRoundedIcon from "@mui/icons-material/MergeRounded";
import SearchIcon from "@mui/icons-material/Search";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import AppTextField from "@/components/ui/AppTextField";

type RoadmapRow = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  status: string;
  vote_count: number;
  comment_count: number;
  follower_count: number;
  is_removed: boolean;
  is_anonymous: boolean;
  is_private: boolean;
  merged_into_item_id: string | null;
  created_at: string;
  author_username: string;
  author_email: string;
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  needs_clarification: "Needs clarification",
  in_progress: "In progress",
  planned: "Planned",
  completed: "Completed",
  not_planned: "Not planned",
};

const STATUS_BG: Record<string, string> = {
  received: "#D4880F",
  needs_clarification: "#C67A12",
  in_progress: "#9C3587",
  planned: "#2E7D9B",
  completed: "#0E8A6D",
  not_planned: "grey.400",
};

const CATEGORY_LABELS: Record<string, string> = {
  feature_request: "Feature",
  bug: "Bug",
  general_feedback: "General",
};

const CATEGORY_LABELS_FULL: Record<string, string> = {
  feature_request: "Feature request",
  bug: "Bug / issue",
  general_feedback: "General feedback",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return "-"; }
}

export default function AdminRoadmapClient() {
  const toast = useToast();
  const [items, setItems] = useState<RoadmapRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [hideMerged, setHideMerged] = useState(true);

  const [statusDialogItem, setStatusDialogItem] = useState<RoadmapRow | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [mergeDialogItem, setMergeDialogItem] = useState<RoadmapRow | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [merging, setMerging] = useState(false);

  const [editDialogItem, setEditDialogItem] = useState<RoadmapRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const [commentsDialogItem, setCommentsDialogItem] = useState<RoadmapRow | null>(null);
  const [comments, setComments] = useState<{ id: string; body: string; author_username: string; created_at: string; is_removed: boolean }[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30", offset: String(offset) });
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await apiFetch(`/admin/roadmap?${params}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch { toast.error("Failed to load roadmap items"); }
    setLoading(false);
  }, [search, statusFilter, categoryFilter, offset]);

  useEffect(() => { setOffset(0); }, [search, statusFilter, categoryFilter]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleStatusUpdate = async () => {
    if (!statusDialogItem || !newStatus) return;
    setUpdatingStatus(true);
    try {
      const res = await apiFetch(`/admin/roadmap/${statusDialogItem.id}/status`, {
        auth: true, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, note: statusNote.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Status updated");
        setStatusDialogItem(null);
        setNewStatus("");
        setStatusNote("");
        fetchItems();
      } else {
        toast.error(data.message || "Failed to update status");
      }
    } catch { toast.error("Failed to update status"); }
    setUpdatingStatus(false);
  };

  const handleMerge = async () => {
    if (!mergeDialogItem || !mergeTargetId) return;
    setMerging(true);
    try {
      const res = await apiFetch(`/admin/roadmap/${mergeDialogItem.id}/merge`, {
        auth: true, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_item_id: mergeTargetId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Items merged");
        setMergeDialogItem(null);
        setMergeTargetId("");
        fetchItems();
      } else {
        toast.error(data.message || "Failed to merge");
      }
    } catch { toast.error("Failed to merge"); }
    setMerging(false);
  };

  const handleEdit = async () => {
    if (!editDialogItem || !editTitle.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`/admin/roadmap/${editDialogItem.id}/edit`, {
        auth: true, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          body: editBody.trim(),
          category: editCategory,
          is_private: editIsPrivate,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Item updated");
        setEditDialogItem(null);
        fetchItems();
      } else {
        toast.error(data.message || "Failed to update");
      }
    } catch { toast.error("Failed to update"); }
    setSaving(false);
  };

  const handleRemove = async (item: RoadmapRow) => {
    try {
      const res = await apiFetch(`/admin/roadmap/${item.id}/remove`, { auth: true, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.ok) { toast.success("Item removed"); fetchItems(); }
      else toast.error("Failed to remove");
    } catch { toast.error("Failed to remove"); }
  };

  const handleRestore = async (item: RoadmapRow) => {
    try {
      const res = await apiFetch(`/admin/roadmap/${item.id}/restore`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) { toast.success("Item restored"); fetchItems(); }
      else toast.error("Failed to restore");
    } catch { toast.error("Failed to restore"); }
  };

  const openComments = async (item: RoadmapRow) => {
    setCommentsDialogItem(item);
    setLoadingComments(true);
    try {
      const res = await apiFetch(`/roadmap/${item.id}`, { auth: true });
      const data = await res.json();
      if (data.ok) setComments(data.comments ?? []);
    } catch { /* noop */ }
    setLoadingComments(false);
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      const res = await apiFetch(`/admin/roadmap/comments/${commentId}`, { auth: true, method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        toast.success("Comment removed");
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch { toast.error("Failed to remove comment"); }
  };

  const mergeTargets = items.filter((i) => i.id !== mergeDialogItem?.id && !i.is_removed && !i.merged_into_item_id);

  const displayItems = hideMerged ? items.filter((i) => !i.merged_into_item_id) : items;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography
          component="h1"
          sx={{ mb: 0.5, lineHeight: 1.25, fontSize: { xs: "1.75rem", sm: "2rem" }, letterSpacing: "-0.02em", fontWeight: 700 }}
        >
          Roadmap
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
          Community feedback and feature requests. Moderate, update statuses, and merge duplicates.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search by title or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
          displayEmpty
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <MenuItem key={val} value={val}>{label}</MenuItem>
          ))}
        </Select>
        <Select
          size="small"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          displayEmpty
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="">All categories</MenuItem>
          {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
            <MenuItem key={val} value={val}>{label}</MenuItem>
          ))}
        </Select>
        <FormControlLabel
          control={<Switch size="small" checked={hideMerged} onChange={(e) => setHideMerged(e.target.checked)} />}
          label={<Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>Hide merged</Typography>}
          sx={{ ml: 0.5 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {displayItems.length} of {total} item{total !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : displayItems.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="body1" color="text.secondary">
            {search ? "No items match your search." : "No roadmap items found."}
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", bgcolor: "grey.50" } }}>
                <TableCell>Title</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Category</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Privacy</TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }} align="center">Votes</TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }} align="center">Comments</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Author</TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Date</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayItems.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  sx={{
                    opacity: item.is_removed ? 0.5 : 1,
                    bgcolor: item.merged_into_item_id ? "action.hover" : "inherit",
                    "&:last-child td": { borderBottom: 0 },
                  }}
                >
                  <TableCell sx={{ maxWidth: 250 }}>
                    <NextLink href={`/roadmap/${item.id}`} target="_blank" style={{ color: "inherit", textDecoration: "none" }}>
                      <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                        {item.title}
                      </Typography>
                    </NextLink>
                    {item.is_removed && <Chip label="Removed" size="small" color="error" sx={{ fontSize: "0.625rem", height: 18, mt: 0.25, ml: 0.5 }} />}
                    {item.merged_into_item_id && <Chip label="Merged" size="small" sx={{ fontSize: "0.625rem", height: 18, mt: 0.25, ml: 0.5 }} />}
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Typography variant="caption">{CATEGORY_LABELS[item.category] ?? item.category}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABELS[item.status] ?? item.status}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.6875rem",
                        bgcolor: STATUS_BG[item.status] ?? "grey.400",
                        color: item.status === "not_planned" ? "text.secondary" : "#fff",
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {item.is_private ? (
                      <Tooltip title="Only the author and super admins can see this idea">
                        <Chip
                          label="Private"
                          size="small"
                          color="warning"
                          sx={{ fontWeight: 600, fontSize: "0.6875rem" }}
                        />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">Public</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{ display: { xs: "none", sm: "table-cell" }, fontSize: "0.8125rem" }}>{item.vote_count}</TableCell>
                  <TableCell align="center" sx={{ display: { xs: "none", sm: "table-cell" }, fontSize: "0.8125rem" }}>
                    <Typography
                      variant="body2"
                      component="span"
                      onClick={() => openComments(item)}
                      sx={{ cursor: "pointer", color: "text.secondary", "&:hover": { color: "primary.main", textDecoration: "underline" } }}
                    >
                      {item.comment_count}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="body2" noWrap>@{item.author_username}</Typography>
                      {item.is_anonymous && (
                        <Chip label="Anon" size="small" variant="outlined" sx={{ fontSize: "0.625rem", height: 18, fontWeight: 600 }} />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.disabled" noWrap>{item.author_email}</Typography>
                  </TableCell>
                  <TableCell sx={{ display: { xs: "none", md: "table-cell" }, whiteSpace: "nowrap", fontSize: "0.8125rem" }}>
                    {formatDate(item.created_at)}
                  </TableCell>
                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="Update status">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setStatusDialogItem(item);
                            setNewStatus(item.status);
                            setStatusNote("");
                          }}
                        >
                          <TuneRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit title, description, category, or privacy">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setEditDialogItem(item);
                            setEditTitle(item.title);
                            setEditBody(item.body ?? "");
                            setEditCategory(item.category);
                            setEditIsPrivate(item.is_private === true);
                          }}
                        >
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!item.merged_into_item_id && !item.is_removed && (
                        <Tooltip title="Merge into another item">
                          <IconButton
                            size="small"
                            onClick={() => { setMergeDialogItem(item); setMergeTargetId(""); }}
                          >
                            <MergeRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {item.is_removed ? (
                        <Tooltip title="Restore">
                          <IconButton size="small" onClick={() => handleRestore(item)}>
                            <RestoreRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Remove">
                          <IconButton size="small" color="error" onClick={() => handleRemove(item)}>
                            <DeleteOutlineRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Pagination */}
      {!loading && total > 30 && (
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
          <Button size="small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 30))} sx={{ textTransform: "none" }}>
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
            {offset + 1}&ndash;{Math.min(offset + 30, total)} of {total}
          </Typography>
          <Button size="small" disabled={offset + 30 >= total} onClick={() => setOffset((o) => o + 30)} sx={{ textTransform: "none" }}>
            Next
          </Button>
        </Stack>
      )}

      {/* Status update dialog */}
      <Dialog open={!!statusDialogItem} onClose={() => setStatusDialogItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Update status</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Updating: <strong>{statusDialogItem?.title}</strong>
          </Typography>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
            New status
          </Typography>
          <Select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <MenuItem key={val} value={val}>{label}</MenuItem>
            ))}
          </Select>
          <AppTextField
            label="Public note (optional)"
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Explain the status change to users..."
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setStatusDialogItem(null)} disabled={updatingStatus}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleStatusUpdate}
            disabled={updatingStatus || !newStatus}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none" }}
          >
            {updatingStatus ? <CircularProgress size={20} /> : "Update status"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editDialogItem} onClose={() => setEditDialogItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit idea</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75, mt: 0.5 }}>
            Category
          </Typography>
          <Select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          >
            {Object.entries(CATEGORY_LABELS_FULL).map(([val, label]) => (
              <MenuItem key={val} value={val}>{label}</MenuItem>
            ))}
          </Select>
          <AppTextField
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            fullWidth
            inputProps={{ maxLength: 200 }}
            sx={{ mb: 2 }}
          />
          <AppTextField
            label="Description"
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            inputProps={{ maxLength: 5000 }}
          />
          <Box sx={{ mt: 2, p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "grey.50" }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={editIsPrivate}
                  onChange={(e) => setEditIsPrivate(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" fontWeight={600}>
                  Keep idea private
                </Typography>
              }
              sx={{ alignItems: "center", gap: 0.5, m: 0 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, lineHeight: 1.5 }}>
              When on, only the original author and super admins can see this idea, regardless of its status.
              Use this to keep ideas containing personal information out of public view while still progressing
              them through the workflow.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialogItem(null)} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleEdit}
            disabled={saving || !editTitle.trim()}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none" }}
          >
            {saving ? <CircularProgress size={20} /> : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={!!mergeDialogItem} onClose={() => setMergeDialogItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Merge into another item</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Merging: <strong>{mergeDialogItem?.title}</strong>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
            Votes, follows, and followers will transfer to the target item. Comments stay on this item but it will show a &ldquo;merged&rdquo; banner. This cannot be easily undone.
          </Typography>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.75 }}>
            Merge into
          </Typography>
          <Select
            value={mergeTargetId}
            onChange={(e) => setMergeTargetId(e.target.value)}
            displayEmpty
            fullWidth
            size="small"
            MenuProps={{ PaperProps: { sx: { maxHeight: 300 } } }}
          >
            <MenuItem value="" disabled>
              <Typography variant="body2" color="text.disabled">Select a target idea...</Typography>
            </MenuItem>
            {mergeTargets.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{t.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t.vote_count} votes &middot; @{t.author_username} &middot; {formatDate(t.created_at)}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setMergeDialogItem(null)} disabled={merging}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleMerge}
            disabled={merging || !mergeTargetId}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none" }}
          >
            {merging ? <CircularProgress size={20} /> : "Merge"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Comments dialog */}
      <Dialog open={!!commentsDialogItem} onClose={() => setCommentsDialogItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Comments, {commentsDialogItem?.title}
        </DialogTitle>
        <DialogContent>
          {loadingComments ? (
            <Box sx={{ textAlign: "center", py: 3 }}><CircularProgress size={24} /></Box>
          ) : comments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No comments</Typography>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {comments.map((comment) => (
                <Box key={comment.id} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, opacity: comment.is_removed ? 0.4 : 1 }}>
                  <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{comment.body}</Typography>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.75 }}>
                    <Typography variant="caption" color="text.disabled">
                      @{comment.author_username} &middot; {formatDate(comment.created_at)}
                    </Typography>
                    {!comment.is_removed && (
                      <Tooltip title="Remove comment">
                        <IconButton size="small" color="error" onClick={() => handleDeleteComment(comment.id)}>
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCommentsDialogItem(null)} sx={{ textTransform: "none" }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
