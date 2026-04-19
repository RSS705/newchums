"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
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
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { copyQrPublicUrl, formatQrScanWhen, qrPublicUrlFor } from "../qrUrl";

type QrRedirect = {
  id: string;
  code: string;
  title: string;
  destination_url: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ScanRow = {
  id: string;
  scanned_at: string;
  user_agent: string | null;
  referer: string | null;
  country: string | null;
};

export default function AdminQrRedirectDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<QrRedirect | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/qr-redirects/${id}`, { auth: true });
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("QR code not found");
          router.replace("/admin/qr-redirects");
          return;
        }
        throw new Error("request failed");
      }
      const data = (await res.json()) as {
        ok?: boolean;
        item?: QrRedirect;
        scan_count?: number;
        last_scanned_at?: string | null;
        recent_scans?: ScanRow[];
      };
      if (data.ok && data.item) {
        setItem(data.item);
        setScanCount(data.scan_count ?? 0);
        setLastScanAt(data.last_scanned_at ?? null);
        setScans(Array.isArray(data.recent_scans) ? data.recent_scans : []);
      }
    } catch {
      toast.error("Failed to load QR code");
    }
    setLoading(false);
  }, [id, router, toast]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  const shareUrl = useMemo(() => (item ? qrPublicUrlFor(item.code) : ""), [item]);

  const handleToggleActive = async (next: boolean) => {
    if (!item) return;
    const prev = item.is_active;
    // Optimistic flip so the switch responds immediately.
    setItem({ ...item, is_active: next });
    try {
      const res = await apiFetch(`/admin/qr-redirects/${item.id}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setItem({ ...item, is_active: prev });
        toast.error("Couldn't update status");
        return;
      }
      toast.success(next ? "Activated" : "Deactivated");
    } catch {
      setItem({ ...item, is_active: prev });
      toast.error("Couldn't update status");
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    // Optimistic remove so the row vanishes immediately. This is a testing/
    // housekeeping action; if the server rejects we restore the row and
    // surface the error. No confirmation modal on purpose — the user
    // explicitly asked for a one-click delete.
    const previous = scans;
    setScans((prev) => prev.filter((s) => s.id !== scanId));
    setScanCount((prev) => Math.max(0, prev - 1));
    try {
      const res = await apiFetch(`/admin/qr-redirects/${id}/scans/${scanId}`, {
        auth: true,
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setScans(previous);
        setScanCount(previous.length);
        toast.error("Couldn't delete scan");
        return;
      }
      // Refresh the summary so last_scanned_at reflects reality after the
      // most recent row is removed.
      fetchItem();
    } catch {
      setScans(previous);
      setScanCount(previous.length);
      toast.error("Couldn't delete scan");
    }
  };

  const handleDelete = async () => {
    if (!item) return;
    try {
      const res = await apiFetch(`/admin/qr-redirects/${item.id}`, {
        auth: true,
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        toast.error("Couldn't delete QR code");
        return;
      }
      toast.success("QR code deleted");
      router.replace("/admin/qr-redirects");
    } catch {
      toast.error("Couldn't delete QR code");
    }
  };

  if (loading || !item) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <MuiLink
          component={NextLink}
          href="/admin/qr-redirects"
          underline="hover"
          sx={{
            display: "inline-block",
            mb: 0.75,
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "primary.main",
          }}
        >
          QR Codes
        </MuiLink>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5, fontFamily: "monospace" }}>
          {item.code}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {item.title}
        </Typography>
      </Box>

      <AppCard>
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <Chip
              label={item.is_active ? "Active" : "Inactive"}
              size="small"
              color={item.is_active ? "success" : "default"}
              variant={item.is_active ? "filled" : "outlined"}
              sx={{ fontWeight: 600 }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={item.is_active}
                  onChange={(_, v) => handleToggleActive(v)}
                />
              }
              label={item.is_active ? "Redirect is live" : "Redirect falls back to homepage"}
              sx={{ m: 0 }}
            />
            <Box sx={{ flex: 1 }} />
            <Button
              startIcon={<EditRoundedIcon />}
              variant="outlined"
              size="small"
              onClick={() => setEditOpen(true)}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
            >
              Edit
            </Button>
            <Button
              startIcon={<DeleteOutlineRoundedIcon />}
              variant="outlined"
              color="error"
              size="small"
              onClick={() => setDeleteOpen(true)}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
            >
              Delete
            </Button>
          </Stack>

          <Divider />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FieldLabel>Public QR URL</FieldLabel>
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <Typography
                  component="a"
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body2"
                  sx={{ fontFamily: "monospace", color: "primary.main", wordBreak: "break-all" }}
                >
                  {shareUrl}
                </Typography>
                <Tooltip title="Copy public URL" arrow>
                  <IconButton size="small" onClick={() => copyQrPublicUrl(item.code, toast)}>
                    <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Open public URL" arrow>
                  <IconButton size="small" component="a" href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FieldLabel>Destination URL</FieldLabel>
              <Typography
                component="a"
                href={item.destination_url}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ color: "primary.main", wordBreak: "break-all" }}
              >
                {item.destination_url}
              </Typography>
            </Grid>
            {item.notes && (
              <Grid size={12}>
                <FieldLabel>Notes</FieldLabel>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {item.notes}
                </Typography>
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FieldLabel>Total scans</FieldLabel>
              <Typography variant="h6" fontWeight={700}>{scanCount}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FieldLabel>Last scan</FieldLabel>
              <Typography variant="body2">{formatQrScanWhen(lastScanAt)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FieldLabel>Created</FieldLabel>
              <Typography variant="body2">{formatDateTime(item.created_at)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FieldLabel>Last updated</FieldLabel>
              <Typography variant="body2">{formatDateTime(item.updated_at)}</Typography>
            </Grid>
          </Grid>
        </Stack>
      </AppCard>

      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
          Recent scans
        </Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>When</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Country</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Referer</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>User agent</TableCell>
                <TableCell sx={{ fontWeight: 700, width: 48 }} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No scans yet.
                  </TableCell>
                </TableRow>
              ) : (
                scans.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Tooltip title={formatDateTime(s.scanned_at)} arrow>
                        <span>{formatQrScanWhen(s.scanned_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{s.country || "—"}</TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography
                        variant="body2"
                        sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {s.referer || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography
                        variant="body2"
                        sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {s.user_agent || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      <Tooltip title="Delete scan" arrow>
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteScan(s.id)}
                          aria-label="Delete scan"
                          sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                        >
                          <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Showing up to 50 most recent scans.
        </Typography>
      </Box>

      <QrEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        item={item}
        onSaved={(updated) => {
          setItem(updated);
          setEditOpen(false);
          fetchItem();
        }}
      />

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete QR code?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This permanently deletes <strong>{item.code}</strong> and all its scan history.
            Posters already in the wild will redirect to the homepage. This can&rsquo;t be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: "block",
        mb: 0.25,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontWeight: 700,
        color: "text.secondary",
      }}
    >
      {children}
    </Typography>
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function QrEditDialog({
  open,
  onClose,
  item,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  item: QrRedirect;
  onSaved: (updated: QrRedirect) => void;
}) {
  const toast = useToast();
  const [code, setCode] = useState(item.code);
  const [title, setTitle] = useState(item.title);
  const [destination, setDestination] = useState(item.destination_url);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [isActive, setIsActive] = useState(item.is_active);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate form state from the current record whenever the dialog opens.
  // setState-in-effect is intentional: the reset is triggered by a prop
  // change (`open` → true, or the item being swapped out), which is the
  // sync-with-external-trigger pattern this rule is meant to allow.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setCode(item.code);
      setTitle(item.title);
      setDestination(item.destination_url);
      setNotes(item.notes ?? "");
      setIsActive(item.is_active);
    }
  }, [open, item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/admin/qr-redirects/${item.id}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          title: title.trim(),
          destination_url: destination.trim(),
          notes: notes.trim() || null,
          is_active: isActive,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        item?: QrRedirect;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.item) {
        toast.error(data.message || data.error || "Couldn't save changes");
        setSubmitting(false);
        return;
      }
      toast.success("Saved");
      onSaved(data.item);
    } catch {
      toast.error("Couldn't save changes");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={() => { if (!submitting) onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Edit QR code</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            helperText="Changing the code updates the public URL. Old posters will redirect to the homepage."
            fullWidth
            size="small"
            inputProps={{ maxLength: 64, style: { fontFamily: "monospace" } }}
          />
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            size="small"
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            label="Destination URL"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            helperText="Must be an absolute http(s) URL."
            fullWidth
            size="small"
            inputProps={{ maxLength: 2048 }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Print run, contact, reassignment notes"
            fullWidth
            size="small"
            multiline
            minRows={2}
            inputProps={{ maxLength: 2000 }}
          />
          <FormControlLabel
            control={<Switch checked={isActive} onChange={(_, v) => setIsActive(v)} />}
            label={isActive ? "Active" : "Inactive (falls back to the homepage)"}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          {submitting ? <CircularProgress size={18} color="inherit" /> : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
