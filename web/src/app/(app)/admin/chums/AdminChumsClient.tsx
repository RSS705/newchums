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
import Link from "@mui/material/Link";
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
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import NextLink from "next/link";
import { AppButton, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type UserRow = {
  id: string;
  created_at: string | null;
  last_active_at: string | null;
  email: string;
  username: string | null;
  name: string | null;
  role: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
};

type SortField = "created_at" | "username" | "name" | "email";
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

export default function AdminChumsClient() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Suspend / unsuspend dialog
  const [confirmRow, setConfirmRow] = useState<UserRow | null>(null);
  const [confirmAction, setConfirmAction] = useState<"suspend" | "unsuspend">("suspend");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const toast = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const fetchUsers = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      const res = await apiFetch(`/admin/users${qs}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        setRows(data.users ?? []);
      } else {
        toast.error("Failed to load users");
      }
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsers(debouncedSearch);
  }, [debouncedSearch, fetchUsers]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortBy === "created_at") {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        cmp = aTime - bTime;
      } else if (sortBy === "username") {
        cmp = (a.username ?? "").localeCompare(b.username ?? "", undefined, { sensitivity: "base" });
      } else if (sortBy === "name") {
        cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" });
      } else if (sortBy === "email") {
        cmp = a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortBy, sortDir]);

  function handleSortClick(field: SortField) {
    if (sortBy === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir(field === "created_at" ? "desc" : "asc");
    }
  }

  function openConfirm(row: UserRow, action: "suspend" | "unsuspend") {
    setConfirmRow(row);
    setConfirmAction(action);
  }

  function closeConfirm() {
    setConfirmRow(null);
  }

  async function handleActionConfirm() {
    if (!confirmRow) return;
    setActionSubmitting(true);
    const endpoint = confirmAction === "suspend"
      ? `/admin/users/${confirmRow.id}/suspend`
      : `/admin/users/${confirmRow.id}/unsuspend`;
    try {
      const res = await apiFetch(endpoint, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const isSuspend = confirmAction === "suspend";
        setRows((prev) =>
          prev.map((r) =>
            r.id === confirmRow.id
              ? { ...r, is_suspended: isSuspend, suspended_at: isSuspend ? new Date().toISOString() : null }
              : r,
          ),
        );
        toast.success(
          isSuspend
            ? `${confirmRow.username ?? confirmRow.email} suspended`
            : `${confirmRow.username ?? confirmRow.email} unsuspended`,
        );
        closeConfirm();
      } else {
        const code = data.error?.code ?? data.error;
        if (code === "ALREADY_SUSPENDED") toast.error("User is already suspended");
        else if (code === "NOT_SUSPENDED") toast.error("User is not currently suspended");
        else if (code === "CANNOT_SUSPEND_SELF") toast.error("You cannot suspend your own account");
        else toast.error("Action failed");
      }
    } catch {
      toast.error("Action failed");
    } finally {
      setActionSubmitting(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          Users
        </Typography>
        <Typography variant="body2" color="text.secondary">
          View all registered users, search by email, handle, or name, and suspend or unsuspend accounts.
        </Typography>
      </Box>

      {/* Search */}
      <TextField
        size="small"
        placeholder="Search by email, handle, or name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
        sx={{ maxWidth: 400 }}
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
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel
                    active={sortBy === "created_at"}
                    direction={sortBy === "created_at" ? sortDir : "desc"}
                    onClick={() => handleSortClick("created_at")}
                  >
                    Joined
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>
                  <TableSortLabel
                    active={sortBy === "username"}
                    direction={sortBy === "username" ? sortDir : "asc"}
                    onClick={() => handleSortClick("username")}
                  >
                    Handle
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", sm: "table-cell" } }}>
                  <TableSortLabel
                    active={sortBy === "name"}
                    direction={sortBy === "name" ? sortDir : "asc"}
                    onClick={() => handleSortClick("name")}
                  >
                    Name
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel
                    active={sortBy === "email"}
                    direction={sortBy === "email" ? sortDir : "asc"}
                    onClick={() => handleSortClick("email")}
                  >
                    Email
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {debouncedSearch ? "No users match your search." : "No users found."}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <TableRow
                    key={row.id}
                    sx={{
                      opacity: row.is_suspended ? 0.65 : 1,
                      "&:hover": { backgroundColor: "action.hover" },
                    }}
                  >
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(row.created_at)}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        Last login: {formatDate(row.last_active_at)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.username ? (
                        <Link
                          href={`/u/${row.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          underline="hover"
                          variant="body2"
                          fontWeight={500}
                          sx={{ color: "text.primary" }}
                        >
                          @{row.username}
                        </Link>
                      ) : (
                        <Typography variant="body2" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      <Typography variant="body2">
                        {row.name ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}
                      >
                        {row.email}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={row.is_suspended ? "Suspended" : "Active"}
                        size="small"
                        color={row.is_suspended ? "error" : "success"}
                        variant={row.is_suspended ? "outlined" : "filled"}
                        sx={{ fontSize: "0.75rem" }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Inspect user metrics">
                          <IconButton
                            size="small"
                            component={NextLink}
                            href={`/admin/chums/${row.id}`}
                          >
                            <VisibilityRoundedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {row.is_suspended ? (
                          <Tooltip title="Unsuspend account">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => openConfirm(row, "unsuspend")}
                            >
                              <CheckCircleOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Suspend account">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => openConfirm(row, "suspend")}
                            >
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
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
              {sorted.length} {sorted.length === 1 ? "user" : "users"}
              {debouncedSearch ? " matching" : " total"}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Confirm dialog */}
      <Dialog open={Boolean(confirmRow)} onClose={closeConfirm} maxWidth="xs" fullWidth>
        <DialogTitle>
          {confirmAction === "suspend" ? "Suspend Account" : "Unsuspend Account"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            {confirmAction === "suspend" ? (
              <>
                Are you sure you want to suspend{" "}
                <strong>{confirmRow?.username ? `@${confirmRow.username}` : confirmRow?.email}</strong>?
              </>
            ) : (
              <>
                Are you sure you want to unsuspend{" "}
                <strong>{confirmRow?.username ? `@${confirmRow.username}` : confirmRow?.email}</strong>?
              </>
            )}
          </Typography>
          {confirmAction === "suspend" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              The user will be unable to log in, access the API, or sign up again with this email.
            </Typography>
          )}
          {confirmAction === "unsuspend" && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              The user will be able to log in and access their account again.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeConfirm} disabled={actionSubmitting}>
            Cancel
          </Button>
          <AppButton
            variant="contained"
            color={confirmAction === "suspend" ? "error" : "success"}
            onClick={handleActionConfirm}
            disabled={actionSubmitting}
            startIcon={actionSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {confirmAction === "suspend" ? "Suspend" : "Unsuspend"}
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
