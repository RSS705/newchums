"use client";

import { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import Cropper, { type Area } from "react-easy-crop";
import { AppButton, useToast } from "@/components/ui";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";

/** Raw-file upload cap, the same as the banner's. getCroppedImg then
 *  re-encodes the crop well under the API's 2MB avatar limit. */
const MAX_LOGO_INPUT_BYTES = 20 * 1024 * 1024; // 20MB

/** Square output, in pixels. The logo shows at 72px at most (the community
 *  page header), so 256 stays sharp on 3x screens. */
const LOGO_OUTPUT_SIZE = 256;

type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

type Props = {
  /** Current remote logo URL, if any. Shown until the owner picks a new one. */
  existingLogoUrl: string | null;
  /** Pending local blob (cropped but not yet uploaded). Owned by the parent
   *  form so it can be flushed to R2 after community create/edit. */
  pendingBlob: Blob | null;
  onChangePendingBlob: (blob: Blob | null) => void;
  /** True while the parent form uploads the pending blob (Edit form only). */
  uploading?: boolean;
  /** Width of the square preview tile; a responsive object is accepted.
   *  `CommunityImagesEditor` sizes it to match the banner beside it. */
  tileWidth?: number | string | Partial<Record<Breakpoint, number | string>>;
};

/**
 * Community logo uploader, the square sibling of `CommunityBannerEditor`:
 * same section header, dashed empty state, action row and helper line, and
 * its own crop dialog. The call site is responsible for confirming the
 * viewer can edit the community (owner / super admin).
 */
export default function CommunityLogoEditor({
  existingLogoUrl,
  pendingBlob,
  onChangePendingBlob,
  uploading = false,
  tileWidth = 112,
}: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const pickFile = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_LOGO_INPUT_BYTES) {
      toast.error("That image is over 20 MB, pick a smaller one.");
      return;
    }
    setCropImageSrc(URL.createObjectURL(file));
    setCropDialogOpen(true);
    setCropPosition({ x: 0, y: 0 });
    setCropZoom(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const closeCropDialog = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    setCropDialogOpen(false);
  };

  const handleCropSave = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels as PixelCrop, LOGO_OUTPUT_SIZE);
      closeCropDialog();
      onChangePendingBlob(blob);
      if (localPreview) URL.revokeObjectURL(localPreview);
      setLocalPreview(URL.createObjectURL(blob));
    } catch {
      toast.error("Failed to process image");
    }
  };

  const handleClearPending = () => {
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalPreview(null);
    onChangePendingBlob(null);
  };

  const previewUrl = localPreview || (!pendingBlob && existingLogoUrl) || null;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
          Logo
        </Typography>
      </Box>

      {/* Square preview / upload tile, rounded like the logo on the
          community page. */}
      <Box
        role="button"
        tabIndex={uploading ? -1 : 0}
        aria-label={previewUrl ? "Change the logo" : "Upload a logo"}
        aria-disabled={uploading || undefined}
        onClick={pickFile}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickFile();
          }
        }}
        sx={{
          width: tileWidth,
          aspectRatio: "1",
          borderRadius: 2.5,
          border: "2px dashed",
          borderColor: previewUrl ? "transparent" : "grey.300",
          bgcolor: previewUrl ? "transparent" : "grey.50",
          cursor: uploading ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          transition: "border-color 0.2s",
          "&:hover": { borderColor: previewUrl || uploading ? "transparent" : "primary.main" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
        }}
      >
        {previewUrl ? (
          // Raw <img> for the same reason as the banner preview: a blob: URL
          // or the backend URL, which Next.js Image would need configuring for.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Community logo preview"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <AddPhotoAlternateRoundedIcon sx={{ fontSize: 30, color: "text.disabled" }} />
        )}
        {uploading && (
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "rgba(255, 255, 255, 0.6)",
            }}
          >
            <CircularProgress size={24} />
          </Box>
        )}
      </Box>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {previewUrl && (
          <AppButton variant="outlined" size="small" onClick={pickFile} disabled={uploading}>
            {uploading ? "Uploading…" : "Change logo"}
          </AppButton>
        )}
        {pendingBlob && !uploading && (
          <AppButton variant="text" size="small" onClick={handleClearPending}>
            {existingLogoUrl ? "Undo change" : "Remove"}
          </AppButton>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Recommended {LOGO_OUTPUT_SIZE}&nbsp;&times;&nbsp;{LOGO_OUTPUT_SIZE} (1:1).
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFileSelect}
      />

      <Dialog
        open={cropDialogOpen}
        onClose={closeCropDialog}
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
                <Slider
                  value={cropZoom}
                  min={1}
                  max={3}
                  step={0.1}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => setCropZoom(v as number)}
                />
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
          <AppButton variant="outlined" onClick={closeCropDialog}>
            Cancel
          </AppButton>
          <AppButton variant="contained" onClick={handleCropSave}>
            Save
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
