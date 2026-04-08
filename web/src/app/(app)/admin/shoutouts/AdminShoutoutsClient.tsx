"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
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
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchIcon from "@mui/icons-material/Search";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type ShoutoutRow = {
  id: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
  plan: { id: string; title: string; startsAt: string };
  sender: { userId: string; displayName: string; username: string | null };
  recipient: { userId: string; displayName: string; username: string | null };
  reviewer: { userId: string; displayName: string } | null;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "-";
  }
}

function profileHref(username: string | null): string | null {
  if (!username) return null;
  return `/u/${username.replace(/^@/, "")}`;
}

const PAGE_SIZE = 30;

export default function AdminShoutoutsClient() {
  const toast = useToast();
  const [items, setItems] = useState<ShoutoutRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
        status: statusFilter,
      });
      if (search.trim()) params.set("q", search.trim());
      const res = await apiFetch(`/admin/shoutouts?${params}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        setItems(data.items);
        setTotal(data.total);
      }
    } catch {
      toast.error("Failed to load shout-outs");
    }
    setLoading(false);
  }, [search, statusFilter, offset, toast]);

  useEffect(() => { setOffset(0); }, [search, statusFilter]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    setActingId(id);
    // Optimistic flip — keep the row visible if the user is on a status filter
    // that no longer matches it, so they can see the result of the action
    // before it disappears on the next fetch.
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
    try {
      const res = await apiFetch(`/admin/shoutouts/${id}/status`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!data.ok) {
        toast.error(data.message || "Failed to update shout-out");
        // Revert optimistic flip
        await fetchItems();
      } else {
        toast.success(status === "approved" ? "Shout-out approved" : "Shout-out rejected");
      }
    } catch {
      toast.error("Failed to update shout-out");
      await fetchItems();
    } finally {
      setActingId(null);
    }
  };

  const truncate = (s: string, n = 80): string =>
    s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: "1.5rem", sm: "1.875rem" } }}>
          Shout-outs
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Moderate participant shout-outs before they reach their recipient.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search message, sender, recipient, or plan…"
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
          sx={{ flex: 1, maxWidth: { sm: 420 } }}
        />
        <Select
          size="small"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </Select>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {items.length} of {total} shout-out{total !== 1 ? "s" : ""}
        </Typography>
      </Stack>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <Typography variant="body1" color="text.secondary">
            {search ? "No shout-outs match your search." : "No shout-outs in this view."}
          </Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: 0.5, color: "text.secondary", bgcolor: "grey.50" } }}>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>Date</TableCell>
                <TableCell>Sender</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell sx={{ display: { xs: "none", lg: "table-cell" } }}>Plan</TableCell>
                <TableCell>Message</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((s) => {
                const senderHref = profileHref(s.sender.username);
                const recipientHref = profileHref(s.recipient.username);
                const isExpanded = expandedId === s.id;
                const isActing = actingId === s.id;
                return (
                  <Fragment key={s.id}>
                    <TableRow
                      hover
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      sx={{
                        cursor: "pointer",
                        "&:last-child td": { borderBottom: isExpanded ? "1px solid" : 0, borderColor: "divider" },
                      }}
                    >
                      <TableCell sx={{ display: { xs: "none", md: "table-cell" }, fontSize: "0.8125rem", color: "text.secondary", whiteSpace: "nowrap" }}>
                        {formatDate(s.createdAt)}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.8125rem" }}>
                        {senderHref ? (
                          <NextLink href={senderHref} target="_blank" style={{ color: "inherit" }} onClick={(e) => e.stopPropagation()}>
                            {s.sender.displayName}
                          </NextLink>
                        ) : s.sender.displayName}
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.8125rem" }}>
                        {recipientHref ? (
                          <NextLink href={recipientHref} target="_blank" style={{ color: "inherit" }} onClick={(e) => e.stopPropagation()}>
                            {s.recipient.displayName}
                          </NextLink>
                        ) : s.recipient.displayName}
                      </TableCell>
                      <TableCell sx={{ display: { xs: "none", lg: "table-cell" }, fontSize: "0.8125rem", maxWidth: 220 }}>
                        <NextLink href={`/events/${s.plan.id}`} target="_blank" style={{ color: "inherit", textDecoration: "none" }} onClick={(e) => e.stopPropagation()}>
                          <Typography variant="body2" noWrap sx={{ "&:hover": { textDecoration: "underline" } }}>
                            {s.plan.title}
                          </Typography>
                        </NextLink>
                      </TableCell>
                      <TableCell sx={{ fontSize: "0.8125rem", maxWidth: 280 }}>
                        <Typography variant="body2" noWrap>
                          {truncate(s.message)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={s.status === "pending" ? "Pending" : s.status === "approved" ? "Approved" : "Rejected"}
                          size="small"
                          variant={s.status === "approved" ? "filled" : "outlined"}
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.6875rem",
                            ...(s.status === "approved" && { bgcolor: "success.main", color: "#fff" }),
                            ...(s.status === "rejected" && { borderColor: "grey.300", color: "text.disabled" }),
                            ...(s.status === "pending" && { borderColor: "warning.main", color: "warning.dark" }),
                          }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                        {s.status === "pending" ? (
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="Approve">
                              <span>
                                <IconButton
                                  size="small"
                                  color="success"
                                  disabled={isActing}
                                  onClick={(e) => { e.stopPropagation(); updateStatus(s.id, "approved"); }}
                                >
                                  <CheckRoundedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Reject">
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  disabled={isActing}
                                  onClick={(e) => { e.stopPropagation(); updateStatus(s.id, "rejected"); }}
                                >
                                  <CloseRoundedIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem" }}>
                            {s.reviewer ? `by ${s.reviewer.displayName}` : "—"}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow sx={{ bgcolor: "grey.50" }}>
                        <TableCell colSpan={7} sx={{ py: 1.75 }}>
                          <Box sx={{ pl: { md: 1 } }}>
                            <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                              Full message
                            </Typography>
                            <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                              {s.message}
                            </Typography>
                            {s.reviewedAt && (
                              <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 1 }}>
                                Reviewed {formatDate(s.reviewedAt)}{s.reviewer ? ` by ${s.reviewer.displayName}` : ""}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && total > PAGE_SIZE && (
        <Stack direction="row" spacing={1} justifyContent="center" sx={{ mt: 2 }}>
          <Button size="small" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))} sx={{ textTransform: "none" }}>
            Previous
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </Typography>
          <Button size="small" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)} sx={{ textTransform: "none" }}>
            Next
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
