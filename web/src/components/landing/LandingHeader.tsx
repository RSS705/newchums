"use client";

import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import BrandLogo from "@/components/BrandLogo";

/**
 * Header content only — no Container (Layout provides it).
 * Toolbar disableGutters so Layout's LandingContainer is the only padding source.
 */
export default function LandingHeader() {
  return (
    <Toolbar
      disableGutters
      sx={{
        width: "100%",
        justifyContent: "space-between",
        minHeight: { xs: 64, lg: 80 },
      }}
    >
      <BrandLogo
        src="/logo-horizontal-black.png"
        alt="NewChums"
        height={32}
      />
      <Button
        variant="contained"
        color="primary"
        href="/login"
        sx={{ px: 2.5 }}
      >
        Login
      </Button>
    </Toolbar>
  );
}
