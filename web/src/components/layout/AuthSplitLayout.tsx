"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import AuthLayout from "./AuthLayout";

/** Default illustration used across auth pages when none specified */
const DEFAULT_ILLUSTRATION = "/auth-illustration.svg";

export type AuthSplitLayoutProps = {
  /** Form panel content (card + form). Rendered in right column on desktop. */
  children: ReactNode;
  /** Illustration src for left panel. Default: /auth-illustration.svg */
  illustrationSrc?: string;
  /** Optional tagline below branding (e.g. "Find your people"). Shown on left panel. */
  tagline?: string;
};

/**
 * Two-column auth layout: illustration left, form right.
 * Desktop (md+): 50/50 split. Mobile: single column, illustration above form.
 * Uses theme tokens for background. Reusable across login, signup, forgot-password, reset-password.
 */
export default function AuthSplitLayout({
  children,
  illustrationSrc = DEFAULT_ILLUSTRATION,
  tagline = "Better plans start here",
}: AuthSplitLayoutProps) {
  return (
    <AuthLayout>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
        }}
      >
        {/* Left: illustration panel (hidden on xs/sm, shown md+) */}
        <Box
          sx={{
            display: { xs: "none", md: "flex" },
            flex: "1 1 50%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
            background: (t) =>
              `linear-gradient(145deg, ${t.palette.primary.light}90 0%, ${t.palette.secondary.light}60 100%)`,
          }}
        >
          <Box
            component={Link}
            href="/"
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textDecoration: "none",
              color: "inherit",
              mb: 3,
              cursor: "pointer",
              "&:hover": { opacity: 0.9 },
            }}
          >
            <Box sx={{ mb: 2 }}>
              <Image
                src="/icon-black.png"
                alt="NewChums"
                width={64}
                height={64}
                style={{ objectFit: "contain" }}
              />
            </Box>
            <Typography
              component="span"
              variant="h3"
              fontWeight={700}
              color="text.primary"
              sx={{ mb: 1, textAlign: "center" }}
            >
              NewChums
            </Typography>
            <Typography
              variant="subtitle1"
              color="text.secondary"
              sx={{ textAlign: "center" }}
            >
              {tagline}
            </Typography>
          </Box>
          <Box
            component="img"
            src={illustrationSrc}
            alt=""
            sx={{
              width: "100%",
              maxWidth: 360,
              height: "auto",
              objectFit: "contain",
            }}
          />
        </Box>

        {/* Right: form panel */}
        <Box
          sx={{
            flex: "1 1 50%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: { xs: 2.5, sm: 3, md: 4 },
            bgcolor: "background.paper",
          }}
        >
          {/* Mobile: compact illustration above form */}
          <Box
            component="img"
            src={illustrationSrc}
            alt=""
            sx={{
              display: { xs: "block", md: "none" },
              width: "100%",
              maxWidth: 200,
              height: "auto",
              mx: "auto",
              mb: 2,
              objectFit: "contain",
            }}
          />
          {children}
        </Box>
      </Box>
    </AuthLayout>
  );
}
