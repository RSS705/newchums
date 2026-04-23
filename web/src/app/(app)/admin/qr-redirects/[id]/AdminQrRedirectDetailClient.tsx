"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
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
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { copyQrPublicUrl, formatQrScanWhen, qrPublicUrlFor } from "../qrUrl";
import { QrFormDialog, type QrMediaType, type QrRedirectRow } from "../QrFormDialog";

type ScanRow = {
  id: string;
  scanned_at: string;
  country: string | null;
  city: string | null;
  region: string | null;
  // Neon returns NUMERIC as a string to preserve precision; we accept either
  // for resilience against driver / serialization changes.
  latitude: string | number | null;
  longitude: string | number | null;
  timezone: string | null;
};

const MEDIA_LABELS: Record<QrMediaType, string> = {
  card: "Card",
  poster: "Poster",
};

export default function AdminQrRedirectDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [item, setItem] = useState<QrRedirectRow | null>(null);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [scanHasMore, setScanHasMore] = useState(false);
  const [scanPageSize, setScanPageSize] = useState(25);
  const [loadingMoreScans, setLoadingMoreScans] = useState(false);
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
        item?: Omit<QrRedirectRow, "scan_count" | "last_scanned_at">;
        scan_count?: number;
        last_scanned_at?: string | null;
        recent_scans?: ScanRow[];
        scan_page_size?: number;
        scan_has_more?: boolean;
      };
      if (data.ok && data.item) {
        setItem({
          ...data.item,
          scan_count: data.scan_count ?? 0,
          last_scanned_at: data.last_scanned_at ?? null,
        } as QrRedirectRow);
        setScans(Array.isArray(data.recent_scans) ? data.recent_scans : []);
        if (typeof data.scan_page_size === "number" && data.scan_page_size > 0) {
          setScanPageSize(data.scan_page_size);
        }
        setScanHasMore(data.scan_has_more === true);
      }
    } catch {
      toast.error("Failed to load QR code");
    }
    setLoading(false);
  }, [id, router, toast]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  const handleLoadMoreScans = useCallback(async () => {
    if (loadingMoreScans) return;
    setLoadingMoreScans(true);
    try {
      const res = await apiFetch(
        `/admin/qr-redirects/${id}/scans?offset=${scans.length}&limit=${scanPageSize}`,
        { auth: true },
      );
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as {
        ok?: boolean;
        scans?: ScanRow[];
        has_more?: boolean;
      };
      if (data.ok && Array.isArray(data.scans)) {
        setScans((prev) => [...prev, ...data.scans!]);
        setScanHasMore(data.has_more === true);
      }
    } catch {
      toast.error("Couldn't load more scans");
    }
    setLoadingMoreScans(false);
  }, [id, scans.length, scanPageSize, loadingMoreScans, toast]);

  const shareUrl = useMemo(() => (item ? qrPublicUrlFor(item.code) : ""), [item]);

  const handleToggleActive = async (next: boolean) => {
    if (!item) return;
    const prev = item.is_active;
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
    // Optimistic remove. Testing/housekeeping action; if the server rejects
    // we restore the row and surface the error. No confirmation modal on
    // purpose, the user explicitly asked for a one-click delete.
    if (!item) return;
    const previous = scans;
    setScans((prev) => prev.filter((s) => s.id !== scanId));
    setItem({ ...item, scan_count: Math.max(0, (item.scan_count ?? 0) - 1) });
    try {
      const res = await apiFetch(`/admin/qr-redirects/${id}/scans/${scanId}`, {
        auth: true,
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setScans(previous);
        setItem({ ...item, scan_count: previous.length });
        toast.error("Couldn't delete scan");
        return;
      }
      fetchItem();
    } catch {
      setScans(previous);
      setItem({ ...item, scan_count: previous.length });
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
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const used = (item.scan_count ?? 0) > 0;

  return (
    <Stack spacing={3}>
      <HeaderBlock
        item={item}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <StatusCard
        item={item}
        onToggleActive={handleToggleActive}
      />

      <StatsStrip
        scanCount={item.scan_count ?? 0}
        lastScannedAt={item.last_scanned_at}
        createdAt={item.created_at}
        updatedAt={item.updated_at}
        used={used}
      />

      <DetailsCard item={item} shareUrl={shareUrl} />

      <RecentScansSection
        scans={scans}
        hasMore={scanHasMore}
        loadingMore={loadingMoreScans}
        onLoadMore={handleLoadMoreScans}
        onDeleteScan={handleDeleteScan}
      />

      <QrFormDialog
        mode="edit"
        open={editOpen}
        item={item}
        onClose={() => setEditOpen(false)}
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

/** Page header. Back link, monospace code as the identity, title as the
 *  human-readable caption, and right-aligned edit / delete actions. Matches
 *  the pattern in AdminUserDiagnosticsClient where the back affordance sits
 *  inline with the title block rather than on its own row. */
function HeaderBlock({
  item,
  onEdit,
  onDelete,
}: {
  item: QrRedirectRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }}>
      <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
        <Tooltip title="Back to QR codes" arrow>
          <IconButton
            component={NextLink}
            href="/admin/qr-redirects"
            size="small"
            sx={{
              mt: 0.25,
              color: "text.secondary",
              "&:hover": { color: "primary.main", bgcolor: "action.hover" },
            }}
            aria-label="Back to QR codes"
          >
            <ArrowBackRoundedIcon />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap" }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: "monospace",
                fontSize: { xs: "1.625rem", sm: "1.875rem" },
                fontWeight: 700,
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
                color: "text.primary",
              }}
            >
              {item.code}
            </Typography>
            {item.media_type && (
              <MediaChip mediaType={item.media_type} />
            )}
          </Stack>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}
          >
            {item.title}
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
        <Button
          startIcon={<EditRoundedIcon />}
          variant="outlined"
          size="small"
          onClick={onEdit}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          Edit
        </Button>
        <Button
          startIcon={<DeleteOutlineRoundedIcon />}
          variant="outlined"
          color="error"
          size="small"
          onClick={onDelete}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
        >
          Delete
        </Button>
      </Stack>
    </Stack>
  );
}

/** Redirect-state card. Two jobs: (1) surface whether the redirect is
 *  currently live or falling back to the homepage, (2) make toggling that
 *  state a one-click action. We intentionally don't bury the toggle inside a
 *  chip row; it's the single most operationally significant control on the
 *  page. Copy, Open, and the destination URL all live here too because that
 *  is the same beat: "what does this code do right now?". */
function StatusCard({
  item,
  onToggleActive,
}: {
  item: QrRedirectRow;
  onToggleActive: (next: boolean) => void;
}) {
  const toast = useToast();
  const shareUrl = qrPublicUrlFor(item.code);
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        borderColor: item.is_active ? "success.main" : "divider",
        bgcolor: item.is_active ? "success.light" : "grey.100",
        transition: "background-color 120ms ease, border-color 120ms ease",
      }}
    >
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={{ xs: 1.5, md: 3 }}
        alignItems={{ md: "center" }}
        sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: item.is_active ? "success.main" : "text.disabled",
                boxShadow: item.is_active ? "0 0 0 3px rgba(5, 150, 105, 0.15)" : "none",
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: item.is_active ? "success.dark" : "text.secondary",
              }}
            >
              {item.is_active ? "Redirect is live" : "Falling back to homepage"}
            </Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: "wrap" }}>
            <Typography
              component="a"
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                fontFamily: "monospace",
                fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                color: "primary.dark",
                wordBreak: "break-all",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {shareUrl}
            </Typography>
            <Tooltip title="Copy public URL" arrow>
              <IconButton
                size="small"
                onClick={() => copyQrPublicUrl(item.code, toast)}
                sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
              >
                <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Open public URL" arrow>
              <IconButton
                size="small"
                component="a"
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "text.secondary", "&:hover": { color: "primary.main" } }}
              >
                <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={item.is_active}
              onChange={(_, v) => onToggleActive(v)}
              color="success"
            />
          }
          label={
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.is_active ? "Active" : "Inactive"}
            </Typography>
          }
          sx={{ m: 0, flexShrink: 0 }}
        />
      </Stack>
    </Paper>
  );
}

/** Four-cell numeric strip: total scans, last scan, created, updated.
 *  Mirrors the `Plan stats` strip on `AdminUserDiagnosticsClient` so the
 *  admin surfaces share a consistent "key numbers at a glance" rhythm. */
function StatsStrip({
  scanCount,
  lastScannedAt,
  createdAt,
  updatedAt,
  used,
}: {
  scanCount: number;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  used: boolean;
}) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, px: { xs: 2, sm: 2.5 }, py: 1.75 }}>
      <Stack
        direction="row"
        divider={<Divider orientation="vertical" flexItem sx={{ mx: { xs: 1.25, sm: 3 } }} />}
        sx={{ overflowX: "auto" }}
      >
        <StatCell
          label="Total scans"
          primary={scanCount.toString()}
          muted={!used}
          primarySize="h"
        />
        <StatCell
          label="Last scan"
          primary={used ? formatQrScanWhen(lastScannedAt) : "Never"}
          secondary={used && lastScannedAt ? formatDateTime(lastScannedAt) : undefined}
          muted={!used}
        />
        <StatCell
          label="Created"
          primary={formatDate(createdAt)}
          secondary={formatTimeOfDay(createdAt)}
        />
        <StatCell
          label="Last updated"
          primary={formatDate(updatedAt)}
          secondary={formatTimeOfDay(updatedAt)}
        />
      </Stack>
    </Paper>
  );
}

function StatCell({
  label,
  primary,
  secondary,
  muted,
  primarySize = "md",
}: {
  label: string;
  primary: string;
  secondary?: string;
  muted?: boolean;
  primarySize?: "h" | "md";
}) {
  return (
    <Box sx={{ minWidth: 92, flexShrink: 0 }}>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          fontSize: "0.6875rem",
          fontWeight: 600,
          color: "text.secondary",
          lineHeight: 1.4,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: primarySize === "h" ? "1.375rem" : "1rem",
          fontWeight: 700,
          lineHeight: 1.25,
          color: muted ? "text.disabled" : "text.primary",
          whiteSpace: "nowrap",
        }}
      >
        {primary}
      </Typography>
      {secondary && (
        <Typography variant="caption" color="text.disabled" sx={{ display: "block", fontSize: "0.75rem" }}>
          {secondary}
        </Typography>
      )}
    </Box>
  );
}

/** Metadata card. Horizontal label/value rows rather than the previous
 *  Grid of boxes, read top-to-bottom as a scannable dl. Divider between
 *  rows keeps density high without a boxy feel. */
function DetailsCard({ item, shareUrl }: { item: QrRedirectRow; shareUrl: string }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, pt: 2, pb: 1.25 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: "0.8125rem", textTransform: "uppercase", letterSpacing: 0.6, color: "text.secondary" }}>
          Details
        </Typography>
      </Box>
      <Divider />
      <Stack divider={<Divider flexItem />}>
        <DetailRow label="Destination">
          <Typography
            component="a"
            href={item.destination_url}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{
              color: "primary.dark",
              wordBreak: "break-all",
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {item.destination_url}
          </Typography>
        </DetailRow>
        <DetailRow label="Public URL" muted>
          <Typography
            component="a"
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="body2"
            sx={{
              fontFamily: "monospace",
              color: "text.secondary",
              wordBreak: "break-all",
              fontSize: "0.8125rem",
              "&:hover": { color: "primary.main", textDecoration: "underline" },
            }}
          >
            {shareUrl}
          </Typography>
        </DetailRow>
        <DetailRow label="Media type">
          {item.media_type ? (
            <MediaChip mediaType={item.media_type} />
          ) : (
            <Typography variant="body2" color="text.disabled">Unspecified</Typography>
          )}
        </DetailRow>
        <DetailRow label="Assigned store">
          {item.assigned_store ? (
            <Typography variant="body2" fontWeight={500}>{item.assigned_store}</Typography>
          ) : (
            <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
              Unassigned
            </Typography>
          )}
        </DetailRow>
        <DetailRow label="Variant">
          {item.campaign_variant ? (
            <Typography variant="body2" fontWeight={500}>{item.campaign_variant}</Typography>
          ) : (
            <Typography variant="body2" color="text.disabled">None</Typography>
          )}
        </DetailRow>
        {item.notes && (
          <DetailRow label="Notes">
            <Typography variant="body2" color="text.primary" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {item.notes}
            </Typography>
          </DetailRow>
        )}
      </Stack>
    </Paper>
  );
}

function DetailRow({
  label,
  muted,
  children,
}: {
  label: string;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 0.5, sm: 3 }}
      alignItems={{ sm: "flex-start" }}
      sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, opacity: muted ? 0.85 : 1 }}
    >
      <Typography
        variant="caption"
        sx={{
          minWidth: { sm: 140 },
          fontSize: "0.75rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "text.secondary",
          pt: { sm: 0.25 },
        }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Stack>
  );
}

/** Recent scans section. Section header + caveat + table. The caveat moves
 *  into a quiet inline info box rather than floating as a paragraph because
 *  it reads as a rule the user should trust, not as body copy.
 *
 *  Columns are intentionally lean: a precise timestamp (down to the second,
 *  in the viewer's local time) and a best-effort location. The raw user-
 *  agent and HTTP referer were dropped because (1) modern browsers ship a
 *  reduced UA string ("Linux; Android 10; K") that carries almost no device
 *  information, and (2) mobile camera apps opening the redirect never set a
 *  referer, so that column was consistently blank. Both fields are still
 *  captured and used server-side for dedupe. */
function RecentScansSection({
  scans,
  hasMore,
  loadingMore,
  onLoadMore,
  onDeleteScan,
}: {
  scans: ScanRow[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDeleteScan: (id: string) => void;
}) {
  return (
    <Stack spacing={1.5}>
      <Typography component="h2" variant="h6" fontWeight={700} sx={{ fontSize: "1.125rem" }}>
        Recent scans
      </Typography>

      <Alert
        severity="info"
        icon={<InfoOutlinedIcon sx={{ fontSize: 18 }} />}
        sx={{
          py: 0.5,
          borderRadius: 2,
          bgcolor: "info.light",
          color: "text.secondary",
          border: 1,
          borderColor: "divider",
          "& .MuiAlert-icon": { color: "info.dark", py: 0.5 },
          "& .MuiAlert-message": { py: 0.5, fontSize: "0.8125rem" },
        }}
      >
        Repeat scans from the same device within 30 seconds are merged. Known link-preview bots
        (Slack, Discord, iMessage, search crawlers) are filtered and never counted.
      </Alert>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  "& th": {
                    fontWeight: 700,
                    fontSize: "0.6875rem",
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "text.secondary",
                    py: 1.25,
                    bgcolor: "grey.50",
                  },
                }}
              >
                <TableCell>When</TableCell>
                <TableCell>Location</TableCell>
                <TableCell sx={{ width: 48 }} align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {scans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} align="center" sx={{ py: 6, borderBottom: 0 }}>
                    <Stack spacing={0.75} alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        No scans yet.
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        Scan counts appear the first time a real device scans this code.
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                scans.map((s) => (
                  <TableRow
                    key={s.id}
                    hover
                    sx={{
                      "& td": { py: 1.25, fontSize: "0.8125rem", verticalAlign: "top" },
                      "&:last-child td": { borderBottom: 0 },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: "nowrap", color: "text.primary", fontWeight: 500 }}>
                      <Tooltip title={formatQrScanWhen(s.scanned_at)} arrow>
                        <span>{formatScanTimestamp(s.scanned_at)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ color: "text.secondary", maxWidth: 320 }}>
                      <ScanLocationCell scan={s} />
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5, pr: 1 }}>
                      <Tooltip title="Delete scan" arrow>
                        <IconButton
                          size="small"
                          onClick={() => onDeleteScan(s.id)}
                          aria-label="Delete scan"
                          sx={{
                            color: "text.disabled",
                            borderRadius: 1.25,
                            "&:hover": { color: "error.main", bgcolor: "action.hover" },
                          }}
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
      </Paper>

      {hasMore && (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 0.5 }}>
          {loadingMore ? (
            <CircularProgress size={24} />
          ) : (
            <Button
              variant="outlined"
              size="small"
              onClick={onLoadMore}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, px: 3 }}
            >
              Load more
            </Button>
          )}
        </Box>
      )}
    </Stack>
  );
}

/** Renders the location cell: city and region on the first line (whichever
 *  are present), country on the second, and a lat/lng pair with a Google
 *  Maps link beneath when coordinates are available. All fields are
 *  independent, any subset can be missing. */
function ScanLocationCell({ scan }: { scan: ScanRow }) {
  const lat = toFiniteNumber(scan.latitude);
  const lng = toFiniteNumber(scan.longitude);
  const hasCoords = lat !== null && lng !== null;
  const placeLine = [scan.city, scan.region].filter(Boolean).join(", ");
  const countryLine = scan.country || null;
  const hasAny = placeLine || countryLine || hasCoords;

  if (!hasAny) {
    return <Typography component="span" color="text.disabled">-</Typography>;
  }

  return (
    <Stack spacing={0.25}>
      {placeLine && (
        <Typography variant="body2" sx={{ color: "text.primary", fontSize: "0.8125rem", fontWeight: 500 }}>
          {placeLine}
        </Typography>
      )}
      {countryLine && (
        <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "0.6875rem" }}>
          {countryLine}
        </Typography>
      )}
      {hasCoords && (
        <Typography
          component="a"
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          variant="caption"
          sx={{
            fontSize: "0.6875rem",
            color: "primary.main",
            textDecoration: "none",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          {lat!.toFixed(4)}, {lng!.toFixed(4)}
        </Typography>
      )}
    </Stack>
  );
}

function toFiniteNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Soft-filled media-type chip shared between the header row and the
 *  DetailsCard row so the two views can't drift visually. */
function MediaChip({ mediaType }: { mediaType: QrMediaType }) {
  const isCard = mediaType === "card";
  return (
    <Chip
      icon={isCard
        ? <CreditCardRoundedIcon sx={{ fontSize: "14px !important", ml: "6px !important" }} />
        : <ImageRoundedIcon sx={{ fontSize: "14px !important", ml: "6px !important" }} />}
      label={MEDIA_LABELS[mediaType]}
      size="small"
      sx={{
        height: 24,
        fontSize: "0.75rem",
        fontWeight: 600,
        borderRadius: "999px",
        color: isCard ? "info.dark" : "secondary.dark",
        bgcolor: isCard ? "info.light" : "secondary.light",
        border: "1px solid transparent",
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  );
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

/** Full local timestamp down to the second for the scan log table. Shown
 *  directly in the cell (no relative-time abbreviation) so each row carries
 *  the specific when/where the admin is looking for. */
function formatScanTimestamp(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
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

function formatTimeOfDay(iso: string | null): string | undefined {
  if (!iso) return undefined;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return undefined;
  }
}
