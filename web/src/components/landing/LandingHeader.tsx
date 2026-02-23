"use client";

import Button from "@mui/material/Button";
import Toolbar from "@mui/material/Toolbar";
import { signOut } from "next-auth/react";
import BrandLogo from "@/components/BrandLogo";

/**
 * Header content only — no Container (Layout provides it).
 * Toolbar disableGutters so Layout's LandingContainer is the only padding source.
 */
export default function LandingHeader({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
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
      {isLoggedIn ? (
        <Button
          variant="contained"
          color="primary"
          onClick={() => signOut({ redirectTo: "/" })}
          sx={{ px: 2.5 }}
        >
          Logout
        </Button>
      ) : (
        <Button
          variant="contained"
          color="primary"
          href="/login"
          sx={{ px: 2.5 }}
        >
          Login
        </Button>
      )}
    </Toolbar>
  );
}
