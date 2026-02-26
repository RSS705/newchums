"use client";

import Button from "@mui/material/Button";
import Link from "next/link";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import { signOut } from "next-auth/react";
import BrandLogo from "@/components/BrandLogo";

const headerLinks = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Science of Friendship", href: "/science-of-friendship" },
  { label: "Safety Center", href: "/safety-center" },
] as const;

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
        {headerLinks.map((link) => (
          <Button
            key={link.href}
            component={Link}
            href={link.href}
            color="inherit"
            variant="text"
            sx={{ fontSize: "inherit" }}
          >
            {link.label}
          </Button>
        ))}
      </Stack>
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
