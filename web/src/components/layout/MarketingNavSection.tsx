"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { headerNavLinks, type HeaderNavLink } from "@/config/nav";

type MarketingNavSectionProps = {
  /** Called when a link is clicked (e.g. to close drawer) */
  onLinkClick?: () => void;
  /** Section header text; default "More Goodness" */
  sectionTitle?: string;
  /** Nav link set; defaults to the marketing-only list. Logged-out layouts
   *  pass `publicHeaderNavLinks` so the drawer mirrors the public header's
   *  extra "Communities" entry. */
  navLinks?: readonly HeaderNavLink[];
};

/**
 * Shared "More Goodness" drawer section rendering the marketing nav links.
 * Used in AppShell (logged-in drawer) and LandingLayout (logged-out drawer).
 * Typography slightly larger for improved mobile readability.
 */
export default function MarketingNavSection({ onLinkClick, sectionTitle = "More Goodness", navLinks = headerNavLinks }: MarketingNavSectionProps) {
  const pathname = usePathname();

  return (
    <Box sx={{ px: 2.5, py: 2 }}>
      <Typography
        variant="body2"
        sx={{
          display: "block",
          color: "text.disabled",
          fontWeight: 600,
          letterSpacing: 0.5,
          fontSize: "0.75rem",
          textTransform: "uppercase",
          mb: 1.5,
        }}
      >
        {sectionTitle}
      </Typography>
      <Stack spacing={0.25}>
        {navLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onLinkClick}
              style={{ textDecoration: "none" }}
            >
              <Typography
                component="span"
                variant="body2"
                sx={{
                  color: isActive ? "primary.main" : "text.secondary",
                  fontSize: "0.9375rem",
                  fontWeight: isActive ? 700 : 500,
                  "&:hover": { color: "primary.main" },
                  display: "block",
                  py: 0.875,
                }}
              >
                {link.label}
              </Typography>
            </Link>
          );
        })}
      </Stack>
    </Box>
  );
}
