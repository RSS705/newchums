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
import LandingFooter from "./LandingFooter";

const LOGGED_OUT_DRAWER_WIDTH = 260;
const APP_BAR_HEIGHT_MOBILE = 64;

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
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: "divider",
          borderBottomColor: "grey.200",
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
              onClick={() => setMobileOpen((prev) => !prev)}
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

      {/* Mobile drawer (logged-out): Get Started first, Learn More below; header stays visible */}
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
        <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
        <MarketingNavSection sectionTitle="Learn More" onLinkClick={() => setMobileOpen(false)} />
      </Drawer>

      <Box component="main" sx={{ flex: 1, pt: { xs: 8, lg: 10 } }}>
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
