"use client";

import type { ComponentProps } from "react";
import Box from "@mui/material/Box";
import CommunityBannerEditor, { BANNER_ASPECT } from "./CommunityBannerEditor";
import CommunityLogoEditor from "./CommunityLogoEditor";

/** The banner's share of the row; the logo column is one part. */
const BANNER_COLUMNS = 3;

type Props = {
  /** Null leaves the banner out, and the logo stands alone. */
  banner: ComponentProps<typeof CommunityBannerEditor> | null;
  logo: Omit<ComponentProps<typeof CommunityLogoEditor>, "tileWidth">;
};

/**
 * The community's banner with its logo to the right, stacked on phones.
 * The columns split BANNER_COLUMNS : 1 and the logo tile takes
 * BANNER_COLUMNS / BANNER_ASPECT of its column, so the square logo is
 * exactly as tall as the banner preview beside it at every width, while
 * its column stays wide enough for the buttons and helper line underneath.
 */
export default function CommunityImagesEditor({ banner, logo }: Props) {
  if (!banner) return <CommunityLogoEditor {...logo} />;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: `minmax(0, ${BANNER_COLUMNS}fr) minmax(0, 1fr)` },
        gap: 3,
        alignItems: "start",
      }}
    >
      <CommunityBannerEditor {...banner} />
      <CommunityLogoEditor
        {...logo}
        tileWidth={{ xs: 112, sm: `${(BANNER_COLUMNS / BANNER_ASPECT) * 100}%` }}
      />
    </Box>
  );
}
