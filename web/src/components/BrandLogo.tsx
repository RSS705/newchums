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
  /** Width in px; set to match the image's natural aspect ratio at the given height to prevent layout shift. */
  width?: number;
  /** Optional link wrapper. Omit for no link */
  href?: string;
  /** Preload image. Default false */
  priority?: boolean;
  /** MUI sx overrides */
  sx?: SxProps<Theme>;
};

/**
 * Shared brand logo component. Sizes by height, width auto, logos hug their artwork
 * instead of a fixed-width box. Reusable across headers, footers, and app shells.
 */
export default function BrandLogo({
  src,
  alt,
  height = 32,
  width,
  href,
  sx,
}: BrandLogoProps) {
  /* Inline style on the <img> ensures the browser constrains size at parse time,
     before any CSS-in-JS or external stylesheets load. This prevents the brief
     flash of the full-resolution image on mobile refresh. */
  const imgEl = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      height={height}
      width={width ?? Math.round(height * 2.4)}
      style={{
        height: `${height}px`,
        width: "auto",
        maxWidth: "100%",
        display: "block",
        objectFit: "contain",
        objectPosition: "left center",
      }}
      loading="eager"
      fetchPriority="high"
    />
  );

  const wrapped = sx ? <Box sx={sx}>{imgEl}</Box> : imgEl;

  if (href !== undefined) {
    return (
      <Link href={href} underline="none" sx={{ display: "inline-block" }}>
        {wrapped}
      </Link>
    );
  }

  return wrapped;
}
