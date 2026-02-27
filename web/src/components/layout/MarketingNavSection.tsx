"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { headerNavLinks } from "@/config/nav";

type MarketingNavSectionProps = {
  /** Called when a link is clicked (e.g. to close drawer) */
  onLinkClick?: () => void;
};

/**
 * Shared "More Goodness" section: How it Works, Science of Friendship, Safety Center.
 * Used in AppShell (logged-in drawer) and LandingLayout (logged-out drawer).
 * Typography slightly larger for improved mobile readability.
 */
export default function MarketingNavSection({ onLinkClick }: MarketingNavSectionProps) {
  return (
    <Box sx={{ px: 2, py: 2 }}>
      <Typography
        variant="body2"
        sx={{
          display: "block",
          color: "text.secondary",
          fontWeight: 600,
          letterSpacing: 0.5,
          fontSize: "0.9375rem",
          mb: 1.5,
        }}
      >
        More Goodness
      </Typography>
      <Stack spacing={0.5}>
        {headerNavLinks.map((link) => (
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
                color: "text.secondary",
                fontSize: "0.9375rem",
                "&:hover": { color: "primary.main" },
                display: "block",
                py: 1,
              }}
            >
              {link.label}
            </Typography>
          </Link>
        ))}
      </Stack>
    </Box>
  );
}
