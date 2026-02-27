"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import Link from "next/link";
import type { ReactNode } from "react";
import * as React from "react";
import { signOut } from "next-auth/react";
import SiteHeader, { HEADER_MIN_HEIGHT } from "@/components/layout/SiteHeader";
import MarketingNavSection from "@/components/layout/MarketingNavSection";
import LandingFooter from "./LandingFooter";

const LOGGED_OUT_DRAWER_WIDTH = 260;

/**
 * Single source of truth for landing horizontal gutters.
 * Header, hero, and footer content all use this — no competing Containers.
 */
function LandingContainer({ children }: { children: ReactNode }) {
  return (
    <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
      {children}
    </Container>
  );
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
  const [mobileOpen, setMobileOpen] = React.useState(false);

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
          mobileMenuButton={
            <IconButton
              color="inherit"
              aria-label="open navigation"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 0, display: { md: "none" } }}
            >
              <MenuRoundedIcon />
            </IconButton>
          }
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

      {/* Mobile drawer (logged-out): More Goodness + Login/Sign up */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: LOGGED_OUT_DRAWER_WIDTH,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box component="div" sx={{ minHeight: HEADER_MIN_HEIGHT }} />
        <Divider />
        <MarketingNavSection onLinkClick={() => setMobileOpen(false)} />
        <Divider sx={{ borderColor: "divider", opacity: 0.6, mt: 0 }} />
        <Box sx={{ px: 2, py: 2, mt: "auto" }}>
          <Stack direction="column" spacing={1}>
            <Button
              component={Link}
              href="/login"
              variant="contained"
              color="primary"
              fullWidth
              onClick={() => setMobileOpen(false)}
              sx={{ textTransform: "capitalize" }}
            >
              Login
            </Button>
            <Button
              component={Link}
              href="/signup"
              variant="outlined"
              color="primary"
              fullWidth
              onClick={() => setMobileOpen(false)}
              sx={{ textTransform: "capitalize" }}
            >
              Sign up
            </Button>
          </Stack>
        </Box>
      </Drawer>

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
