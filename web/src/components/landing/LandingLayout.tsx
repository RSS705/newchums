"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import type { ReactNode } from "react";
import LandingFooter from "./LandingFooter";
import LandingHeader from "./LandingHeader";

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
export default function LandingLayout({ children }: { children: ReactNode }) {
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
          minHeight: { lg: 80 },
        }}
      >
        <LandingContainer>
          <LandingHeader />
        </LandingContainer>
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
