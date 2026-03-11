"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

/**
 * Footer content only — no Container, no outer Box (Layout provides both).
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
        <Stack spacing={1.5} sx={{ flexShrink: 0 }}>
          <BrandLogo src="/logo-horizontal-black-no-dot-com.png" alt="NewChums" height={32} />
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320, lineHeight: 1.6 }}>
            A place for people who actually like to do things.
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 0.75, sm: 2.5 }}
          alignItems={{ xs: "flex-start", md: "flex-end" }}
          sx={{ flexShrink: 0 }}
        >
          {[
            { href: "/how-it-works", label: "How it Works" },
            { href: "/safety-center", label: "Safety Center" },
            { href: "/science-of-friendship", label: "Science of Friendship" },
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
      <Typography variant="body2" color="text.secondary" textAlign="center">
        © 2026 NewChums. All rights reserved.
      </Typography>
    </>
  );
}
