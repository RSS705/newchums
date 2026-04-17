"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { apiFetch, getApiBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { scrollToFirstError } from "@/lib/scrollToFirstError";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

const FIELD_ORDER = ["name", "description", "hobby", "location", "website"] as const;

export default function CreateCommunityClient() {
  const router = useRouter();
  const toast = useToast();

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [description, setDescription] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<HobbyOption[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [website, setWebsite] = useState("");
  const [discordUrl, setDiscordUrl] = useState("");
  const [access, setAccess] = useState<"open" | "private">("open");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [capDialogOpen, setCapDialogOpen] = useState(false);
  const [capMessage, setCapMessage] = useState("");

  // Logo state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Field refs for scroll-to-first-error
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const setFieldRef = useCallback(
    (key: string) => (el: HTMLElement | null) => { fieldRefs.current[key] = el; },
    [],
  );

  useEffect(() => {
    loadGooglePlacesScript().catch((err) => {
      console.warn("[CreateCommunityClient] Google Places script failed to load:", err);
    });
  }, []);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const checkSlug = useCallback(async (s: string) => {
    if (s.length < 3) { setSlugAvailable(null); return; }
    try {
      const res = await apiFetch(`/communities/slug-available?slug=${encodeURIComponent(s)}`, { auth: true });
      const data = await res.json();
      setSlugAvailable(data.available ?? null);
    } catch { setSlugAvailable(null); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (slug.length >= 3) checkSlug(slug); }, 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

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

  const uploadCommunityLogo = async (communityId: string) => {
    if (!logoBlob) return;
    const contentType = logoBlob.type || "image/webp";
    try {
      const initRes = await apiFetch("/media/init", {
        auth: true, method: "POST",
        body: JSON.stringify({ purpose: "community_avatar", contentType, contentLength: logoBlob.size }),
      });
      const initData = await initRes.json() as { ok?: boolean; uploadToken?: string; objectKey?: string; uploadUrl?: string };
      if (!initData.ok || !initData.uploadUrl || !initData.objectKey) return;
      const uploadUrl = `${getApiBaseUrl()}${initData.uploadUrl}`;
      const uploadRes = await fetch(uploadUrl, { method: "PUT", body: logoBlob, headers: { "Content-Type": contentType }, credentials: "omit" });
      if (!uploadRes.ok) return;
      await apiFetch("/media/finalize", {
        auth: true, method: "POST",
        body: JSON.stringify({ objectKey: initData.objectKey, purpose: "community_avatar", communityId }),
      });
    } catch { /* best-effort */ }
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Give your community a name";
    if (!description.trim() || description.replace(/<[^>]*>/g, "").trim().length === 0) errs.description = "Add a description so people know what this community is about";
    if (selectedHobbies.length === 0) errs.hobby = "Add at least one hobby so people can find this community";
    if (!isOnline && !locationName.trim() && !locationAddress.trim()) errs.location = "Add a location for your community";
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER);
      return;
    }
    setErrors({});

    if (slug.length < 3) { toast.error("Handle must be at least 3 characters"); return; }
    if (slugAvailable === false) { toast.error("That handle is already taken"); return; }

    setSaving(true);
    try {
      const res = await apiFetch("/communities", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim(),
          is_online: isOnline,
          website: website.trim() || null,
          discord_url: discordUrl.trim() || null,
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
        if (logoBlob && data.community?.id) {
          await uploadCommunityLogo(data.community.id);
        }
        toast.success("Community created!");
        router.push(`/communities/${data.community.slug}`);
      } else if (data.error === "COMMUNITY_CAP_REACHED") {
        setCapMessage(
          data.message ||
            "You can own up to 5 active communities. Close one before creating another.",
        );
        setCapDialogOpen(true);
      } else {
        if (data.field) {
          const fieldErrs = { [data.field]: data.message ?? "Validation error" };
          setErrors(fieldErrs);
          scrollToFirstError(fieldRefs.current, fieldErrs, FIELD_ORDER);
        } else {
          toast.error(data.message || data.error || "Something went wrong");
        }
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  };

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
          Create a community
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Bring people together around a shared interest or location. You can always update the details later.
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
              {logoPreview ? (
                <Avatar
                  variant="rounded"
                  src={logoPreview}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ width: 56, height: 56, borderRadius: 2, cursor: "pointer", "&:hover": { opacity: 0.85 } }}
                />
              ) : (
                <Box
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    width: 56, height: 56, borderRadius: 2,
                    border: "2px dashed", borderColor: "grey.300",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background-color 0.15s",
                    "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                  }}
                >
                  <PhotoCameraRoundedIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                </Box>
              )}
              <Stack spacing={0}>
                <Typography
                  variant="body2"
                  color="primary"
                  onClick={() => fileInputRef.current?.click()}
                  sx={{ cursor: "pointer", fontWeight: 500, "&:hover": { textDecoration: "underline" } }}
                >
                  {logoPreview ? "Change" : "Upload"}
                </Typography>
                {logoPreview && (
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    onClick={() => { setLogoPreview(null); setLogoBlob(null); }}
                    sx={{ cursor: "pointer", "&:hover": { color: "error.main" } }}
                  >
                    Remove
                  </Typography>
                )}
              </Stack>
            </Stack>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelect} />
          </Box>

          <Box ref={setFieldRef("name")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Community name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board Game Nights Toronto"
              error={!!errors.name}
              helperText={errors.name || null}
              inputProps={{ maxLength: 100 }}
            />
          </Box>

          <AppTextField
            label="Handle"
            value={slug}
            onChange={(e) => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
            placeholder="board-game-nights-toronto"
            helperText={
              slug.length >= 3
                ? slugAvailable === true ? "Available"
                : slugAvailable === false ? "Already taken"
                : "Checking..."
                : "At least 3 characters. Letters, numbers, and hyphens."
            }
            inputProps={{ maxLength: 50 }}
          />

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

          {!isOnline && (
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
                  // Combine venue name with address so the full location is
                  // visible on the community detail page and plan prefill.
                  const name = result.name && result.formattedAddress && !result.formattedAddress.startsWith(result.name)
                    ? `${result.name}, ${result.formattedAddress}`
                    : (result.name || result.formattedAddress);
                  setLocationName(name);
                  setLocationAddress(result.formattedAddress);
                  setLocationLat(result.lat);
                  setLocationLng(result.lng);
                }}
                label="Home location"
                placeholder="Search for a city, venue, or address"
                helperText={errors.location || undefined}
                error={!!errors.location}
                placeTypes={[]}
                inputId="places-autocomplete-community-create"
              />
            </Box>
          )}

          <Box ref={setFieldRef("website")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Website"
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              helperText={null}
              inputProps={{ maxLength: 500 }}
            />
          </Box>

          <AppTextField
            label="Discord Server"
            placeholder="e.g. https://discord.gg/yourserver"
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            helperText={null}
            inputProps={{ maxLength: 500 }}
          />
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
          onClick={handleSubmit}
          disabled={saving || !name.trim() || slug.length < 3 || slugAvailable === false}
          sx={{ minWidth: { xs: "100%", sm: 200 }, py: 1.5, borderRadius: 2.5, fontWeight: 600, textTransform: "none", fontSize: "1rem" }}
        >
          {saving ? <CircularProgress size={22} color="inherit" /> : "Create community"}
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

      {/* Community ownership cap dialog */}
      <Dialog open={capDialogOpen} onClose={() => setCapDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Community limit reached</DialogTitle>
        <DialogContent>
          <Typography variant="body1">{capMessage}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            You can close an existing community from its settings, which frees up a slot.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <AppButton onClick={() => setCapDialogOpen(false)} sx={{ textTransform: "none" }}>
            Got it
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
