"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "next-auth/react";
import SiteHeader, { HEADER_MIN_HEIGHT } from "@/components/layout/SiteHeader";
import LandingFooter from "./LandingFooter";

/**
 * Single source of truth for landing horizontal gutters.
 * Header, hero, and footer content all use this — no competing Containers.
 */
function LandingContainer({ children }: { children: ReactNode }) {
  return <Container maxWidth="lg">{children}</Container>;
}

/**
 * Layout for the public landing page (/).
 * Composes header, main content slot, and footer.
 * LandingContainer is the ONLY gutter source — sections do not add their own.
 */
export default function LandingLayout({
  children,
  isLoggedIn = false,
}: {
  children: ReactNode;
  isLoggedIn?: boolean;
}) {
  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: "background.default",
          color: "text.secondary",
          minHeight: HEADER_MIN_HEIGHT,
        }}
      >
        <SiteHeader
          rightSide={
            isLoggedIn ? (
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
                component={Link}
                href="/login"
                sx={{ px: 2.5, fontSize: "0.875rem" }}
              >
                Login
              </Button>
            )
          }
        />
      </AppBar>

      <Box component="main" sx={{ flex: 1 }}>
        <LandingContainer>{children}</LandingContainer>
      </Box>

      <Box
        component="footer"
        sx={{
          py: 4,
          mt: "auto",
          backgroundColor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <LandingContainer>
          <LandingFooter />
        </LandingContainer>
      </Box>
    </Box>
  );
}
