"use client";

import { useCallback, useRef, useState } from "react";
import Box from "@mui/material/Box";
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

/** Raw-file upload cap, mirrors the plan-banner section. getCroppedImg then
 *  compresses/re-encodes to fit under MAX_COMMUNITY_BANNER_BYTES. */
const MAX_BANNER_INPUT_BYTES = 20 * 1024 * 1024; // 20MB

/**
 * Compressed-output cap. Matches the API's `MAX_COMMUNITY_BANNER_BYTES`
 * (600KB) so a successfully cropped blob always fits the upload limit.
 */
const MAX_COMMUNITY_BANNER_BYTES = 600 * 1024;

/** Wide-banner output dimensions. 5:1 gives a strong header presence
 *  without dominating the community detail page, and keeps the WebP encode
 *  well under the 600KB server ceiling. */
const BANNER_OUTPUT_WIDTH = 1600;
const BANNER_OUTPUT_HEIGHT = 320;
const BANNER_ASPECT = BANNER_OUTPUT_WIDTH / BANNER_OUTPUT_HEIGHT;

type Props = {
  /** Current remote banner URL, if any. Shown as the preview until the owner
   *  picks a new one (at which point the local pending blob takes over). */
  existingBannerUrl: string | null;
  /** Pending local blob (newly cropped but not yet uploaded). Owned by the
   *  parent form so it can be flushed to R2 after community create/edit. */
  pendingBlob: Blob | null;
  onChangePendingBlob: (blob: Blob | null) => void;
  /** Called when the user clicks "Remove". For the Create form this just
   *  clears pending state. For Edit, the form posts a PATCH to clear
   *  `banner_key`. */
  onRemoveExisting?: () => void;
  /** True when a remove request is in flight (Edit form only). */
  removing?: boolean;
};

/**
 * Community banner uploader. Custom image upload only, no colour presets
 * (community banners intentionally don't carry the theme-picker affordance
 * that the plan form has). Visual language mirrors the plan-banner
 * section, same section header treatment, same dashed-empty-state
 * preview, same action-button row, same bottom helper line. Available on
 * every plan; the call site is responsible for confirming the viewer can
 * edit the community (owner / super admin).
 */
export default function CommunityBannerEditor({
  existingBannerUrl,
  pendingBlob,
  onChangePendingBlob,
  onRemoveExisting,
  removing,
}: Props) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Please use JPEG, PNG, or WebP.");
      return;
    }
    if (file.size > MAX_BANNER_INPUT_BYTES) {
      toast.error("That image is over 20 MB, pick a smaller one.");
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
      const blob = await getCroppedImg(
        cropImageSrc,
        croppedAreaPixels as PixelCrop,
        BANNER_OUTPUT_WIDTH,
        BANNER_OUTPUT_HEIGHT,
        MAX_COMMUNITY_BANNER_BYTES,
      );
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      setCropDialogOpen(false);
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

  const previewUrl = localPreview || (!pendingBlob && existingBannerUrl) || null;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
          Banner
        </Typography>
      </Box>

      {/* Preview / upload area. Same dashed-empty-state + hover treatment as
          the plan-banner section so the two feel like one product. Aspect
          ratio is locked at 4:1 so the preview matches exactly what renders
          on the community hero. */}
      <Box
        onClick={() => fileInputRef.current?.click()}
        sx={{
          width: "100%",
          aspectRatio: `${BANNER_ASPECT}`,
          borderRadius: 2.5,
          border: "2px dashed",
          borderColor: previewUrl ? "transparent" : "grey.300",
          bgcolor: previewUrl ? "transparent" : "grey.50",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          transition: "border-color 0.2s",
          "&:hover": { borderColor: previewUrl ? "transparent" : "primary.main" },
        }}
      >
        {previewUrl ? (
          // Raw <img> is intentional: preview is either a blob: URL or the
          // authenticated backend URL; Next.js Image would need remotePatterns
          // config for both and adds nothing at 1600x400 here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Community banner preview"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Stack alignItems="center" spacing={0.75}>
            <AddPhotoAlternateRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
            <Typography variant="body2" color="text.secondary">
              Upload a banner
            </Typography>
          </Stack>
        )}
      </Box>

      {/* Action row: Change / Undo / Remove as AppButton chips, matches the
          plan-banner section's pattern (outlined Change, text Remove). */}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {previewUrl && (
          <AppButton
            variant="outlined"
            size="small"
            onClick={() => fileInputRef.current?.click()}
          >
            Change photo
          </AppButton>
        )}
        {pendingBlob && (
          <AppButton
            variant="text"
            size="small"
            onClick={handleClearPending}
          >
            Undo change
          </AppButton>
        )}
        {!pendingBlob && existingBannerUrl && onRemoveExisting && (
          <AppButton
            variant="text"
            size="small"
            color="error"
            onClick={removing ? undefined : onRemoveExisting}
            disabled={removing}
          >
            {removing ? "Removing…" : "Remove"}
          </AppButton>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary">
        Recommended 1600 &times; 320 (5:1). JPEG, PNG, or WebP up to 20 MB, we&apos;ll compress it automatically.
      </Typography>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFileSelect}
      />

      {/* Crop dialog */}
      <Dialog
        open={cropDialogOpen}
        onClose={() => {
          if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
          setCropImageSrc(null);
          setCropDialogOpen(false);
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { m: { xs: 2, sm: 3 }, maxHeight: { xs: "calc(100dvh - 32px)", sm: "calc(100dvh - 48px)" } },
        }}
      >
        <DialogTitle>Crop banner</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          {cropImageSrc && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Box sx={{ position: "relative", height: 320 }}>
                <Cropper
                  image={cropImageSrc}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={BANNER_ASPECT}
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
          <AppButton
            variant="outlined"
            onClick={() => {
              if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
              setCropImageSrc(null);
              setCropDialogOpen(false);
            }}
          >
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
