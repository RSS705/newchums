"use client";

import { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

export type QrMediaType = "card" | "poster";

export type QrRedirectRow = {
  id: string;
  code: string;
  title: string;
  destination_url: string;
  notes: string | null;
  is_active: boolean;
  media_type: QrMediaType | null;
  assigned_store: string | null;
  campaign_variant: string | null;
  created_at: string;
  updated_at: string;
  scan_count: number;
  last_scanned_at: string | null;
};

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  onSaved: (row: QrRedirectRow) => void;
  /** Required when mode === "edit". Ignored otherwise. */
  item?: QrRedirectRow | null;
  /** Existing distinct stores from the list, used to populate the Store
   *  Autocomplete suggestions. The user can still type a new value. */
  knownStores?: string[];
};

/** Single shared dialog used for both creating new QR codes and editing
 *  existing ones. We keep create + edit in one component because the field
 *  set is identical (only the submit endpoint and title differ); duplicating
 *  the form would be the kind of drift the parity rule warns about. */
export function QrFormDialog({ mode, open, onClose, onSaved, item, knownStores = [] }: Props) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [mediaType, setMediaType] = useState<"" | QrMediaType>("");
  const [assignedStore, setAssignedStore] = useState("");
  const [campaignVariant, setCampaignVariant] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Hydrate state when the dialog opens. For create mode we reset to empty
  // defaults; for edit mode we hydrate from the item. setState-in-effect is
  // the right shape here since the hydration is driven by an external
  // trigger (`open` flipping true, or the item changing).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && item) {
      setCode(item.code);
      setTitle(item.title);
      setDestination(item.destination_url);
      setNotes(item.notes ?? "");
      setIsActive(item.is_active);
      setMediaType(item.media_type ?? "");
      setAssignedStore(item.assigned_store ?? "");
      setCampaignVariant(item.campaign_variant ?? "");
    } else {
      setCode("");
      setTitle("");
      setDestination("");
      setNotes("");
      setIsActive(true);
      setMediaType("");
      setAssignedStore("");
      setCampaignVariant("");
    }
  }, [open, mode, item]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const dialogTitle = mode === "create" ? "New QR code" : "Edit QR code";
  const submitLabel = mode === "create" ? "Create" : "Save";

  const codeHelper = useMemo(() => {
    if (mode === "create") return "Letters, digits, dashes, underscores. 2 to 64 chars (e.g. C001-01, S001-02).";
    return "Changing the code updates the public URL. Old posters will redirect to the homepage.";
  }, [mode]);

  const handleSubmit = async () => {
    if (submitting) return;
    if (!code.trim() || !title.trim() || !destination.trim()) {
      toast.error("Code, title, and destination are required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        code: code.trim(),
        title: title.trim(),
        destination_url: destination.trim(),
        notes: notes.trim() || null,
        is_active: isActive,
        media_type: mediaType || null,
        assigned_store: assignedStore.trim() || null,
        campaign_variant: campaignVariant.trim() || null,
      };
      const res = mode === "create"
        ? await apiFetch("/admin/qr-redirects", {
            auth: true,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch(`/admin/qr-redirects/${item!.id}`, {
            auth: true,
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = (await res.json()) as { ok?: boolean; item?: QrRedirectRow; error?: string; message?: string };
      if (!res.ok || !data.ok || !data.item) {
        toast.error(data.message || mapErrorMessage(data.error) || "Could not save QR code");
        setSubmitting(false);
        return;
      }
      toast.success(mode === "create" ? "QR code created" : "Saved");
      // Server response doesn't carry scan totals (those live on the list /
      // detail summary endpoints). Carry over whatever we have on the input
      // item so the list row keeps its existing counts after an inline edit.
      const merged: QrRedirectRow = {
        ...(item ?? {
          scan_count: 0,
          last_scanned_at: null,
        } as QrRedirectRow),
        ...data.item,
        scan_count: item?.scan_count ?? 0,
        last_scanned_at: item?.last_scanned_at ?? null,
      };
      onSaved(merged);
    } catch {
      toast.error("Could not save QR code");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={() => { if (!submitting) onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{dialogTitle}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. C001-01"
            helperText={codeHelper}
            autoFocus={mode === "create"}
            fullWidth
            size="small"
            inputProps={{ maxLength: 64, style: { fontFamily: "monospace" } }}
          />
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rook & Pawn proxy card"
            fullWidth
            size="small"
            inputProps={{ maxLength: 200 }}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="qr-media-type">Media type</InputLabel>
              <Select
                labelId="qr-media-type"
                label="Media type"
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as "" | QrMediaType)}
              >
                <MenuItem value="">
                  <em>Unspecified</em>
                </MenuItem>
                <MenuItem value="card">Card</MenuItem>
                <MenuItem value="poster">Poster</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Variant"
              value={campaignVariant}
              onChange={(e) => setCampaignVariant(e.target.value)}
              placeholder="e.g. V1, V2"
              size="small"
              fullWidth
              inputProps={{ maxLength: 64 }}
              helperText="Optional. Tag for the creative or ad design variant."
            />
          </Stack>
          <Autocomplete
            freeSolo
            options={knownStores}
            value={assignedStore}
            onChange={(_, v) => setAssignedStore(typeof v === "string" ? v : "")}
            onInputChange={(_, v) => setAssignedStore(v)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Assigned store"
                placeholder="Pick or type a store name"
                helperText="Leave blank to mark as unassigned / available for future use."
                size="small"
                inputProps={{ ...params.inputProps, maxLength: 200 }}
              />
            )}
          />
          <TextField
            label="Destination URL"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="https://newchums.com/communities/..."
            helperText="Must be an absolute http(s) URL. The redirect lives at /qr/CODE on newchums.com."
            fullWidth
            size="small"
            inputProps={{ maxLength: 2048 }}
          />
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional. Print run, contact, reassignment notes."
            fullWidth
            size="small"
            multiline
            minRows={2}
            inputProps={{ maxLength: 2000 }}
          />
          <Box>
            <FormControlLabel
              control={<Switch checked={isActive} onChange={(_, v) => setIsActive(v)} />}
              label={isActive ? "Active" : "Inactive (falls back to the homepage)"}
            />
            {!isActive && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", ml: 4 }}>
                Posters using this code will land on the homepage until reactivated.
              </Typography>
            )}
          </Box>
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
          {submitting ? <CircularProgress size={18} color="inherit" /> : submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function mapErrorMessage(code?: string): string | null {
  switch (code) {
    case "INVALID_CODE": return "Code must be 2 to 64 chars of A-Z, 0-9, '-' or '_' and start with an alphanumeric.";
    case "INVALID_TITLE": return "Title is required.";
    case "INVALID_DESTINATION": return "Destination must be an absolute http(s) URL.";
    case "INVALID_MEDIA_TYPE": return "Media type must be Card, Poster, or Unspecified.";
    case "CODE_TAKEN": return "A QR code with that identifier already exists.";
    case "NOT_FOUND": return "This QR code no longer exists.";
    default: return null;
  }
}
