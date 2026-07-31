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
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import SearchIcon from "@mui/icons-material/Search";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import DeleteForeverRoundedIcon from "@mui/icons-material/DeleteForeverRounded";
import AdminHardDeleteDialog from "@/components/admin/AdminHardDeleteDialog";
import NextLink from "next/link";
import { AppButton, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type SubscriptionPlan = "free" | "super_host" | "community_pro";

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: "Free",
  super_host: "Super Host",
  community_pro: "Community Pro",
};

type UserRow = {
  id: string;
  created_at: string | null;
  last_active_at: string | null;
  email: string;
  username: string | null;
  name: string | null;
  role: string | null;
  subscription_plan: SubscriptionPlan;
  is_suspended: boolean;
  suspended_at: string | null;
  email_verified_at: string | null;
  password_setup_pending: boolean;
  has_password: boolean;
  rsvp_count: number;
  hosted_count: number;
};

type SortField = "created_at" | "username" | "name" | "email";
type SortDir = "asc" | "desc";

type SetupStatus =
  | "suspended"
  | "email_unverified"
  | "password_pending"
  | "no_plan_activity"
  | "active";

type SetupStatusInfo = {
  key: SetupStatus;
  label: string;
  tooltip: string;
  color: "default" | "primary" | "success" | "error" | "warning" | "info";
  variant: "filled" | "outlined";
};

function deriveSetupStatus(row: UserRow): SetupStatusInfo {
  if (row.is_suspended) {
    return {
      key: "suspended",
      label: "Suspended",
      tooltip: "Account is suspended. Login is blocked.",
      color: "error",
      variant: "outlined",
    };
  }
  if (!row.email_verified_at) {
    return {
      key: "email_unverified",
      label: "Email unverified",
      tooltip:
        "User submitted their email but never clicked the magic link. Likely dropped off before verification.",
      color: "error",
      variant: "filled",
    };
  }
  if (row.password_setup_pending) {
    return {
      key: "password_pending",
      label: "Password setup pending",
      tooltip:
        "Lightweight plan signup completed verification but has not set a password yet.",
      color: "warning",
      variant: "filled",
    };
  }
  if (row.rsvp_count === 0 && row.hosted_count === 0) {
    return {
      key: "no_plan_activity",
      label: "No plan activity",
      tooltip:
        "Verified account with no RSVPs and no hosted plans. May have signed up from a share or invite link without RSVPing.",
      color: "default",
      variant: "filled",
    };
  }
  return {
    key: "active",
    label: "Active",
    tooltip: "Verified, password set, and has plan activity.",
    color: "success",
    variant: "filled",
  };
}

function formatPlanActivity(row: UserRow): string {
  const total = row.rsvp_count + row.hosted_count;
  if (total === 0) return "No plan activity";
  const parts: string[] = [];
  if (row.rsvp_count > 0) {
    parts.push(`${row.rsvp_count} RSVP${row.rsvp_count === 1 ? "" : "s"}`);
  }
  if (row.hosted_count > 0) {
    parts.push(`${row.hosted_count} hosted`);
  }
  return parts.join(" · ");
}

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

  // Track which user is currently having their plan changed (for loading state)
  const [planUpdatingId, setPlanUpdatingId] = useState<string | null>(null);

  // Track which user is currently having their role toggled.
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [hardDeleteTarget, setHardDeleteTarget] = useState<UserRow | null>(null);

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

  async function handlePlanChange(userId: string, newPlan: SubscriptionPlan) {
    setPlanUpdatingId(userId);
    try {
      const res = await apiFetch(`/admin/users/${userId}/subscription-plan`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      const data = await res.json();
      if (data.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === userId ? { ...r, subscription_plan: newPlan } : r)),
        );
        if (data.changed) {
          toast.success(`Plan updated to ${PLAN_LABELS[newPlan]}`);
        }
      } else {
        toast.error(data.error?.message ?? "Failed to update plan");
      }
    } catch {
      toast.error("Failed to update plan");
    } finally {
      setPlanUpdatingId(null);
    }
  }

  async function handleAdminToggle(row: UserRow, makeAdmin: boolean) {
    setRoleUpdatingId(row.id);
    const nextRole = makeAdmin ? "super_admin" : null;
    try {
      const res = await apiFetch(`/admin/users/${row.id}/role`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const data = await res.json();
      if (data.ok) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, role: nextRole } : r)),
        );
        if (data.changed) {
          toast.success(
            makeAdmin
              ? `${row.username ?? row.email} is now a Super Admin`
              : `${row.username ?? row.email} is no longer a Super Admin`,
          );
        }
      } else {
        const code = data.error?.code ?? data.error;
        if (code === "CANNOT_DEMOTE_SELF") {
          toast.error("You can't remove your own Super Admin role");
        } else {
          toast.error("Failed to update role");
        }
      }
    } catch {
      toast.error("Failed to update role");
    } finally {
      setRoleUpdatingId(null);
    }
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
          View all registered users, search by email, handle, or name, and manage accounts and subscription plans.
        </Typography>
      </Box>

      {/* Search */}
      <TextField
        size="small"
        placeholder="Search by email, handle, or name..."
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
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }}>Plan</TableCell>
                <TableCell sx={{ fontWeight: 600, display: { xs: "none", md: "table-cell" } }} align="center">Admin</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 5 }}>
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
                        Last active: {formatDate(row.last_active_at)}
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
                          -
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      <Typography variant="body2">
                        {row.name ?? "-"}
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
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                      <Select
                        size="small"
                        value={row.subscription_plan ?? "free"}
                        disabled={planUpdatingId === row.id}
                        onChange={(e) => handlePlanChange(row.id, e.target.value as SubscriptionPlan)}
                        sx={{ fontSize: "0.8125rem", minWidth: 130 }}
                      >
                        <MenuItem value="free">Free</MenuItem>
                        <MenuItem value="super_host">Super Host</MenuItem>
                        <MenuItem value="community_pro">Community Pro</MenuItem>
                      </Select>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", md: "table-cell" } }} align="center">
                      <Tooltip title={row.role === "super_admin" ? "Remove Super Admin role" : "Grant Super Admin role"}>
                        <span>
                          <Switch
                            size="small"
                            checked={row.role === "super_admin"}
                            disabled={roleUpdatingId === row.id}
                            onChange={(e) => handleAdminToggle(row, e.target.checked)}
                            inputProps={{ "aria-label": `Toggle Super Admin for ${row.username ?? row.email}` }}
                          />
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const status = deriveSetupStatus(row);
                        const activity = formatPlanActivity(row);
                        const noActivity = row.rsvp_count + row.hosted_count === 0;
                        return (
                          <Stack spacing={0.25} alignItems="flex-start">
                            <Tooltip title={status.tooltip} placement="top">
                              <Chip
                                label={status.label}
                                size="small"
                                color={status.color}
                                variant={status.variant}
                                sx={{ fontSize: "0.75rem" }}
                              />
                            </Tooltip>
                            <Typography
                              variant="caption"
                              color={noActivity ? "text.disabled" : "text.secondary"}
                            >
                              {activity}
                            </Typography>
                          </Stack>
                        );
                      })()}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Tooltip title="Open user diagnostics">
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
                        <Tooltip title={row.role === "super_admin" ? "Super admins cannot be hard-deleted" : "Hard delete (test-data cleanup, no notifications)"}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              disabled={row.role === "super_admin"}
                              onClick={() => setHardDeleteTarget(row)}
                            >
                              <DeleteForeverRoundedIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
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
    <AdminHardDeleteDialog
      open={!!hardDeleteTarget}
      subjectType="user"
      subjectId={hardDeleteTarget?.id ?? null}
      subjectLabel={hardDeleteTarget?.username ?? hardDeleteTarget?.email ?? undefined}
      onClose={() => setHardDeleteTarget(null)}
      onDeleted={() => {
        setRows((prev) => prev.filter((u) => u.id !== hardDeleteTarget?.id));
      }}
    />
    </Stack>
  );
}
