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
import { headerNavLinks, type HeaderNavLink } from "@/config/nav";

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
  /** Desktop nav links. Defaults to the marketing-only set; the logged-out
   *  layouts pass `publicHeaderNavLinks`, which is currently an alias of the
   *  same array (the extra Communities entry it once added was deliberately
   *  removed; see config/nav.ts). */
  navLinks?: readonly HeaderNavLink[];
  /** Where the logo points. Defaults to the marketing home; the signed-in
   *  shell passes the app home (Your Plans) so "home" means one place. */
  logoHref?: string;
};

export default function SiteHeader({
  rightSide,
  mobileMenuButton,
  navLinks = headerNavLinks,
  logoHref = "/",
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
          <Link href={logoHref} style={{ display: "inline-flex", minWidth: 0 }}>
          <BrandLogo
            src="/logo-horizontal-black.png"
            alt="NewChums"
            height={32}
            width={77}
            sx={{ maxWidth: { xs: 140, sm: 200 } }}
          />
        </Link>
        </Box>
        <Stack
          component="nav"
          direction="row"
          spacing={2}
          sx={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: { xs: "none", md: "flex" },
          }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Button
                key={link.href}
                component={Link}
                href={link.href}
                color="inherit"
                variant="text"
                sx={{
                  // `whiteSpace: nowrap` stops multi-word labels like "Science
                  // of Friendship" from breaking across two lines when the row
                  // is dense. `minWidth: 0` neutralizes MUI Button's default
                  // 64px min-width so each button hugs its own text (the Stack
                  // spacing handles the breathing room). Tighter `px` keeps
                  // the hover-state pill from ballooning around short labels.
                  fontSize: "inherit",
                  textTransform: "none",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                  px: 1.25,
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
