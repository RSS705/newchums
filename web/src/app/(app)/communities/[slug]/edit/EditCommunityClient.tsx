"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box, Typography, Stack, CircularProgress, Avatar,
  RadioGroup, Radio, FormControlLabel, FormControl,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Slider,
} from "@mui/material";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import Cropper, { type Area } from "react-easy-crop";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import { apiFetch, getApiBaseUrl, getAvatarBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";

export default function EditCommunityClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

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

  const [closing, setClosing] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${slug}`, { auth: true });
      const data = await res.json();
      if (data.ok && data.community) {
        const c = data.community;
        setCommunityId(c.id);
        setName(c.name || "");
        setDescription(c.description || "");
        setVisibility(c.visibility || "public");
        setJoinMode(c.join_mode || "open");
        setLocationName(c.location_name || "");
        setLocationAddress(c.location_address || "");
        setExistingAvatarKey(c.avatar_key ?? null);
        setIsOwner(data.viewerMembership?.role === "owner");
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

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (logoBlob) await uploadLogo();

      const res = await apiFetch(`/communities/${slug}`, {
        auth: true, method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          join_mode: joinMode,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Community updated");
        router.push(`/communities/${slug}`);
      } else {
        toast.error(data.message || "Could not save");
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
          Edit community
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Update your community details. Changes are saved when you click Save.
        </Typography>
      </Box>

      {/* Basics */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Basics
            </Typography>
          </Box>

          {/* Logo */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Logo</Typography>
            {avatarSrc ? (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Avatar
                  variant="rounded"
                  src={avatarSrc}
                  sx={{ width: 64, height: 64, borderRadius: 2.5 }}
                />
                <Button
                  variant="outlined" size="small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={logoUploading}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "divider", color: "text.secondary" }}
                >
                  {logoUploading ? <CircularProgress size={18} /> : "Change"}
                </Button>
              </Stack>
            ) : (
              <Box
                onClick={() => { if (!logoUploading) fileInputRef.current?.click(); }}
                sx={{
                  width: 96, height: 96, borderRadius: 2.5,
                  border: "2px dashed", borderColor: "grey.300",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5,
                  cursor: logoUploading ? "default" : "pointer",
                  transition: "border-color 0.15s, background-color 0.15s",
                  "&:hover": logoUploading ? {} : { borderColor: "primary.main", bgcolor: "action.hover" },
                }}
              >
                {logoUploading ? (
                  <CircularProgress size={24} />
                ) : (
                  <>
                    <PhotoCameraRoundedIcon sx={{ fontSize: 24, color: "text.disabled" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                      Upload
                    </Typography>
                  </>
                )}
              </Box>
            )}
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelect} />
          </Box>

          <AppTextField
            label="Community name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            inputProps={{ maxLength: 100 }}
          />
          <AppTextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
              placeTypes={[]}
              inputId="places-autocomplete-community-edit"
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

      {/* Actions */}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <AppButton variant="outlined" onClick={() => router.back()} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          Cancel
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, minWidth: 140, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save changes"}
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
