"use client";

import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import type { SxProps, Theme } from "@mui/material/styles";

export type BrandLogoProps = {
  /** Image src (e.g. "/logo-horizontal-black.png") */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Height in px; width follows aspect ratio. Default 32 */
  height?: number;
  /** Optional link wrapper. Omit for no link */
  href?: string;
  /** Preload image. Default false */
  priority?: boolean;
  /** MUI sx overrides */
  sx?: SxProps<Theme>;
};

/**
 * Shared brand logo component. Sizes by height, width auto — logos hug their artwork
 * instead of a fixed-width box. Reusable across headers, footers, and app shells.
 */
export default function BrandLogo({
  src,
  alt,
  height = 32,
  href,
  sx,
}: BrandLogoProps) {
  const img = (
    <Box
      component="img"
      src={src}
      alt={alt}
      sx={[
        {
          height: `${height}px`,
          width: "auto",
          display: "block",
          objectFit: "contain",
          objectPosition: "left center",
        },
        ...(sx ? (Array.isArray(sx) ? sx : [sx]) : []),
      ]}
    />
  );

  if (href !== undefined) {
    return (
      <Link href={href} underline="none" sx={{ display: "inline-block" }}>
        {img}
      </Link>
    );
  }

  return img;
}
