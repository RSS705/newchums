"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
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
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CreditCardRoundedIcon from "@mui/icons-material/CreditCardRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SearchIcon from "@mui/icons-material/Search";
import NextLink from "next/link";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { copyQrPublicUrl, formatQrScanWhen, qrPublicUrlFor } from "./qrUrl";
import { QrFormDialog, type QrMediaType, type QrRedirectRow } from "./QrFormDialog";

type SortField =
  | "code"
  | "title"
  | "media_type"
  | "assigned_store"
  | "scan_count"
  | "last_scanned_at"
  | "is_active"
  | "created_at";
type SortDir = "asc" | "desc";

type MediaFilter = "all" | QrMediaType;
type StatusFilter = "all" | "active" | "inactive";
type UsageFilter = "all" | "used" | "unused";
type StoreFilter = "all" | "unassigned" | string;

const MEDIA_LABELS: Record<QrMediaType, string> = {
  card: "Card",
  poster: "Poster",
};

/** Shared chip styling for table rows. Matches the density used elsewhere in
 *  the admin surfaces (AdminCommunitiesClient, AdminPlansClient), 11px text,
 *  compact height. Kept as a single style object so we don't drift between
 *  the media-type chip, the status chip, and the inline usage markers. */
const ROW_CHIP_SX = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  height: 22,
  letterSpacing: 0.2,
} as const;

export default function AdminQrRedirectsClient() {
  const toast = useToast();
  const [items, setItems] = useState<QrRedirectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QrRedirectRow | null>(null);

  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [usageFilter, setUsageFilter] = useState<UsageFilter>("all");
  const [storeFilter, setStoreFilter] = useState<StoreFilter>("all");

  // Default sort: most recently created first, matches the legacy behavior so
  // a fresh visit feels familiar.
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchItems = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const trimmed = (q ?? "").trim();
      if (trimmed) params.set("q", trimmed);
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
  }, [toast]);

  // Refetch on mount and when the fetch handler identity changes. The search
  // refetch is driven directly by `handleSearch` below so the page doesn't
  // re-hit the API on every keystroke via an effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSearch = (val: string) => {
    setSearch(val);
    fetchItems(val);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Numeric / time fields default to desc (most recent / highest first);
      // text fields default to asc.
      const numeric =
        field === "scan_count" || field === "last_scanned_at" || field === "created_at";
      setSortDir(numeric ? "desc" : "asc");
    }
  };

  const resetFilters = () => {
    setMediaFilter("all");
    setStatusFilter("all");
    setUsageFilter("all");
    setStoreFilter("all");
    if (search) {
      setSearch("");
      fetchItems("");
    }
  };

  const knownStores = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) {
      if (r.assigned_store) set.add(r.assigned_store);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((r) => {
      if (mediaFilter !== "all" && r.media_type !== mediaFilter) return false;
      if (statusFilter === "active" && !r.is_active) return false;
      if (statusFilter === "inactive" && r.is_active) return false;
      if (usageFilter === "used" && r.scan_count <= 0) return false;
      if (usageFilter === "unused" && r.scan_count > 0) return false;
      if (storeFilter === "unassigned" && r.assigned_store) return false;
      if (storeFilter !== "all" && storeFilter !== "unassigned" && r.assigned_store !== storeFilter) return false;
      return true;
    });
  }, [items, mediaFilter, statusFilter, usageFilter, storeFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "code":
          cmp = collator.compare(a.code, b.code);
          break;
        case "title":
          cmp = collator.compare(a.title, b.title);
          break;
        case "media_type":
          cmp = collator.compare(a.media_type ?? "", b.media_type ?? "");
          break;
        case "assigned_store":
          cmp = collator.compare(a.assigned_store ?? "", b.assigned_store ?? "");
          break;
        case "scan_count":
          cmp = a.scan_count - b.scan_count;
          break;
        case "last_scanned_at":
          // Null last-scanned sorts as the oldest (epoch).
          cmp = (a.last_scanned_at ?? "").localeCompare(b.last_scanned_at ?? "");
          break;
        case "is_active":
          cmp = (a.is_active === b.is_active) ? 0 : a.is_active ? 1 : -1;
          break;
        case "created_at":
          cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const totals = useMemo(() => {
    let total = 0;
    let used = 0;
    let unassigned = 0;
    let active = 0;
    for (const r of items) {
      total += 1;
      if (r.scan_count > 0) used += 1;
      if (!r.assigned_store) unassigned += 1;
      if (r.is_active) active += 1;
    }
    return { total, used, unused: total - used, unassigned, active, inactive: total - active };
  }, [items]);

  const filtersActive =
    mediaFilter !== "all" ||
    statusFilter !== "all" ||
    usageFilter !== "all" ||
    storeFilter !== "all" ||
    Boolean(search.trim());

  const handleEditSaved = (updated: QrRedirectRow) => {
    setItems((prev) => prev.map((r) => (r.id === updated.id
      ? { ...r, ...updated }
      : r)));
    setEditTarget(null);
  };

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-end" }}>
        <Box sx={{ flex: 1 }}>
          <Typography
            component="h1"
            sx={{
              mb: 0.5,
              lineHeight: 1.25,
              fontSize: { xs: "1.75rem", sm: "2rem" },
              letterSpacing: "-0.02em",
              fontWeight: 700,
            }}
          >
            QR Codes
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" }, maxWidth: 640 }}
          >
            Operational inventory for printed QR posters and proxy cards. Track which codes are out,
            where they went, and how each is performing.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, alignSelf: { xs: "stretch", sm: "center" } }}
        >
          New QR code
        </Button>
      </Stack>

      <SummaryStrip totals={totals} />

      <Paper
        variant="outlined"
        sx={{
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            px: { xs: 1.5, sm: 2 },
            py: 1.25,
            bgcolor: "grey.50",
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={1.25}
            alignItems={{ md: "center" }}
            flexWrap="wrap"
            useFlexGap
          >
            <TextField
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search code, title, or store"
              size="small"
              sx={{ flex: 1, minWidth: 220, maxWidth: 340, bgcolor: "background.paper", borderRadius: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
            <FilterSelect
              label="Media"
              value={mediaFilter}
              onChange={(v) => setMediaFilter(v as MediaFilter)}
              options={[
                { value: "all", label: "All media" },
                { value: "card", label: "Cards" },
                { value: "poster", label: "Posters" },
              ]}
            />
            <FilterSelect
              label="Store"
              value={storeFilter}
              onChange={(v) => setStoreFilter(v)}
              options={[
                { value: "all", label: "All stores" },
                { value: "unassigned", label: "Unassigned" },
                ...knownStores.map((s) => ({ value: s, label: s })),
              ]}
            />
            <FilterSelect
              label="Usage"
              value={usageFilter}
              onChange={(v) => setUsageFilter(v as UsageFilter)}
              options={[
                { value: "all", label: "Used + unused" },
                { value: "used", label: "Used (scanned)" },
                { value: "unused", label: "Unused" },
              ]}
            />
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { value: "all", label: "Active + inactive" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            <Box sx={{ flexGrow: 1 }} />
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              {filtersActive && (
                <Button
                  variant="text"
                  size="small"
                  startIcon={<FilterListRoundedIcon sx={{ fontSize: 16 }} />}
                  onClick={resetFilters}
                  sx={{
                    textTransform: "none",
                    fontWeight: 600,
                    color: "text.secondary",
                    minHeight: 32,
                  }}
                >
                  Clear filters
                </Button>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {filtersActive
                  ? `${sorted.length} of ${totals.total}`
                  : `${totals.total} code${totals.total === 1 ? "" : "s"}`}
              </Typography>
            </Stack>
          </Stack>
        </Box>

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
                    whiteSpace: "nowrap",
                    py: 1.25,
                  },
                }}
              >
                <TableCell>
                  <TableSortLabel
                    active={sortField === "code"}
                    direction={sortField === "code" ? sortDir : "asc"}
                    onClick={() => handleSort("code")}
                  >
                    Code
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === "title"}
                    direction={sortField === "title" ? sortDir : "asc"}
                    onClick={() => handleSort("title")}
                  >
                    Title
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  <TableSortLabel
                    active={sortField === "media_type"}
                    direction={sortField === "media_type" ? sortDir : "asc"}
                    onClick={() => handleSort("media_type")}
                  >
                    Media
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel
                    active={sortField === "assigned_store"}
                    direction={sortField === "assigned_store" ? sortDir : "asc"}
                    onClick={() => handleSort("assigned_store")}
                  >
                    Store
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortField === "scan_count"}
                    direction={sortField === "scan_count" ? sortDir : "desc"}
                    onClick={() => handleSort("scan_count")}
                  >
                    Scans
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", md: "table-cell" } }}>
                  <TableSortLabel
                    active={sortField === "last_scanned_at"}
                    direction={sortField === "last_scanned_at" ? sortDir : "desc"}
                    onClick={() => handleSort("last_scanned_at")}
                  >
                    Last scan
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={sortField === "is_active"}
                    direction={sortField === "is_active" ? sortDir : "asc"}
                    onClick={() => handleSort("is_active")}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right" sx={{ pr: { xs: 1.5, sm: 2 } }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8, borderBottom: 0 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 8, borderBottom: 0 }}>
                    <EmptyTableState
                      filtersActive={filtersActive}
                      onClearFilters={resetFilters}
                      onCreate={() => setCreateOpen(true)}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((row) => (
                  <QrRow key={row.id} row={row} onEdit={() => setEditTarget(row)} />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <QrFormDialog
        mode="create"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          setCreateOpen(false);
          fetchItems(search);
        }}
        knownStores={knownStores}
      />

      <QrFormDialog
        mode="edit"
        open={Boolean(editTarget)}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={(updated) => {
          handleEditSaved(updated);
          fetchItems(search);
        }}
        knownStores={knownStores}
      />
    </Stack>
  );
}

/** Six-cell stats strip above the table. Same rhythm as the plan-stats
 *  strip on `AdminUserDiagnosticsClient`: caption label, bold number, thin
 *  dividers separating the cells. Unused/unassigned counts lift a touch
 *  (warning-toned number) when they're non-zero so the operational signal
 *  is obvious at a glance without a loud coloured chip. */
function SummaryStrip({
  totals,
}: {
  totals: { total: number; used: number; unused: number; unassigned: number; active: number; inactive: number };
}) {
  const cells = [
    { label: "Total", value: totals.total, tone: "default" as const },
    { label: "Used", value: totals.used, tone: "default" as const },
    { label: "Unused", value: totals.unused, tone: totals.unused > 0 ? "warning" as const : "default" as const },
    { label: "Unassigned", value: totals.unassigned, tone: totals.unassigned > 0 ? "warning" as const : "default" as const },
    { label: "Active", value: totals.active, tone: "default" as const },
    { label: "Inactive", value: totals.inactive, tone: "default" as const },
  ];
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, px: { xs: 1.5, sm: 2.5 }, py: 1.5 }}>
      <Stack
        direction="row"
        spacing={0}
        divider={<Divider orientation="vertical" flexItem sx={{ mx: { xs: 1.25, sm: 2.5 } }} />}
        sx={{
          overflowX: "auto",
          // Let individual cells shrink on narrow screens rather than
          // forcing a horizontal scrollbar at the usual tablet width.
          flexWrap: "nowrap",
        }}
      >
        {cells.map((cell) => (
          <Box key={cell.label} sx={{ minWidth: 72, flexShrink: 0 }}>
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                fontSize: "0.6875rem",
                fontWeight: 600,
                lineHeight: 1.4,
                display: "block",
              }}
            >
              {cell.label}
            </Typography>
            <Typography
              sx={{
                fontSize: "1.25rem",
                fontWeight: 700,
                lineHeight: 1.2,
                color: cell.tone === "warning" ? "warning.dark" : "text.primary",
              }}
            >
              {cell.value}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const handleChange = (e: SelectChangeEvent<string>) => onChange(e.target.value);
  return (
    <FormControl size="small" sx={{ minWidth: 148, bgcolor: "background.paper", borderRadius: 1 }}>
      <InputLabel id={`qr-filter-${label}`}>{label}</InputLabel>
      <Select
        labelId={`qr-filter-${label}`}
        label={label}
        value={value}
        onChange={handleChange}
        sx={{ "& .MuiSelect-select": { py: 0.9 } }}
      >
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function EmptyTableState({
  filtersActive,
  onClearFilters,
  onCreate,
}: {
  filtersActive: boolean;
  onClearFilters: () => void;
  onCreate: () => void;
}) {
  if (filtersActive) {
    return (
      <Stack spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary">
          No QR codes match those filters.
        </Typography>
        <Button
          size="small"
          variant="text"
          onClick={onClearFilters}
          sx={{ textTransform: "none", fontWeight: 600, minHeight: 0, py: 0.25 }}
        >
          Clear filters
        </Button>
      </Stack>
    );
  }
  return (
    <Stack spacing={1.5} alignItems="center">
      <Typography variant="body2" color="text.secondary">
        No QR codes yet. Add one to start tracking a printed poster or card.
      </Typography>
      <Button
        size="small"
        variant="outlined"
        startIcon={<AddRoundedIcon sx={{ fontSize: 16 }} />}
        onClick={onCreate}
        sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
      >
        New QR code
      </Button>
    </Stack>
  );
}

function QrRow({ row, onEdit }: { row: QrRedirectRow; onEdit: () => void }) {
  const toast = useToast();
  const shareUrl = useMemo(() => qrPublicUrlFor(row.code), [row.code]);
  const used = row.scan_count > 0;
  return (
    <TableRow
      hover
      sx={{
        opacity: row.is_active ? 1 : 0.68,
        "& td": {
          py: 1.25,
          fontSize: "0.875rem",
        },
        "&:last-child td": { borderBottom: 0 },
      }}
    >
      <TableCell sx={{ whiteSpace: "nowrap" }}>
        <NextLink href={`/admin/qr-redirects/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <Typography
            component="span"
            sx={{
              fontFamily: "monospace",
              fontWeight: 600,
              fontSize: "0.875rem",
              color: "text.primary",
              "&:hover": { color: "primary.main" },
            }}
          >
            {row.code}
          </Typography>
        </NextLink>
      </TableCell>
      <TableCell sx={{ maxWidth: 280 }}>
        <NextLink href={`/admin/qr-redirects/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <Typography variant="body2" fontWeight={600} noWrap sx={{ "&:hover": { color: "primary.main" } }}>
            {row.title}
          </Typography>
          {row.campaign_variant && (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.7rem" }}>
              Variant {row.campaign_variant}
            </Typography>
          )}
        </NextLink>
      </TableCell>
      <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
        {row.media_type ? (
          <Chip
            icon={row.media_type === "card"
              ? <CreditCardRoundedIcon sx={{ fontSize: "14px !important", ml: "6px !important" }} />
              : <ImageRoundedIcon sx={{ fontSize: "14px !important", ml: "6px !important" }} />}
            label={MEDIA_LABELS[row.media_type]}
            size="small"
            variant="outlined"
            sx={{
              ...ROW_CHIP_SX,
              color: row.media_type === "card" ? "info.dark" : "secondary.dark",
              borderColor: "transparent",
              bgcolor: row.media_type === "card" ? "info.light" : "secondary.light",
              "& .MuiChip-icon": { color: "inherit" },
            }}
          />
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ fontSize: "0.8125rem" }}>
            Unspecified
          </Typography>
        )}
      </TableCell>
      <TableCell sx={{ display: { xs: "none", md: "table-cell" }, maxWidth: 200 }}>
        {row.assigned_store ? (
          <Typography variant="body2" noWrap>{row.assigned_store}</Typography>
        ) : (
          <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic", fontSize: "0.8125rem" }}>
            Unassigned
          </Typography>
        )}
      </TableCell>
      <TableCell align="right">
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: used ? "text.primary" : "text.disabled",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.scan_count}
        </Typography>
      </TableCell>
      <TableCell sx={{ display: { xs: "none", md: "table-cell" }, whiteSpace: "nowrap", color: used ? "text.secondary" : "text.disabled" }}>
        {used ? (
          <Tooltip title={row.last_scanned_at ? new Date(row.last_scanned_at).toLocaleString() : ""} arrow>
            <Typography variant="body2" component="span" sx={{ fontSize: "0.8125rem" }}>
              {formatQrScanWhen(row.last_scanned_at)}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="body2" component="span" sx={{ fontSize: "0.8125rem", color: "text.disabled" }}>
            Never scanned
          </Typography>
        )}
      </TableCell>
      <TableCell>
        <Chip
          label={row.is_active ? "Active" : "Inactive"}
          size="small"
          color={row.is_active ? "success" : "default"}
          variant="outlined"
          sx={{
            ...ROW_CHIP_SX,
            color: row.is_active ? "success.dark" : "text.disabled",
            borderColor: row.is_active ? "success.main" : "divider",
          }}
        />
      </TableCell>
      <TableCell align="right" sx={{ pr: { xs: 1, sm: 1.5 }, whiteSpace: "nowrap" }}>
        <Stack
          direction="row"
          spacing={0.25}
          justifyContent="flex-end"
          sx={{
            "& .MuiIconButton-root": {
              borderRadius: 1.25,
              color: "text.secondary",
              "&:hover": {
                color: "primary.main",
                bgcolor: "action.hover",
              },
            },
          }}
        >
          <Tooltip title="Edit details" arrow>
            <IconButton size="small" onClick={onEdit} aria-label={`Edit ${row.code}`}>
              <EditRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy public URL" arrow>
            <IconButton size="small" onClick={() => copyQrPublicUrl(row.code, toast)} aria-label={`Copy URL for ${row.code}`}>
              <ContentCopyRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Open public URL" arrow>
            <IconButton
              size="small"
              component="a"
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open URL for ${row.code}`}
            >
              <OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </TableCell>
    </TableRow>
  );
}
