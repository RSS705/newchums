"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Stack, CircularProgress, Avatar,
  RadioGroup, Radio, FormControlLabel, FormControl,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Slider,
} from "@mui/material";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import Cropper, { type Area } from "react-easy-crop";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import { apiFetch, getApiBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export default function CreateCommunityClient() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [logoBlob, setLogoBlob] = useState<Blob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (slug.length < 3) { toast.error("Handle must be at least 3 characters"); return; }

    setSaving(true);
    try {
      const res = await apiFetch("/communities", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim() || null,
          visibility,
          join_mode: joinMode,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (logoBlob && data.community?.id) {
          await uploadCommunityLogo(data.community.id);
        }
        toast.success("Community created!");
        router.push(`/communities/${data.community.slug}`);
      } else {
        toast.error(data.message || data.error || "Something went wrong");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  };

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
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

      {/* Basics */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Basics
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Give your community a name, logo, and a short description.
            </Typography>
          </Box>

          {/* Logo */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Logo (optional)</Typography>
            {logoPreview ? (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar
                  variant="rounded"
                  src={logoPreview}
                  sx={{ width: 64, height: 64, borderRadius: 2.5 }}
                />
                <Stack spacing={0.5}>
                  <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "divider", color: "text.secondary" }}>
                    Change
                  </Button>
                  <Button
                    size="small"
                    onClick={() => { setLogoPreview(null); setLogoBlob(null); }}
                    sx={{ textTransform: "none", fontSize: "0.75rem", color: "text.disabled", p: 0, minWidth: 0, "&:hover": { color: "error.main", bgcolor: "transparent" } }}
                  >
                    Remove
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Box
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  width: 96, height: 96, borderRadius: 2.5,
                  border: "2px dashed", borderColor: "grey.300",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5,
                  cursor: "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                  "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
              >
                <PhotoCameraRoundedIcon sx={{ fontSize: 24, color: "text.disabled" }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                  Upload
                </Typography>
              </Box>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelect} />
          </Box>

          <AppTextField
            label="Community name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Board Game Nights Toronto"
            inputProps={{ maxLength: 100 }}
          />

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

          <AppTextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this community about?"
            multiline
            minRows={3}
            inputProps={{ maxLength: 2000 }}
          />

          {/* Location (inside Basics) */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Location (optional)</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              If your community has a regular meeting spot, add it here.
            </Typography>
            <PlacesAutocompleteInput
              value={locationName}
              onChange={(v) => {
                setLocationName(v);
                if (!v.trim()) setLocationAddress("");
              }}
              onPlaceSelect={(result) => {
                setLocationName(result.name || result.formattedAddress);
                setLocationAddress(result.formattedAddress);
              }}
              placeholder="Search for a place or enter a name"
              placeTypes={["establishment", "geocode"]}
              inputId="places-autocomplete-community-create"
            />
            {locationAddress && (
              <AppTextField
                label="Address"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                inputProps={{ maxLength: 500 }}
                sx={{ mt: 1.5 }}
              />
            )}
          </Box>
        </Stack>
      </AppCard>

      {/* Visibility & joining */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Visibility and joining
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Control who can find and join your community.
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Visibility</Typography>
            <FormControl>
              <RadioGroup value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
                <FormControlLabel
                  value="public"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Public</Typography>
                      <Typography variant="caption" color="text.secondary">Anyone can find and view this community.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", mb: 0.5 }}
                />
                <FormControlLabel
                  value="private"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Private</Typography>
                      <Typography variant="caption" color="text.secondary">Only members can see content. Others see the name and description.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start" }}
                />
              </RadioGroup>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Joining</Typography>
            <FormControl>
              <RadioGroup value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "approval_required")}>
                <FormControlLabel
                  value="open"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Open</Typography>
                      <Typography variant="caption" color="text.secondary">Anyone can join immediately.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", mb: 0.5 }}
                />
                <FormControlLabel
                  value="approval_required"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Approval required</Typography>
                      <Typography variant="caption" color="text.secondary">You review each request before they can join.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start" }}
                />
              </RadioGroup>
            </FormControl>
          </Box>
        </Stack>
      </AppCard>

      {/* Actions */}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <AppButton variant="outlined" onClick={() => router.back()} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          Cancel
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !name.trim() || slug.length < 3 || slugAvailable === false}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, minWidth: 160, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Create community"}
        </AppButton>
      </Stack>

      {/* Crop dialog */}
      <Dialog open={cropDialogOpen} onClose={() => { if (cropImageSrc) URL.revokeObjectURL(cropImageSrc); setCropImageSrc(null); setCropDialogOpen(false); }} maxWidth="sm" fullWidth>
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
              <Stack direction="row" spacing={2} alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 40 }}>Zoom</Typography>
                <Slider value={cropZoom} min={1} max={3} step={0.1} onChange={(_, v) => setCropZoom(v as number)} sx={{ flex: 1 }} />
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
          <Button onClick={() => { if (cropImageSrc) URL.revokeObjectURL(cropImageSrc); setCropImageSrc(null); setCropDialogOpen(false); }} sx={{ textTransform: "none" }}>Cancel</Button>
          <Button variant="contained" onClick={handleCropSave} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
