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
            Making it easier to organize gatherings around the things you already enjoy.
          </Typography>
        </Stack>
        <Stack
          direction="column"
          alignItems={{ xs: "flex-start", md: "flex-end" }}
          spacing={1}
          sx={{ flexShrink: 0 }}
        >
          <Typography
            component={Link}
            href="/contact"
            variant="body2"
            color="text.secondary"
            sx={{ textDecoration: "none", "&:hover": { color: "primary.main", textDecoration: "underline" } }}
          >
            Contact us
          </Typography>
        </Stack>
      </Box>
      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary" textAlign="center">
        © 2026 NewChums. All rights reserved.
      </Typography>
    </>
  );
}
