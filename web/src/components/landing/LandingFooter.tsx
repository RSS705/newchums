"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/**
 * Footer content only, no Container, no outer Box (Layout provides both).
 * Top row: logo + tagline (left), links column (right). Ready for future Terms, Privacy, etc.
 */
export default function LandingFooter() {
  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", md: "flex-start" },
          gap: 2,
          mb: 3,
        }}
      >
        {/* Centered on mobile so the stacked logo, tagline, and link
            list read as one column; the bottom legal row is already
            centered, so this removes the mixed-alignment look. */}
        <Stack spacing={1.5} sx={{ flexShrink: 0, alignItems: { xs: "center", md: "flex-start" } }}>
          <BrandLogo src="/logo-horizontal-black-no-dot-com.png" alt="NewChums" height={32} width={79} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ maxWidth: 320, lineHeight: 1.6, textAlign: { xs: "center", md: "left" } }}
          >
            Make plans that actually happen.
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.75, sm: 2.5 }}
          alignItems={{ xs: "center", md: "flex-end" }}
          justifyContent={{ sm: "center" }}
          sx={{ flexShrink: 0 }}
        >
          {[
            { href: "/how-it-works", label: "How it Works" },
            { href: "/safety-center", label: "Safety Center" },
            // Community Roadmap deliberately not listed here: it is
            // signed-in only (Aug 2026), and this footer renders mostly to
            // signed-out visitors, for whom the link is a login wall. It
            // stays in the app sidebar for signed-in users.
            { href: "/contact", label: "Contact" },
          ].map((link) => (
            <Typography
              key={link.href}
              component={Link}
              href={link.href}
              variant="body2"
              color="text.secondary"
              sx={{ textDecoration: "none", "&:hover": { color: "primary.main", textDecoration: "underline" } }}
            >
              {link.label}
            </Typography>
          ))}
        </Stack>
      </Box>
      <Divider sx={{ my: 3 }} />
      <Stack
        direction="row"
        spacing={2}
        justifyContent="center"
        sx={{ mb: 1.5 }}
      >
        {[
          { href: "/terms", label: "Terms of Use" },
          { href: "/privacy", label: "Privacy Policy" },
        ].map((link) => (
          <Typography
            key={link.href}
            component={Link}
            href={link.href}
            variant="caption"
            color="text.secondary"
            sx={{ textDecoration: "none", "&:hover": { color: "primary.main", textDecoration: "underline" } }}
          >
            {link.label}
          </Typography>
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary" textAlign="center">
        © 2026 NewChums. All rights reserved.
      </Typography>
    </>
  );
}
