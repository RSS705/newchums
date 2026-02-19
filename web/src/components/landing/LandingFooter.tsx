"use client";

import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import BrandLogo from "@/components/BrandLogo";

/**
 * Footer content only — no Container, no outer Box (Layout provides both).
 */
export default function LandingFooter() {
  return (
    <>
      <Stack spacing={2} mb={3}>
        <BrandLogo
          src="/Logo%20Horizontal%20Black%20No%20Dot%20Com.png"
          alt="NewChums"
          height={32}
        />
        <Typography variant="body2" color="text.primary">
          Find your people. Meet through shared events.
        </Typography>
      </Stack>
      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" color="text.secondary" textAlign="center">
        © 2026 NewChums. All rights reserved.
      </Typography>
    </>
  );
}
