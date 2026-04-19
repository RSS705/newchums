"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SearchIcon from "@mui/icons-material/Search";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { copyQrPublicUrl, formatQrScanWhen, qrPublicUrlFor } from "./qrUrl";

type QrRedirectRow = {
  id: string;
  code: string;
  title: string;
  destination_url: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  scan_count: number;
  last_scanned_at: string | null;
};

export default function AdminQrRedirectsClient() {
  const toast = useToast();
  const [items, setItems] = useState<QrRedirectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const qs = params.toString();
      const res = await apiFetch(
        `/admin/qr-redirects${qs ? `?${qs}` : ""}`,
        { auth: true }
      );
      const data = (await res.json()) as { ok?: boolean; items?: QrRedirectRow[] };
      if (data.ok && Array.isArray(data.items)) setItems(data.items);
    } catch {
      toast.error("Failed to load QR codes");
    }
    setLoading(false);
  }, [search, toast]);

  // Refetch on mount and whenever the search input (captured inside
  // fetchItems) changes. setState-in-effect: the fetch handler's loading
  // flips are what drive the UI, so the rule's warning is expected here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredCount = items.length;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
          QR Codes
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Internal redirect layer for printed QR posters. Codes map to a
          destination URL and can be remapped later without reprinting.
        </Typography>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
        <TextField
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code or title"
          size="small"
          sx={{ flex: 1, maxWidth: 420 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          New QR code
        </Button>
      </Stack>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Title</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Destination</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Scans</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Last scan</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Share URL</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : filteredCount === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: "text.secondary" }}>
                  {search.trim() ? "No QR codes match your search." : "No QR codes yet."}
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <QrRow key={row.id} row={row} />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <QrCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          fetchItems();
        }}
      />
    </Stack>
  );
}

function QrRow({ row }: { row: QrRedirectRow }) {
  const toast = useToast();
  const shareUrl = useMemo(() => qrPublicUrlFor(row.code), [row.code]);
  return (
    <TableRow hover>
      <TableCell sx={{ fontFamily: "monospace", fontWeight: 600 }}>
        <NextLink href={`/admin/qr-redirects/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          {row.code}
        </NextLink>
      </TableCell>
      <TableCell>
        <NextLink href={`/admin/qr-redirects/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          {row.title}
        </NextLink>
      </TableCell>
      <TableCell sx={{ maxWidth: 320 }}>
        <Tooltip title={row.destination_url} arrow placement="top">
          <Typography
            component="a"
            href={row.destination_url}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{
              display: "inline-block",
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              verticalAlign: "bottom",
              color: "primary.main",
            }}
          >
            {row.destination_url}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="right">{row.scan_count}</TableCell>
      <TableCell>{formatQrScanWhen(row.last_scanned_at)}</TableCell>
      <TableCell>
        <Chip
          label={row.is_active ? "Active" : "Inactive"}
          size="small"
          color={row.is_active ? "success" : "default"}
          variant={row.is_active ? "filled" : "outlined"}
          sx={{ fontWeight: 600 }}
        />
      </TableCell>
      <TableCell align="right">
        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
          <Tooltip title="Copy public URL" arrow>
            <IconButton size="small" onClick={() => copyQrPublicUrl(row.code, toast)}>
              <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open public URL" arrow>
            <IconButton size="small" component="a" href={shareUrl} target="_blank" rel="noopener noreferrer">
              <OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}

function QrCreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Reset form state whenever the dialog re-opens. setState-in-effect is
  // intentional here: the reset is driven by a prop change (`open`
  // transitioning to true), which is the exact shape of "synchronize with
  // an external trigger" the rule is designed to allow.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setCode("");
      setTitle("");
      setDestination("");
      setNotes("");
      setIsActive(true);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (submitting) return;
    if (!code.trim() || !title.trim() || !destination.trim()) {
      toast.error("Code, title, and destination are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch("/admin/qr-redirects", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          title: title.trim(),
          destination_url: destination.trim(),
          notes: notes.trim() || null,
          is_active: isActive,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.message || data.error || "Could not create QR code");
        setSubmitting(false);
        return;
      }
      toast.success("QR code created");
      onCreated();
    } catch {
      toast.error("Could not create QR code");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={() => { if (!submitting) onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>New QR code</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. S004-P002"
            helperText="Letters, digits, dashes, and underscores. 2–64 chars."
            autoFocus
            fullWidth
            size="small"
            inputProps={{ maxLength: 64, style: { fontFamily: "monospace" } }}
          />
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rook & Pawn — window card"
            fullWidth
            size="small"
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Destination URL"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="https://newchums.com/communities/..."
            helperText="Must be an absolute http(s) URL."
            fullWidth
            size="small"
            inputProps={{ maxLength: 2048 }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional — print run, contact, reassignment notes"
            fullWidth
            size="small"
            multiline
            minRows={2}
            inputProps={{ maxLength: 2000 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={isActive}
                onChange={(_, v) => setIsActive(v)}
              />
            }
            label={isActive ? "Active" : "Inactive (falls back to the homepage)"}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          {submitting ? <CircularProgress size={18} color="inherit" /> : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
