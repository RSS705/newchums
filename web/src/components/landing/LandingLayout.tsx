"use client";

import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
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
import { publicHeaderNavLinks } from "@/config/nav";
import LandingFooter from "./LandingFooter";
import { useEffect } from "react";
import { captureAttributionLanding } from "@/lib/attribution";

const LOGGED_OUT_DRAWER_WIDTH = 260;
const APP_BAR_HEIGHT_MOBILE = 64;

/**
 * Single source of truth for landing horizontal gutters.
 * Header, hero, and footer content all use this, no competing Containers.
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
 * LandingContainer is the ONLY gutter source, sections do not add their own.
 */
export default function LandingLayout({
  children,
  isLoggedIn = false,
}: {
  children: ReactNode;
  isLoggedIn?: boolean;
}) {
  // Growth experiment: remember the first interesting arrival (UTM or
  // share-linked plan) so it can be stamped after signup.
  useEffect(() => {
    captureAttributionLanding();
  }, []);

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
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: "divider",
          borderBottomColor: "grey.200",
          backgroundColor: "background.default",
          color: "text.primary",
          minHeight: HEADER_MIN_HEIGHT,
        }}
      >
        <SiteHeader
          navLinks={publicHeaderNavLinks}
          mobileMenuButton={
            <IconButton
              aria-label="open navigation"
              edge="start"
              onClick={() => setMobileOpen((prev) => !prev)}
              sx={{ mr: 0, display: { md: "none" }, color: "text.primary" }}
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
                sx={{ px: 2.5, textTransform: "none" }}
              >
                Sign out
              </Button>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  variant="text"
                  color="primary"
                  component={Link}
                  href="/login"
                  sx={{
                    px: 2,
                    fontSize: "0.875rem",
                    textTransform: "none",
                    fontWeight: 600,
                    color: "text.primary",
                    backgroundColor: "transparent",
                    display: { xs: "none", sm: "inline-flex" },
                    "&:hover": { backgroundColor: "action.hover", color: "text.primary" },
                  }}
                >
                  Sign in
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  component={Link}
                  href="/signup"
                  sx={{
                    px: 2.5,
                    fontSize: "0.875rem",
                    textTransform: "none",
                    boxShadow: "0 2px 10px rgba(230,91,19,0.25)",
                    "&:hover": { boxShadow: "0 4px 14px rgba(230,91,19,0.32)" },
                  }}
                >
                  Sign up
                </Button>
              </Stack>
            )
          }
        />
      </AppBar>

      {/* Mobile drawer: auth-aware top section + Learn More nav */}
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
            top: APP_BAR_HEIGHT_MOBILE,
            height: `calc(100% - ${APP_BAR_HEIGHT_MOBILE}px)`,
          },
        }}
      >
        <Box sx={{ px: 2, py: 2.5, flexShrink: 0 }}>
          {isLoggedIn ? (
            <Button
              component={Link}
              href="/"
              variant="contained"
              color="primary"
              fullWidth
              onClick={() => setMobileOpen(false)}
              sx={{ textTransform: "none" }}
            >
              Explore
            </Button>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  display: "block",
                  color: "text.secondary",
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  fontSize: "0.9375rem",
                  mb: 1.5,
                }}
              >
                Get Started
              </Typography>
              <Stack direction="column" spacing={1}>
                <Button
                  component={Link}
                  href="/login"
                  variant="contained"
                  color="primary"
                  fullWidth
                  onClick={() => setMobileOpen(false)}
                  sx={{ textTransform: "none" }}
                >
                  Sign in
                </Button>
                <Button
                  component={Link}
                  href="/signup"
                  variant="outlined"
                  color="primary"
                  fullWidth
                  onClick={() => setMobileOpen(false)}
                  sx={{ textTransform: "none" }}
                >
                  Sign up
                </Button>
              </Stack>
            </>
          )}
        </Box>
        <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
        <MarketingNavSection
          sectionTitle="Learn More"
          navLinks={publicHeaderNavLinks}
          onLinkClick={() => setMobileOpen(false)}
        />
      </Drawer>

      {/* No top padding here. The fixed AppBar's clearance is handled
          globally by `#app-scroll-root { margin-top: var(--header-h) }`
          in `web/src/app/globals.css`, which pushes the entire layout
          (including this main) below the header at the right responsive
          height (64px on xs/sm/md, 80px on lg+). Adding pt here would
          double the offset. */}
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
