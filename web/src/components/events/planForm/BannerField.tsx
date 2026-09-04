"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { AppButton } from "@/components/ui";
import { BANNER_PRESETS } from "@/lib/eventBanners";

type BannerFieldProps = {
  /** Object URL (create) or remote URL (edit) of the current banner, if any. */
  bannerPreview: string | null;
  /** Slug of the preset the current preview came from; null for photos. */
  selectedPresetSlug: string | null;
  /** True while a preset gradient is being rendered to an image. */
  presetRendering: boolean;
  onPresetSelect: (slug: string) => void;
  /** Opens the parent's hidden file input. */
  onUploadClick: () => void;
  onRemove: () => void;
  /** Edit-form R2 host fallback for a preview URL that fails to load. */
  onPreviewError?: () => void;
};

/**
 * The banner picker: preset colour swatches plus custom upload, shared by
 * the Add and Edit plan forms (see AGENTS.md → "Add Plan / Edit Plan Parity
 * Rule"). The swatches originally existed only on Add; Edit silently lost
 * them and offered upload-only, which read as a degraded feature. One
 * component ends that drift.
 *
 * Deliberately compact, because it now lives in the always-visible tier-one
 * card rather than a collapsed section: no large dashed drop-zone when
 * empty, just the swatch row and an upload button. The preview box appears
 * only once there is something to preview.
 *
 * The parent owns the file input, the preset-to-image rendering and all
 * state; this component is purely presentational.
 */
export default function BannerField({
  bannerPreview,
  selectedPresetSlug,
  presetRendering,
  onPresetSelect,
  onUploadClick,
  onRemove,
  onPreviewError,
}: BannerFieldProps) {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.25 }}>
        Banner
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Pick a colour theme or upload your own photo.
      </Typography>
      <Stack spacing={1.5}>
        {/* Preset swatches */}
        <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
          {BANNER_PRESETS.map((preset) => {
            const isSelected = selectedPresetSlug === preset.slug;
            return (
              <Box
                key={preset.slug}
                onClick={() => !presetRendering && onPresetSelect(preset.slug)}
                title={preset.label}
                sx={{
                  width: 52,
                  height: 36,
                  borderRadius: 1.5,
                  background: preset.gradient,
                  cursor: presetRendering ? "wait" : "pointer",
                  border: "2px solid",
                  borderColor: isSelected ? "primary.main" : "transparent",
                  boxShadow: isSelected
                    ? "0 0 0 2px rgba(99,102,241,0.35)"
                    : "0 1px 3px rgba(0,0,0,0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.1s ease, box-shadow 0.1s ease",
                  "&:hover": { transform: presetRendering ? "none" : "scale(1.06)" },
                }}
              >
                {isSelected && (
                  <CheckRoundedIcon
                    sx={{
                      fontSize: 16,
                      color: "white",
                      filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
                    }}
                  />
                )}
              </Box>
            );
          })}
        </Stack>

        {/* Preview, only once there is something to show */}
        {bannerPreview && (
          <Box
            sx={{
              width: "100%",
              height: { xs: 110, sm: 140 },
              borderRadius: 2.5,
              overflow: "hidden",
            }}
          >
            <Box
              component="img"
              src={bannerPreview}
              alt="Banner preview"
              onError={onPreviewError}
              sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </Box>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <AppButton variant="outlined" size="small" onClick={onUploadClick}>
            {bannerPreview
              ? selectedPresetSlug
                ? "Upload custom photo instead"
                : "Change photo"
              : "Upload a custom photo"}
          </AppButton>
          {bannerPreview && (
            <AppButton variant="text" size="small" color="error" onClick={onRemove}>
              Remove
            </AppButton>
          )}
          <Typography variant="caption" color="text.secondary">
            JPEG, PNG, or WebP up to 20 MB. A wide 3:1 image (around 1200 &times; 400 px) fills the plan banner best.
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
