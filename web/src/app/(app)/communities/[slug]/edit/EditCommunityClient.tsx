"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import FormControlLabel from "@mui/material/FormControlLabel";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import Cropper, { type Area } from "react-easy-crop";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";
import { apiFetch, getApiBaseUrl, getAvatarBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { scrollToFirstError } from "@/lib/scrollToFirstError";

const FIELD_ORDER = ["name", "description", "hobby", "location", "website"] as const;

export default function EditCommunityClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<HobbyOption[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [website, setWebsite] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [access, setAccess] = useState<"open" | "private">("open");

  // Logo state
  const [existingAvatarKey, setExistingAvatarKey] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close community state
  const [closing, setClosing] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  // Field refs for scroll-to-first-error
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const setFieldRef = useCallback(
    (key: string) => (el: HTMLElement | null) => { fieldRefs.current[key] = el; },
    [],
  );

  useEffect(() => {
    loadGooglePlacesScript().catch((err) => {
      console.warn("[EditCommunityClient] Google Places script failed to load:", err);
    });
  }, []);

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${slug}`, { auth: true });
      const data = await res.json();
      if (data.ok && data.community) {
        const c = data.community;
        setCommunityId(c.id);
        setName(c.name || "");
        setDescription(c.description || "");
        setAccess(c.visibility === "private" ? "private" : "open");
        setIsOnline(c.is_online === true);
        setWebsite(c.website || "");
        setJoinLink(c.join_link || "");
        setLocationName(c.location_name || "");
        setLocationAddress(c.location_address || "");
        setLocationLat(c.location_lat ?? null);
        setLocationLng(c.location_lng ?? null);
        setExistingAvatarKey(c.avatar_key ?? null);
        setIsOwner(data.viewerMembership?.role === "owner");
        // Load hobbies
        if (Array.isArray(c.hobbies)) {
          setSelectedHobbies(c.hobbies.map((h: { name: string; slug: string }) => ({ name: h.name, slug: h.slug })));
        }
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please use JPEG, PNG, or WebP.");
      return;
    }
    const url = URL.createObjectURL(file);
    setCropImageSrc(url);
    setCropDialogOpen(true);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels as PixelCrop);
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      setCropDialogOpen(false);
      setLogoBlob(blob);
      setLogoPreview(URL.createObjectURL(blob));
    } catch {
      toast.error("Failed to process image");
    }
  };

  const uploadLogo = async () => {
    if (!logoBlob || !communityId) return;
    setLogoUploading(true);
    const contentType = logoBlob.type || "image/webp";
    try {
      const initRes = await apiFetch("/media/init", {
        auth: true, method: "POST",
        body: JSON.stringify({ purpose: "community_avatar", contentType, contentLength: logoBlob.size }),
      });
      const initData = await initRes.json() as { ok?: boolean; uploadUrl?: string; objectKey?: string };
      if (!initData.ok || !initData.uploadUrl || !initData.objectKey) { toast.error("Upload failed"); return; }
      const uploadUrl = `${getApiBaseUrl()}${initData.uploadUrl}`;
      const uploadRes = await fetch(uploadUrl, { method: "PUT", body: logoBlob, headers: { "Content-Type": contentType }, credentials: "omit" });
      if (!uploadRes.ok) { toast.error("Upload failed"); return; }
      const finalizeRes = await apiFetch("/media/finalize", {
        auth: true, method: "POST",
        body: JSON.stringify({ objectKey: initData.objectKey, purpose: "community_avatar", communityId }),
      });
      const finalizeData = await finalizeRes.json() as { ok?: boolean };
      if (finalizeData.ok) {
        setExistingAvatarKey(initData.objectKey!);
        setLogoBlob(null);
        toast.success("Logo updated");
      }
    } catch { toast.error("Upload failed"); }
    setLogoUploading(false);
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Give your community a name";
    if (!description.trim() || description.replace(/<[^>]*>/g, "").trim().length === 0) errs.description = "Add a description so people know what this community is about";
    if (selectedHobbies.length === 0) errs.hobby = "Add at least one hobby so people can find this community";
    if (!isOnline && !locationName.trim() && !locationAddress.trim()) errs.location = "Add a location for your community";
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      if (logoBlob) await uploadLogo();

      const res = await apiFetch(`/communities/${slug}`, {
        auth: true, method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          is_online: isOnline,
          website: website.trim() || null,
          join_link: isOnline ? (joinLink.trim() || null) : null,
          access,
          location_name: isOnline ? null : (locationName.trim() || null),
          location_address: isOnline ? null : (locationAddress.trim() || null),
          location_lat: isOnline ? null : locationLat,
          location_lng: isOnline ? null : locationLng,
          interest_items: selectedHobbies.map((h) => ({ slug: h.slug, name: h.name })),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Community updated");
        router.push(`/communities/${slug}`);
      } else {
        if (data.field) {
          const fieldErrs = { [data.field]: data.message ?? "Validation error" };
          setErrors(fieldErrs);
          scrollToFirstError(fieldRefs.current, fieldErrs, FIELD_ORDER);
        } else {
          toast.error(data.message || "Could not save");
        }
      }
    } catch { toast.error("Something went wrong"); }
    setSaving(false);
  };

  const handleClose = async () => {
    setClosing(true);
    try {
      const res = await apiFetch(`/communities/${slug}/close`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success("Community closed");
        router.push("/communities");
      } else {
        toast.error(data.message || "Could not close community");
      }
    } catch { toast.error("Something went wrong"); }
    setClosing(false);
    setCloseConfirmOpen(false);
  };

  const avatarSrc = logoPreview
    ?? (existingAvatarKey && communityId ? `${getAvatarBaseUrl()}/communities/${communityId}/avatar?v=${Date.now()}` : undefined);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Stack spacing={{ xs: 2.5, sm: 4 }}>
      {/* Header */}
      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            mb: 0.75,
          }}
        >
          Edit community
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Update your community details. Changes are saved when you click Save.
        </Typography>
      </Box>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            About your community
          </Typography>

          {/* Logo (inline) */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Logo</Typography>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              {avatarSrc ? (
                <Avatar
                  variant="rounded"
                  src={avatarSrc}
                  onClick={() => { if (!logoUploading) fileInputRef.current?.click(); }}
                  sx={{ width: 56, height: 56, borderRadius: 2, cursor: logoUploading ? "default" : "pointer", "&:hover": logoUploading ? {} : { opacity: 0.85 } }}
                />
              ) : (
                <Box
                  onClick={() => { if (!logoUploading) fileInputRef.current?.click(); }}
                  sx={{
                    width: 56, height: 56, borderRadius: 2,
                    border: "2px dashed", borderColor: "grey.300",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: logoUploading ? "default" : "pointer",
                    transition: "border-color 0.15s, background-color 0.15s",
                    "&:hover": logoUploading ? {} : { borderColor: "primary.main", bgcolor: "action.hover" },
                  }}
                >
                  {logoUploading ? (
                    <CircularProgress size={20} />
                  ) : (
                    <PhotoCameraRoundedIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                  )}
                </Box>
              )}
              <Typography
                variant="body2"
                color={logoUploading ? "text.disabled" : "primary"}
                onClick={() => { if (!logoUploading) fileInputRef.current?.click(); }}
                sx={{ cursor: logoUploading ? "default" : "pointer", fontWeight: 500, "&:hover": logoUploading ? {} : { textDecoration: "underline" } }}
              >
                {logoUploading ? "Uploading..." : avatarSrc ? "Change" : "Upload"}
              </Typography>
            </Stack>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelect} />
          </Box>

          <Box ref={setFieldRef("name")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Community name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={!!errors.name}
              helperText={errors.name || null}
              inputProps={{ maxLength: 100 }}
            />
          </Box>

          <Box ref={setFieldRef("description")} sx={{ scrollMarginTop: 96 }}>
            <RichTextEditor
              label="Description"
              placeholder="Describe what this community is for, who should join, and what members can expect."
              value={description}
              onChange={setDescription}
            />
            {errors.description && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                {errors.description}
              </Typography>
            )}
          </Box>

          <Box ref={setFieldRef("hobby")} sx={{ scrollMarginTop: 96 }}>
            <HobbyPickerField
              value={selectedHobbies}
              onChange={setSelectedHobbies}
              error={errors.hobby}
              onReject={(msg) => toast.error(msg)}
            />
          </Box>
        </Stack>
      </AppCard>

      {/* Location and type */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Location and type
          </Typography>

          <RadioGroup
            row
            value={isOnline ? "online" : "in_person"}
            onChange={(e) => setIsOnline(e.target.value === "online")}
          >
            <FormControlLabel value="in_person" control={<Radio />} label="In person" />
            <FormControlLabel value="online" control={<Radio />} label="Online" />
          </RadioGroup>

          {!isOnline ? (
            <Box ref={setFieldRef("location")} sx={{ scrollMarginTop: 96 }}>
              <PlacesAutocompleteInput
                value={locationName}
                onChange={(v) => {
                  setLocationName(v);
                  if (!v.trim()) {
                    setLocationAddress("");
                    setLocationLat(null);
                    setLocationLng(null);
                  }
                }}
                onPlaceSelect={(result) => {
                  setLocationName(result.name || result.formattedAddress);
                  setLocationAddress(result.formattedAddress);
                  setLocationLat(result.lat);
                  setLocationLng(result.lng);
                }}
                label="Home location"
                placeholder="Search for a city, venue, or address"
                helperText={errors.location || undefined}
                error={!!errors.location}
                placeTypes={[]}
                inputId="places-autocomplete-community-edit"
              />
            </Box>
          ) : (
            <AppTextField
              label="Join link"
              placeholder="e.g. https://discord.gg/yourserver"
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              helperText={null}
              inputProps={{ maxLength: 500 }}
            />
          )}

          <Box ref={setFieldRef("website")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Website"
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </Box>
        </Stack>
      </AppCard>

      {/* Access */}
      <AppCard>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Access
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Private communities require your approval before someone can join.
            </Typography>
          </Box>

          <RadioGroup
            value={access}
            onChange={(e) => setAccess(e.target.value as "open" | "private")}
          >
            <FormControlLabel
              value="open"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Open</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Anyone can find, view, and join this community
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mb: 1.5 }}
            />
            <FormControlLabel
              value="private"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Private</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Discoverable, but plans and members are only visible to approved members
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start" }}
            />
          </RadioGroup>
        </Stack>
      </AppCard>

      {/* Close community (owner only) */}
      {isOwner && (
        <AppCard>
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", color: "error.main" }}>
              Close community
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Closing this community hides it from listings and removes it from linked plans. Members can still see that it existed. This cannot be undone.
            </Typography>
            <Box>
              <Button
                variant="outlined" color="error" size="small"
                onClick={() => setCloseConfirmOpen(true)}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
              >
                Close this community
              </Button>
            </Box>
          </Stack>
        </AppCard>
      )}

      {/* Submit */}
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={2}
        justifyContent="flex-end"
        sx={{ pt: 1, pb: 4 }}
      >
        <AppButton
          variant="outlined"
          color="inherit"
          onClick={() => router.back()}
          disabled={saving}
          sx={{ minWidth: { xs: "100%", sm: 140 }, borderRadius: 2.5, textTransform: "none" }}
        >
          Cancel
        </AppButton>
        <AppButton
          onClick={handleSave}
          disabled={saving || !name.trim()}
          sx={{ minWidth: { xs: "100%", sm: 200 }, py: 1.5, borderRadius: 2.5, fontWeight: 600, textTransform: "none", fontSize: "1rem" }}
        >
          {saving ? <CircularProgress size={22} color="inherit" /> : "Save changes"}
        </AppButton>
      </Stack>

      {/* Crop dialog */}
      <Dialog
        open={cropDialogOpen}
        onClose={() => { if (cropImageSrc) URL.revokeObjectURL(cropImageSrc); setCropImageSrc(null); setCropDialogOpen(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { m: { xs: 2, sm: 3 }, maxHeight: { xs: "calc(100dvh - 32px)", sm: "calc(100dvh - 48px)" } },
        }}
      >
        <DialogTitle>Crop logo</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          {cropImageSrc && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Box sx={{ position: "relative", height: 320 }}>
                <Cropper
                  image={cropImageSrc}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={1}
                  cropShape="rect"
                  onCropChange={setCropPosition}
                  onZoomChange={setCropZoom}
                  onCropComplete={handleCropComplete}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Zoom
                </Typography>
                <Slider value={cropZoom} min={1} max={3} step={0.1} valueLabelDisplay="auto" onChange={(_, v) => setCropZoom(v as number)} />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
          <AppButton
            variant="outlined"
            onClick={() => { if (cropImageSrc) URL.revokeObjectURL(cropImageSrc); setCropImageSrc(null); setCropDialogOpen(false); }}
          >
            Cancel
          </AppButton>
          <AppButton variant="contained" onClick={handleCropSave}>
            Save
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Close confirmation */}
      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close community?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will hide <strong>{name}</strong> from all listings and remove it from any linked plans. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCloseConfirmOpen(false)} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleClose} disabled={closing} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
            {closing ? <CircularProgress size={18} color="inherit" /> : "Close community"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
