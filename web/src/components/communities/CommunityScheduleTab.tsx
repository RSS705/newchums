"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Slider from "@mui/material/Slider";
import Switch from "@mui/material/Switch";
import Select from "@mui/material/Select";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import AppTimePicker from "@/components/fields/AppTimePicker";
import Cropper, { type Area } from "react-easy-crop";
import dayjs, { type Dayjs } from "dayjs";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import PlacesAutocompleteInput, { formatPlaceDisplay } from "@/components/common/PlacesAutocompleteInput";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { apiFetch, getApiBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { formatHour } from "./operatingHours";

export type CommunityScheduleBlock = {
  id: string;
  entryType: "weekly_recurring" | string;
  /** 0 (Sun) ... 6 (Sat) for weekly entries. Null reserved for the
   *  future one-off variant; v1 always renders integer days. */
  dayOfWeek: number | null;
  specificDate: string | null;
  /** "HH:MM:SS" 24-hour. */
  startTime: string;
  endTime: string;
  title: string;
  description: string | null;
  bannerKey: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Optional venue / address. All four fields are nullable; a block
   *  with no location of its own implicitly inherits the parent
   *  community's location at form-fill time but the row itself
   *  carries NULLs until the manager picks one. */
  locationName: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  communityId: string;
  /** Slug used for the `/events/create?community_id=...` deeplink CTA
   *  in the detail dialog. Also lets the schedule banner URL skip the
   *  unauthenticated view path. */
  communitySlug?: string;
  /** Parent community's location, used as the default for newly added
   *  schedule blocks so a manager doesn't have to retype the address
   *  for every recurring slot. All four fields are passed through so
   *  the form can prefill name + verified address + lat/lng together,
   *  not just the display string (which would force a re-pick to land
   *  back at a verified state). Edit flows reuse the saved-on-row
   *  values, not the community defaults. */
  communityLocationName?: string | null;
  communityLocationAddress?: string | null;
  communityLocationLat?: number | null;
  communityLocationLng?: number | null;
  /** True when the viewer holds an authed session. Drives the manager
   *  permission check (super admins are picked up via the API response).
   *  Logged-out viewers can still read public-community schedules. */
  isAuthenticated: boolean;
  /** First-render hint. The list endpoint is the source of truth for
   *  manager permission so super admins (whose role isn't tracked
   *  client-side) still see the manage UI. */
  canManageHint?: boolean;
};

/** Day order: Monday first, Sunday last. Mirrors the visual order of
 *  the operating-hours editor so the two surfaces feel consistent. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LONG: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

const MAX_TITLE_LEN = 120;
const MAX_DESCRIPTION_LEN = 2000;
/** Compressed-output cap matches the API's `MAX_SCHEDULE_BLOCK_BANNER_BYTES`
 *  (400KB). The cropper compresses iteratively until it fits. */
const MAX_THUMBNAIL_BYTES = 400 * 1024;
/** Raw input cap before compression. Matches the community-banner editor. */
const MAX_THUMBNAIL_INPUT_BYTES = 20 * 1024 * 1024;
/** Square thumbnail. The schedule list now uses a compact agenda row
 *  with a small square image on the left, so the saved asset is a
 *  square crop. The cropper output is sized for the largest place we
 *  render it (the detail dialog hero) while staying small enough that
 *  the WebP encode comfortably fits the 400KB ceiling. */
const THUMBNAIL_OUTPUT_SIZE = 600;
const THUMBNAIL_ASPECT = 1;

/** Build the banner URL for a saved block. Cache-busted with the block's
 *  `updatedAt` so a re-uploaded image replaces the cached one without
 *  requiring a force-refresh. */
function buildBannerSrc(communityId: string, block: CommunityScheduleBlock): string | null {
  if (!block.bannerKey) return null;
  const ts = encodeURIComponent(block.updatedAt);
  return `${getApiBaseUrl()}/communities/${communityId}/schedule-blocks/${block.id}/banner?v=${ts}`;
}


function trimToHHMM(t: string | null | undefined): string {
  if (!t) return "";
  // API returns "HH:MM:SS"; the picker + display only care about HH:MM.
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function formatTimeRange(startHHMMSS: string, endHHMMSS: string): string {
  const s = trimToHHMM(startHHMMSS);
  const e = trimToHHMM(endHHMMSS);
  if (!s || !e) return "";
  return `${formatHour(s)} - ${formatHour(e)}`;
}

function hhmmToDayjs(hhmm: string): Dayjs | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return dayjs().hour(h).minute(m).second(0).millisecond(0);
}

function dayjsToHHMM(d: Dayjs | null): string {
  if (!d || !d.isValid()) return "";
  return d.format("HH:mm");
}

/** Strip HTML if a description came back with markup; the API stores
 *  plain text but defense-in-depth keeps the snippet renderer simple. */
function plainSnippet(input: string | null | undefined, max = 140): string {
  if (!input) return "";
  const flat = input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export default function CommunityScheduleTab({
  communityId,
  communitySlug,
  communityLocationName = null,
  communityLocationAddress = null,
  communityLocationLat = null,
  communityLocationLng = null,
  isAuthenticated,
  canManageHint = false,
}: Props) {
  const toast = useToast();
  const [blocks, setBlocks] = useState<CommunityScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(canManageHint);

  // Composer state. `editing` toggles between create + edit modes; the
  // dialog reuses the same form for both flows.
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityScheduleBlock | null>(null);
  const [formDay, setFormDay] = useState<number>(1);
  const [formStart, setFormStart] = useState<Dayjs | null>(null);
  const [formEnd, setFormEnd] = useState<Dayjs | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<{ title?: string; start?: string; end?: string; day?: string }>({});

  // Location is optional. New blocks default to the parent community's
  // location as a frontend convenience; the row itself stores whatever
  // the manager finally submits, so a block can also have its own
  // distinct venue (e.g. a side room, a satellite address).
  const [formLocationName, setFormLocationName] = useState("");
  const [formLocationAddress, setFormLocationAddress] = useState("");
  const [formLocationLat, setFormLocationLat] = useState<number | null>(null);
  const [formLocationLng, setFormLocationLng] = useState<number | null>(null);

  // Load Google Places once the manager could plausibly need the
  // composer. Cheap on logged-out / non-manager viewers because the
  // dialog never opens; the loader is idempotent so a parent surface
  // that already loaded the script is a no-op here.
  useEffect(() => {
    if (!canManage) return;
    loadGooglePlacesScript().catch((err) => {
      console.warn("[CommunityScheduleTab] Google Places script failed to load:", err);
    });
  }, [canManage]);

  // Banner upload state for the composer. `pendingBannerBlob` is a freshly
  // cropped image waiting to be uploaded on save; `pendingBannerPreview`
  // is the local object URL we render in the composer until then;
  // `existingBannerUrl` is the saved-on-server image URL when editing;
  // `clearExistingBanner` is the explicit "remove image" intent for edit
  // flows. Create flows never need that flag, there's nothing to clear.
  const [pendingBannerBlob, setPendingBannerBlob] = useState<Blob | null>(null);
  const [pendingBannerPreview, setPendingBannerPreview] = useState<string | null>(null);
  const [existingBannerUrl, setExistingBannerUrl] = useState<string | null>(null);
  const [clearExistingBanner, setClearExistingBanner] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live-mirror the two object-URL states into refs so the unmount
  // cleanup can revoke whatever's outstanding without depending on
  // stale closure values. Without this, an unmount mid-edit (e.g. tab
  // switch while the cropper or composer is open) leaks the
  // URL.createObjectURL handles for the lifetime of the page.
  const pendingBannerPreviewRef = useRef<string | null>(null);
  const cropImageSrcRef = useRef<string | null>(null);
  pendingBannerPreviewRef.current = pendingBannerPreview;
  cropImageSrcRef.current = cropImageSrc;
  useEffect(() => {
    return () => {
      if (pendingBannerPreviewRef.current) URL.revokeObjectURL(pendingBannerPreviewRef.current);
      if (cropImageSrcRef.current) URL.revokeObjectURL(cropImageSrcRef.current);
    };
  }, []);

  // Per-card overflow + delete confirmation.
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTarget, setMenuTarget] = useState<CommunityScheduleBlock | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityScheduleBlock | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Detail dialog when a viewer clicks a card.
  const [detailTarget, setDetailTarget] = useState<CommunityScheduleBlock | null>(null);

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${communityId}/schedule-blocks`, { auth: isAuthenticated });
      if (!res.ok) {
        setBlocks([]);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        blocks?: CommunityScheduleBlock[];
        viewerCanManage?: boolean;
      };
      if (data.ok && Array.isArray(data.blocks)) {
        setBlocks(data.blocks);
        setCanManage(data.viewerCanManage === true);
      }
    } catch { /* keep existing list on transient failure */ }
    finally { setLoading(false); }
  }, [communityId, isAuthenticated]);

  useEffect(() => {
    setLoading(true);
    fetchBlocks();
  }, [fetchBlocks]);

  // Group by day so the render code stays straightforward.
  const blocksByDay = useMemo(() => {
    const map: Record<number, CommunityScheduleBlock[]> = {};
    for (const b of blocks) {
      if (b.dayOfWeek == null) continue;
      const d = b.dayOfWeek;
      if (!map[d]) map[d] = [];
      map[d].push(b);
    }
    for (const d of Object.keys(map)) {
      map[Number(d)].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return trimToHHMM(a.startTime).localeCompare(trimToHHMM(b.startTime));
      });
    }
    return map;
  }, [blocks]);

  const visibleDays = useMemo(() => DAY_ORDER.filter((d) => blocksByDay[d]?.length), [blocksByDay]);

  /** Drop any pending banner state (preview URLs, blob, clear-flag) so
   *  reopening the composer doesn't carry over the previous session. */
  const resetBannerState = useCallback(() => {
    if (pendingBannerPreview) URL.revokeObjectURL(pendingBannerPreview);
    setPendingBannerPreview(null);
    setPendingBannerBlob(null);
    setExistingBannerUrl(null);
    setClearExistingBanner(false);
  }, [pendingBannerPreview]);

  const openComposerForCreate = (presetDay?: number) => {
    setEditing(null);
    // Default to today's weekday so a manager adding "today's" entry
    // doesn't have to scroll the picker. Falls back to Monday only if
    // dayjs returns something unexpected. Callers (currently none in
    // v1) can still override via `presetDay`.
    const todayDow = dayjs().day();
    const fallbackDow = Number.isFinite(todayDow) && todayDow >= 0 && todayDow <= 6 ? todayDow : 1;
    setFormDay(presetDay ?? fallbackDow);
    setFormStart(null);
    setFormEnd(null);
    setFormTitle("");
    setFormDescription("");
    setFormActive(true);
    setFormErrors({});
    resetBannerState();
    // Default the location to the parent community's so a typical
    // recurring block ("Open play", "Weekly meetup") doesn't make the
    // manager retype the venue. A blank community location leaves the
    // field empty, the manager can pick something or leave it.
    setFormLocationName(communityLocationName ?? "");
    setFormLocationAddress(communityLocationAddress ?? "");
    setFormLocationLat(communityLocationLat ?? null);
    setFormLocationLng(communityLocationLng ?? null);
    setComposerOpen(true);
  };

  const openComposerForEdit = (block: CommunityScheduleBlock) => {
    setEditing(block);
    setFormDay(block.dayOfWeek ?? 1);
    setFormStart(hhmmToDayjs(trimToHHMM(block.startTime)));
    setFormEnd(hhmmToDayjs(trimToHHMM(block.endTime)));
    setFormTitle(block.title);
    setFormDescription(block.description ?? "");
    setFormActive(block.isActive);
    setFormErrors({});
    resetBannerState();
    setExistingBannerUrl(buildBannerSrc(communityId, block));
    // Edit reuses the saved-on-row values verbatim. A row that has
    // no location of its own (older blocks pre-098, or one the
    // manager intentionally cleared) shows an empty field, NOT the
    // community fallback, so editing doesn't silently re-attach a
    // location the manager had already removed.
    setFormLocationName(block.locationName ?? "");
    setFormLocationAddress(block.locationAddress ?? "");
    setFormLocationLat(block.locationLat ?? null);
    setFormLocationLng(block.locationLng ?? null);
    setComposerOpen(true);
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const closeComposer = () => {
    if (formSubmitting) return;
    setComposerOpen(false);
    setEditing(null);
    setFormErrors({});
    resetBannerState();
  };

  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_THUMBNAIL_INPUT_BYTES) {
      toast.error("That image is over 20 MB, pick a smaller one.");
      return;
    }
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    // Wipe the prior crop region so the "Use image" button is disabled
    // until react-easy-crop emits a fresh one for the new image.
    // Without this, hammering Replace and immediately clicking Use
    // image could apply the previous image's crop bounds to the new
    // image until the user nudges it.
    setCroppedAreaPixels(null);
    setCropDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = useCallback((_: Area, areaPx: Area) => {
    setCroppedAreaPixels(areaPx);
  }, []);

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(
        cropImageSrc,
        croppedAreaPixels as PixelCrop,
        THUMBNAIL_OUTPUT_SIZE,
        THUMBNAIL_OUTPUT_SIZE,
        MAX_THUMBNAIL_BYTES,
      );
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      setCropDialogOpen(false);
      if (pendingBannerPreview) URL.revokeObjectURL(pendingBannerPreview);
      setPendingBannerBlob(blob);
      setPendingBannerPreview(URL.createObjectURL(blob));
      // A fresh blob always wins over a "clear existing" intent, the
      // user has changed their mind back to keeping an image.
      setClearExistingBanner(false);
    } catch {
      toast.error("Failed to process image");
    }
  };

  const handleClearBanner = () => {
    if (pendingBannerPreview) URL.revokeObjectURL(pendingBannerPreview);
    setPendingBannerPreview(null);
    setPendingBannerBlob(null);
    if (existingBannerUrl) {
      // Mark for deletion, don't blank the preview yet so the user sees
      // what they're clearing until they Save. Save flushes the intent.
      setClearExistingBanner(true);
      setExistingBannerUrl(null);
    }
  };

  /** Shared upload helper: init → PUT → finalize. Returns true on success.
   *  Emits a toast on failure but doesn't throw, the caller decides
   *  whether to abort the rest of the save flow. */
  const uploadPendingBanner = useCallback(async (blockId: string): Promise<boolean> => {
    if (!pendingBannerBlob) return true;
    const contentType = pendingBannerBlob.type || "image/webp";
    try {
      const initRes = await apiFetch("/media/init", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "community_schedule_block_banner",
          contentType,
          contentLength: pendingBannerBlob.size,
        }),
      });
      const initData = await initRes.json() as { ok?: boolean; uploadUrl?: string; objectKey?: string };
      if (!initData.ok || !initData.uploadUrl || !initData.objectKey) {
        toast.error("Upload failed");
        return false;
      }
      const uploadUrl = `${getApiBaseUrl()}${initData.uploadUrl}`;
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: pendingBannerBlob,
        headers: { "Content-Type": contentType },
        credentials: "omit",
      });
      if (!uploadRes.ok) {
        toast.error("Upload failed");
        return false;
      }
      const finalizeRes = await apiFetch("/media/finalize", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: initData.objectKey,
          purpose: "community_schedule_block_banner",
          communityId,
          scheduleBlockId: blockId,
        }),
      });
      const finalizeData = await finalizeRes.json() as { ok?: boolean };
      if (!finalizeData.ok) {
        toast.error("Couldn't attach the image");
        return false;
      }
      return true;
    } catch {
      toast.error("Upload failed");
      return false;
    }
  }, [pendingBannerBlob, communityId, toast]);

  const handleSubmit = async () => {
    const errs: { title?: string; start?: string; end?: string; day?: string } = {};
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) errs.title = "Add a title";
    else if (trimmedTitle.length > MAX_TITLE_LEN) errs.title = `Keep it under ${MAX_TITLE_LEN} characters`;
    if (!Number.isFinite(formDay) || formDay < 0 || formDay > 6) errs.day = "Pick a day";
    const start = dayjsToHHMM(formStart);
    const end = dayjsToHHMM(formEnd);
    if (!start) errs.start = "Pick a start time";
    if (!end) errs.end = "Pick an end time";
    if (start && end && end <= start) errs.end = "End time must be after start time";
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    setFormSubmitting(true);
    try {
      const path = editing
        ? `/communities/${communityId}/schedule-blocks/${editing.id}`
        : `/communities/${communityId}/schedule-blocks`;
      const description = formDescription.trim();
      const trimmedLocationName = formLocationName.trim();
      const trimmedLocationAddress = formLocationAddress.trim();
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        day_of_week: formDay,
        start_time: start,
        end_time: end,
        description: description.length > 0 ? description : null,
        is_active: formActive,
        // Always send all four fields so PATCH treats this as an
        // explicit location set / clear rather than leaving stale
        // values from a previous save. Empty strings collapse to null
        // server-side, matching the `communities` PATCH semantics.
        location_name: trimmedLocationName.length > 0 ? trimmedLocationName : null,
        location_address: trimmedLocationAddress.length > 0 ? trimmedLocationAddress : null,
        location_lat: formLocationLat,
        location_lng: formLocationLng,
      };
      // Edit flow only: pass `banner_key: null` to clear an existing
      // image. Create flow can't reach this branch since `editing` is
      // null and there's no existing banner to clear yet.
      if (editing && clearExistingBanner && !pendingBannerBlob) {
        payload.banner_key = null;
      }
      const res = await apiFetch(path, {
        auth: true,
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as {
        ok: boolean; message?: string; field?: string;
        block?: CommunityScheduleBlock;
      };
      if (data.ok) {
        // Resolve the block id we should attach an image to. Edit reuses
        // the existing id; create returns the new row.
        const targetId = editing ? editing.id : data.block?.id ?? null;
        if (pendingBannerBlob && targetId) {
          const ok = await uploadPendingBanner(targetId);
          if (!ok) {
            // The text fields saved, only the image failed. Refresh
            // the list so the new/edited block still appears, then
            // bail out of the dialog so the manager can retry the
            // upload from the edit menu.
            await fetchBlocks();
            setComposerOpen(false);
            setEditing(null);
            return;
          }
        }
        toast.success(editing ? "Entry updated" : "Entry added");
        setComposerOpen(false);
        setEditing(null);
        await fetchBlocks();
      } else if (data.field) {
        const f = data.field;
        if (f === "title") setFormErrors({ title: data.message ?? "Check this field" });
        else if (f === "start_time") setFormErrors({ start: data.message ?? "Check this field" });
        else if (f === "end_time") setFormErrors({ end: data.message ?? "Check this field" });
        else if (f === "day_of_week") setFormErrors({ day: data.message ?? "Check this field" });
        else toast.error(data.message ?? "Something needs fixing");
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await apiFetch(`/communities/${communityId}/schedule-blocks/${deleteTarget.id}`, {
        auth: true, method: "DELETE",
      });
      const data = await res.json() as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Entry removed");
        setDeleteTarget(null);
        await fetchBlocks();
      } else {
        toast.error(data.message ?? "Couldn't remove the entry");
      }
    } catch { toast.error("Something went wrong"); }
    finally { setDeleteSubmitting(false); }
  };

  // Section header is suppressed when the list is empty: the empty-state
  // card already owns the heading + manager CTA, matching the
  // announcements pattern.
  const showSectionHeader = blocks.length > 0;

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {showSectionHeader && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 0.25, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" }, fontWeight: 700, lineHeight: 1.3 }}
            >
              Schedule
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", mt: 0.125 }}>
              Regular weekly activity times for this community.
            </Typography>
          </Box>
          {canManage && (
            <AppButton
              variant="text"
              size="small"
              startIcon={<AddCircleRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={() => openComposerForCreate()}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                color: "primary.main",
                flexShrink: 0,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Add entry</Box>
              <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>Add</Box>
            </AppButton>
          )}
        </Stack>
      )}

      {loading && blocks.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : blocks.length === 0 ? (
        <AppCard>
          <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 }, px: { xs: 2, sm: 3 } }}>
            <Box
              sx={{
                width: 64, height: 64, borderRadius: "50%",
                bgcolor: "primary.light",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <EventAvailableRoundedIcon sx={{ fontSize: 32, color: "primary.main" }} />
            </Box>
            <Box sx={{ textAlign: "center", maxWidth: 460 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                No schedule yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {canManage
                  ? "Add the regular weekly times your community uses. Visitors will see them on this page."
                  : "Regular weekly activity times will appear here once the community adds them."}
              </Typography>
            </Box>
            {canManage && (
              <AppButton
                variant="contained"
                startIcon={<AddCircleRoundedIcon />}
                onClick={() => openComposerForCreate()}
                sx={{
                  textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, mt: 1,
                  boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Add entry
              </AppButton>
            )}
          </Stack>
        </AppCard>
      ) : (
        <Stack spacing={{ xs: 3, sm: 4 }}>
          {visibleDays.map((day) => {
            const dayBlocks = blocksByDay[day] ?? [];
            return (
              <Box key={day}>
                {/* Day header. Intentionally dominant: a large, heavy
                    weekday name with a primary-color underline anchors
                    the section so the page reads as an agenda ("under
                    Tuesday, these are the regular times"), not a feed.
                    Sized closer to a section heading than a label, so
                    the eye lands on the day before the entries. */}
                <Box sx={{ mb: { xs: 1.25, sm: 1.5 } }}>
                  <Typography
                    component="h3"
                    sx={{
                      fontSize: { xs: "1.5rem", sm: "1.75rem" },
                      fontWeight: 800,
                      lineHeight: 1.15,
                      letterSpacing: "-0.01em",
                      color: "text.primary",
                    }}
                  >
                    {DAY_LONG[day]}
                  </Typography>
                  <Box
                    aria-hidden="true"
                    sx={{
                      mt: 0.75,
                      width: 36,
                      height: 3,
                      borderRadius: 1.5,
                      bgcolor: "primary.main",
                    }}
                  />
                </Box>

                {/* Compact agenda rows under the day. No card chrome:
                    the rows share a single hairline divider treatment
                    so each day reads as a small table, not a card
                    gallery. Hover tints the row to keep it feeling
                    interactive without inflating its visual weight. */}
                <Box
                  sx={{
                    borderTop: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  {dayBlocks.map((b) => {
                    const isInactive = !b.isActive;
                    const startLabel = formatHour(trimToHHMM(b.startTime));
                    const endLabel = formatHour(trimToHHMM(b.endTime));
                    const snippet = plainSnippet(b.description, 90);
                    const thumbnailSrc = buildBannerSrc(communityId, b);
                    // Hide a per-entry location when it's identical to
                    // the parent community's location. The brief notes
                    // that repeating the community address on every
                    // entry is low-value noise; we only surface
                    // location when the entry has a meaningfully
                    // different one. We compare on the verified
                    // address (or name when address is missing) so a
                    // user-typed variation of the same place doesn't
                    // get swallowed.
                    const shouldShowLocation =
                      !!b.locationName &&
                      (
                        (b.locationAddress && communityLocationAddress
                          ? b.locationAddress.trim().toLowerCase() !== communityLocationAddress.trim().toLowerCase()
                          : true)
                        && (b.locationName && communityLocationName
                          ? b.locationName.trim().toLowerCase() !== communityLocationName.trim().toLowerCase()
                          : true)
                      );
                    return (
                      <Box
                        key={b.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setDetailTarget(b)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setDetailTarget(b);
                          }
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: { xs: 1.25, sm: 1.75 },
                          py: { xs: 1.25, sm: 1.5 },
                          px: { xs: 0.5, sm: 0.75 },
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          opacity: isInactive ? 0.6 : 1,
                          cursor: "pointer",
                          transition: "background-color 120ms ease-out",
                          "&:hover": { bgcolor: "action.hover" },
                          "&:focus-visible": {
                            outline: "2px solid",
                            outlineColor: "primary.main",
                            outlineOffset: -2,
                          },
                        }}
                      >
                        {/* Time column. Dominant on the left so the
                            row reads as "this happens at X". Stacked
                            start/end with a light "to" label keeps
                            the column narrow on mobile. Width is set
                            to comfortably hold the worst-case label
                            ("12:30 PM") without truncation, plus a
                            little breathing room. */}
                        <Box
                          sx={{
                            flexShrink: 0,
                            width: { xs: 76, sm: 92 },
                            textAlign: "left",
                            pt: 0.25,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: { xs: "0.9375rem", sm: "1rem" },
                              fontWeight: 700,
                              color: "primary.main",
                              lineHeight: 1.2,
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {startLabel}
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                              color: "text.disabled",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              mt: 0.25,
                              lineHeight: 1.1,
                            }}
                          >
                            to
                          </Typography>
                          <Typography
                            sx={{
                              fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                              fontWeight: 600,
                              color: "text.secondary",
                              lineHeight: 1.2,
                              fontVariantNumeric: "tabular-nums",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {endLabel}
                          </Typography>
                        </Box>

                        {/* Square thumbnail (or initial fallback).
                            Sized small so the row stays compact; the
                            detail dialog promotes the same asset to
                            a larger hero. Falls back to a primary-
                            tinted square with the entry's first
                            letter when no image is uploaded. */}
                        <Box
                          aria-hidden="true"
                          sx={{
                            flexShrink: 0,
                            width: { xs: 48, sm: 56 },
                            height: { xs: 48, sm: 56 },
                            borderRadius: 1.5,
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundImage: thumbnailSrc
                              ? `url("${thumbnailSrc}")`
                              : "linear-gradient(135deg, rgba(230,91,19,0.18) 0%, rgba(230,91,19,0.06) 100%)",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            color: "primary.dark",
                            fontWeight: 700,
                          }}
                        >
                          {!thumbnailSrc && (
                            <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "primary.main" }}>
                              {b.title.trim().charAt(0).toUpperCase() || "•"}
                            </Typography>
                          )}
                        </Box>

                        {/* Title + supporting line. Title gets weight,
                            description is one line truncated, location
                            (when distinct from the community) is a
                            small secondary line. */}
                        <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
                          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                            <Typography
                              sx={{
                                fontSize: { xs: "0.9375rem", sm: "1rem" },
                                fontWeight: 700,
                                lineHeight: 1.3,
                                wordBreak: "break-word",
                                // Keep rows uniformly compact: clamp
                                // the title to two lines max with an
                                // ellipsis. The detail dialog is the
                                // place for the full title.
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {b.title}
                            </Typography>
                            {isInactive && (
                              <Chip
                                label="Hidden"
                                size="small"
                                sx={{
                                  height: 18, fontSize: "0.6875rem", fontWeight: 700,
                                  bgcolor: "grey.200", color: "text.secondary",
                                }}
                              />
                            )}
                          </Stack>
                          {snippet && (
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              sx={{
                                fontSize: { xs: "0.8125rem", sm: "0.875rem" },
                                lineHeight: 1.4,
                                mt: 0.25,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                display: "-webkit-box",
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {snippet}
                            </Typography>
                          )}
                          {shouldShowLocation && (
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.5}
                              sx={{ color: "text.secondary", mt: 0.25 }}
                            >
                              <PlaceRoundedIcon sx={{ fontSize: 13 }} />
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: "0.75rem",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {b.locationName}
                              </Typography>
                            </Stack>
                          )}
                        </Box>

                        {canManage && (
                          <IconButton
                            size="small"
                            aria-label="Entry actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuAnchor(e.currentTarget);
                              setMenuTarget(b);
                            }}
                            sx={{ ml: 0.5, mt: -0.25 }}
                          >
                            <MoreVertRoundedIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Per-card overflow menu (manager only). */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuTarget(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { minWidth: 180, borderRadius: 2.5, mt: 0.5 } } }}
      >
        <MenuItem onClick={() => menuTarget && openComposerForEdit(menuTarget)}>
          <ListItemIcon>
            <EditRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuTarget) setDeleteTarget(menuTarget);
            setMenuAnchor(null);
            setMenuTarget(null);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteOutlineRoundedIcon fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText>Remove</ListItemText>
        </MenuItem>
      </Menu>

      {/* Composer dialog: shared between create + edit. */}
      <Dialog
        open={composerOpen}
        onClose={closeComposer}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {editing ? "Edit entry" : "Add a schedule entry"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2}>
            {/* Image. The schedule list renders a small square
                thumbnail next to each entry, so the saved asset is a
                1:1 crop. The composer preview / dropzone is also
                square to match what the row will end up showing. The
                upload runs on Save (after the API has created or
                matched the row id, since /media/finalize needs
                `scheduleBlockId`). When editing, the existing image
                renders as the preview until the user picks a new one
                or clears it. */}
            <Box>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <ImageRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="subtitle2" fontWeight={600}>
                  Image (optional)
                </Typography>
              </Stack>
              {(pendingBannerPreview || existingBannerUrl) ? (
                // Image preview + actions row. Image rendered as a real
                // `<img>` with `object-fit: cover` so the saved square
                // asset displays at the same intrinsic ratio it was
                // cropped at, never stretched. The action buttons sit
                // vertically centered next to the image so the row
                // doesn't have an awkward block of empty space under
                // the buttons.
                <Stack direction="row" spacing={1.75} alignItems="center">
                  <Box
                    component="img"
                    // The outer ternary guarantees one of these is
                    // truthy; the assertion just satisfies TS.
                    src={(pendingBannerPreview ?? existingBannerUrl) as string}
                    alt=""
                    sx={{
                      width: { xs: 96, sm: 112 },
                      height: { xs: 96, sm: 112 },
                      flexShrink: 0,
                      borderRadius: 2,
                      objectFit: "cover",
                      objectPosition: "center",
                      bgcolor: "grey.100",
                      border: "1px solid",
                      borderColor: "divider",
                      display: "block",
                    }}
                  />
                  <Stack
                    spacing={0.5}
                    sx={{
                      minWidth: 0,
                      flex: 1,
                      alignItems: "flex-start",
                    }}
                  >
                    <AppButton
                      variant="outlined"
                      size="small"
                      startIcon={<EditRoundedIcon fontSize="small" />}
                      onClick={() => fileInputRef.current?.click()}
                      sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        borderRadius: 2,
                      }}
                    >
                      Replace
                    </AppButton>
                    <AppButton
                      variant="text"
                      size="small"
                      color="error"
                      startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
                      onClick={handleClearBanner}
                      sx={{
                        textTransform: "none",
                        fontWeight: 600,
                        ml: -0.5,
                      }}
                    >
                      Remove image
                    </AppButton>
                  </Stack>
                </Stack>
              ) : (
                <Box
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 0.5,
                    width: { xs: 96, sm: 112 },
                    height: { xs: 96, sm: 112 },
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 2,
                    color: "text.secondary",
                    cursor: "pointer",
                    transition: "background-color 120ms ease-out, border-color 120ms ease-out",
                    "&:hover": { bgcolor: "action.hover", borderColor: "primary.main", color: "primary.main" },
                  }}
                >
                  <AddPhotoAlternateRoundedIcon sx={{ fontSize: 26 }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
                    Add image
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6875rem", lineHeight: 1.1 }}>
                    Square crop
                  </Typography>
                </Box>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleBannerFileSelect}
                style={{ display: "none" }}
              />
            </Box>

            <AppTextField
              label="Title"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              error={!!formErrors.title}
              helperText={formErrors.title ?? null}
              inputProps={{ maxLength: MAX_TITLE_LEN }}
              autoFocus
            />
            <FormControl fullWidth error={!!formErrors.day}>
              <InputLabel id="schedule-day-label">Day</InputLabel>
              <Select
                labelId="schedule-day-label"
                label="Day"
                value={formDay}
                onChange={(e) => setFormDay(Number(e.target.value))}
              >
                {DAY_ORDER.map((d) => (
                  <MenuItem key={d} value={d}>{DAY_LONG[d]}</MenuItem>
                ))}
              </Select>
              {formErrors.day && (
                <Typography variant="caption" color="error.main" sx={{ mt: 0.5 }}>
                  {formErrors.day}
                </Typography>
              )}
            </FormControl>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <AppTimePicker
                  label="Start time"
                  value={formStart}
                  onChange={setFormStart}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!formErrors.start,
                      helperText: formErrors.start ?? null,
                    },
                  }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <AppTimePicker
                  label="End time"
                  value={formEnd}
                  onChange={setFormEnd}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      error: !!formErrors.end,
                      helperText: formErrors.end ?? null,
                    },
                  }}
                />
              </Box>
            </Stack>
            {/* Location. Optional; defaults to the parent community's
                address on create so a recurring slot doesn't force the
                manager to re-pick the venue every time. The same
                Google Places Autocomplete component the rest of the
                app uses, so the verified-pick behavior is consistent.
                Tab navigation and lat/lng capture are inherited. */}
            <PlacesAutocompleteInput
              value={formLocationName}
              onChange={(v) => {
                setFormLocationName(v);
                // PlacesAutocompleteInput only emits pick-verified
                // values or an explicit clear, so an empty value is a
                // signal to drop the related coordinates as well.
                if (!v.trim()) {
                  setFormLocationAddress("");
                  setFormLocationLat(null);
                  setFormLocationLng(null);
                }
              }}
              onPlaceSelect={(result) => {
                setFormLocationName(formatPlaceDisplay(result));
                setFormLocationAddress(result.formattedAddress);
                setFormLocationLat(result.lat);
                setFormLocationLng(result.lng);
              }}
              label="Location (optional)"
              placeholder="Search for a venue or address"
              placeTypes={[]}
              inputId="places-autocomplete-schedule-block"
            />

            <RichTextEditor
              label="Description (optional)"
              value={formDescription}
              onChange={setFormDescription}
              placeholder="Share what happens during this time, who can come, what to expect."
              maxLength={MAX_DESCRIPTION_LEN}
            />

            <Box
              component="label"
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                px: 1,
                py: 0.5,
                ml: -1,
                borderRadius: 1.5,
                cursor: "pointer",
                userSelect: "none",
                transition: "background-color 120ms ease-out",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <Switch
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                sx={{ flexShrink: 0 }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Visible on the community page
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.45 }}>
                  Turn off to hide this entry without deleting it.
                </Typography>
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "flex-end",
            gap: 1,
            px: 3,
            pb: 2.5,
          }}
        >
          <AppButton
            variant="text"
            onClick={closeComposer}
            disabled={formSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            onClick={handleSubmit}
            disabled={formSubmitting}
            startIcon={formSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {formSubmitting ? "Saving…" : editing ? "Save" : "Add"}
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation. Soft-deletes server-side. */}
      <Dialog
        open={!!deleteTarget}
        onClose={deleteSubmitting ? undefined : () => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>Remove this entry?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This removes the entry from the schedule. Visitors will no longer see it.
          </Typography>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "flex-end",
            gap: 1,
            px: 3,
            pb: 2.5,
          }}
        >
          <AppButton
            variant="text"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleteSubmitting}
            startIcon={deleteSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {deleteSubmitting ? "Removing…" : "Remove"}
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Image cropper. Square (1:1) fixed aspect to match the
          schedule list thumbnail and the detail dialog hero;
          getCroppedImg compresses the result to WebP under
          MAX_THUMBNAIL_BYTES so it always fits the API cap. */}
      <Dialog
        open={cropDialogOpen}
        onClose={() => {
          if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
          setCropImageSrc(null);
          setCropDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>Crop image</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ position: "relative", width: "100%", aspectRatio: `${THUMBNAIL_ASPECT}`, bgcolor: "grey.900", borderRadius: 2, overflow: "hidden" }}>
            {cropImageSrc && (
              <Cropper
                image={cropImageSrc}
                crop={cropPosition}
                zoom={cropZoom}
                aspect={THUMBNAIL_ASPECT}
                onCropChange={setCropPosition}
                onZoomChange={setCropZoom}
                onCropComplete={handleCropComplete}
                showGrid={false}
              />
            )}
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
              Zoom
            </Typography>
            <Slider
              value={cropZoom}
              min={1}
              max={3}
              step={0.05}
              onChange={(_, v) => setCropZoom(typeof v === "number" ? v : v[0])}
            />
          </Box>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "flex-end",
            gap: 1,
            px: 3,
            pb: 2.5,
          }}
        >
          <AppButton
            variant="text"
            onClick={() => {
              if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
              setCropImageSrc(null);
              setCropDialogOpen(false);
            }}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            onClick={handleCropSave}
            disabled={!croppedAreaPixels}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Use image
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Detail dialog. Visitors get the full description + manager
          actions are surfaced via the same overflow menu shape from the
          card view (Edit / Remove) so the workflow is consistent. */}
      <Dialog
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {detailTarget && (() => {
          const day = detailTarget.dayOfWeek;
          const dayLabel = day != null ? DAY_LONG[day] : "";
          const detailBannerSrc = buildBannerSrc(communityId, detailTarget);
          // "Start a plan during this time" deeplink. Builds
          // `?community_id=...&day=N&start_hhmm=HH:MM&end_hhmm=HH:MM`
          // so the create form can prefill the date (next future
          // occurrence of that weekday), the start time, and the
          // community link. Only shown to authenticated viewers, the
          // create surface itself is auth-gated.
          const startPlanHref = (() => {
            if (!isAuthenticated) return null;
            if (day == null) return null;
            const params = new URLSearchParams();
            params.set("community_id", communityId);
            params.set("day", String(day));
            params.set("start_hhmm", trimToHHMM(detailTarget.startTime));
            params.set("end_hhmm", trimToHHMM(detailTarget.endTime));
            if (communitySlug) params.set("from_schedule_slug", communitySlug);
            return `/events/create?${params.toString()}`;
          })();
          return (
            <>
              {detailBannerSrc && (
                // Square hero matching the saved asset shape and the
                // compact thumbnail used in the list. Bounded width so
                // the dialog still feels like a content panel rather
                // than a photo viewer; fades into a soft surround so
                // the title below reads as the primary anchor.
                <Box
                  sx={{
                    px: { xs: 2.5, sm: 3 },
                    pt: { xs: 2.5, sm: 3 },
                    pb: 0.5,
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 160, sm: 180 },
                      height: { xs: 160, sm: 180 },
                      borderRadius: 2,
                      backgroundImage: `url("${detailBannerSrc}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: "grey.100",
                      mx: "auto",
                    }}
                    aria-hidden="true"
                  />
                </Box>
              )}
              <DialogTitle sx={{ pb: 0.5, textAlign: detailBannerSrc ? "center" : "left" }}>
                {detailTarget.title}
              </DialogTitle>
              <DialogContent sx={{ pt: 1 }}>
                <Stack spacing={1.75}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ color: "text.secondary" }}>
                    <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontSize: "0.9375rem" }}>
                      {dayLabel}
                      {dayLabel && " · "}
                      {formatTimeRange(detailTarget.startTime, detailTarget.endTime)}
                    </Typography>
                  </Stack>
                  {detailTarget.locationName && (() => {
                    // Link to Google Maps when we have a verified
                    // address; fall back to plain text otherwise. The
                    // Google Maps URL uses the formatted address (or
                    // lat/lng when available) so the deeplink lands at
                    // the exact pin Google verified during the pick.
                    const mapsHref = detailTarget.locationLat != null && detailTarget.locationLng != null
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${detailTarget.locationLat},${detailTarget.locationLng}`,
                        )}`
                      : detailTarget.locationAddress
                        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailTarget.locationAddress)}`
                        : null;
                    return (
                      <Stack
                        direction="row"
                        alignItems="flex-start"
                        spacing={1}
                        sx={{ color: "text.secondary" }}
                      >
                        <PlaceRoundedIcon sx={{ fontSize: 18, mt: 0.25 }} />
                        <Box sx={{ minWidth: 0 }}>
                          {mapsHref ? (
                            <Link
                              href={mapsHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "inherit", textDecoration: "none" }}
                            >
                              <Typography
                                variant="body2"
                                sx={{
                                  fontSize: "0.9375rem",
                                  fontWeight: 600,
                                  color: "primary.main",
                                  textDecorationColor: "rgba(0,0,0,0.2)",
                                  "&:hover": { textDecoration: "underline" },
                                  wordBreak: "break-word",
                                }}
                              >
                                {detailTarget.locationName}
                              </Typography>
                            </Link>
                          ) : (
                            <Typography
                              variant="body2"
                              sx={{ fontSize: "0.9375rem", fontWeight: 600, wordBreak: "break-word" }}
                            >
                              {detailTarget.locationName}
                            </Typography>
                          )}
                          {detailTarget.locationAddress &&
                            detailTarget.locationAddress !== detailTarget.locationName && (
                              <Typography
                                variant="caption"
                                sx={{ display: "block", fontSize: "0.8125rem", color: "text.secondary", lineHeight: 1.45, wordBreak: "break-word" }}
                              >
                                {detailTarget.locationAddress}
                              </Typography>
                            )}
                        </Box>
                      </Stack>
                    );
                  })()}
                  {detailTarget.description && (
                    // Sanitized HTML body. Same allow-list as community
                    // / plan / announcement descriptions
                    // (`sanitizeDescriptionHtml` runs server-side on
                    // POST + PATCH). Style block matches the
                    // announcement card body so paragraph spacing,
                    // lists, and links read consistently across the
                    // app. We omit the slot entirely when empty: a
                    // schedule entry's title + day + time often
                    // stands on its own (e.g. "Friday: Open play"),
                    // and a "no description" placeholder there reads
                    // as visual noise.
                    <Box
                      sx={{
                        fontSize: "0.9375rem",
                        lineHeight: 1.6,
                        color: "text.primary",
                        wordBreak: "break-word",
                        "& p": { m: 0, mb: 1 },
                        "& p:last-child": { mb: 0 },
                        "& ul, & ol": { pl: 3, mb: 1 },
                        "& a": { color: "primary.main", textDecorationColor: "rgba(0,0,0,0.2)" },
                      }}
                      dangerouslySetInnerHTML={{ __html: detailTarget.description }}
                    />
                  )}
                  {!detailTarget.isActive && canManage && (
                    <Chip
                      label="Hidden from visitors"
                      size="small"
                      sx={{ alignSelf: "flex-start", height: 22, fontSize: "0.6875rem", fontWeight: 700, bgcolor: "grey.200", color: "text.secondary" }}
                    />
                  )}
                  {startPlanHref && (
                    <AppButton
                      component={Link}
                      href={startPlanHref}
                      variant="outlined"
                      size="small"
                      startIcon={<AddCircleRoundedIcon sx={{ fontSize: 18 }} />}
                      sx={{
                        alignSelf: "flex-start",
                        textTransform: "none",
                        fontWeight: 600,
                        borderRadius: 2,
                        mt: 0.5,
                      }}
                    >
                      Start a plan during this time
                    </AppButton>
                  )}
                </Stack>
              </DialogContent>
              <DialogActions
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column-reverse", sm: "row" },
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between",
                  gap: 1,
                  px: 3,
                  pb: 2.5,
                }}
              >
                <Box sx={{ width: { xs: "100%", sm: "auto" } }}>
                  {canManage && (
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <AppButton
                        variant="text"
                        startIcon={<EditRoundedIcon fontSize="small" />}
                        onClick={() => {
                          const target = detailTarget;
                          setDetailTarget(null);
                          if (target) openComposerForEdit(target);
                        }}
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        variant="text"
                        color="error"
                        startIcon={<DeleteOutlineRoundedIcon fontSize="small" />}
                        onClick={() => {
                          const target = detailTarget;
                          setDetailTarget(null);
                          if (target) setDeleteTarget(target);
                        }}
                        sx={{ width: { xs: "100%", sm: "auto" } }}
                      >
                        Remove
                      </AppButton>
                    </Stack>
                  )}
                </Box>
                <AppButton
                  variant="contained"
                  onClick={() => setDetailTarget(null)}
                  sx={{ width: { xs: "100%", sm: "auto" } }}
                >
                  Close
                </AppButton>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>
    </Stack>
  );
}
