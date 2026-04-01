"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "next/link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { headerNavLinks } from "@/config/nav";

/**
 * Shared header used by both public (LandingLayout) and logged-in (AppShell).
 * Single source of truth for header height, typography, spacing, and alignment.
 * Content uses maxWidth="lg" container for inward positioning.
 */
const HEADER_MIN_HEIGHT = { xs: 64, lg: 80 };

export type SiteHeaderProps = {
  /** Right-side content: Login button (public) or bell + profile (logged-in) */
  rightSide: ReactNode;
  /** Optional mobile menu button (hamburger) – shown only when provided */
  mobileMenuButton?: ReactNode;
};

export default function SiteHeader({
  rightSide,
  mobileMenuButton,
}: SiteHeaderProps) {
  const pathname = usePathname();

  return (
    <Container
      maxWidth="lg"
      disableGutters
      sx={{
        px: { xs: 2, sm: 3 },
        overflow: "hidden",
      }}
    >
      <Toolbar
        disableGutters
        sx={{
          width: "100%",
          minWidth: 0,
          justifyContent: "space-between",
          minHeight: HEADER_MIN_HEIGHT,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          {mobileMenuButton}
          <Link href="/" style={{ display: "inline-flex", minWidth: 0 }}>
          <BrandLogo
            src="/logo-horizontal-black.png"
            alt="NewChums"
            height={32}
            sx={{ maxWidth: { xs: 140, sm: 200 } }}
          />
        </Link>
        </Box>
        <Stack
          component="nav"
          direction="row"
          spacing={3}
          sx={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: { xs: "none", md: "flex" },
          }}
        >
          {headerNavLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Button
                key={link.href}
                component={Link}
                href={link.href}
                color="inherit"
                variant="text"
                sx={{
                  fontSize: "inherit",
                  textTransform: "none",
                  color: isActive ? "primary.main" : "inherit",
                  fontWeight: isActive ? 700 : undefined,
                  position: "relative",
                }}
              >
                {link.label}
              </Button>
            );
          })}
        </Stack>
        <Box sx={{ flexGrow: 1, minWidth: 0 }} />
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ flexShrink: 0 }}
        >
          {rightSide}
        </Stack>
      </Toolbar>
    </Container>
  );
}

export { HEADER_MIN_HEIGHT };
