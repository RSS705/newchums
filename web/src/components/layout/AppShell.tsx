"use client";

import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import WavingHandRoundedIcon from "@mui/icons-material/WavingHandRounded";
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { signOut } from "next-auth/react";
import { appNavItems, createEventHref } from "@/config/nav";
import SiteHeader, { HEADER_MIN_HEIGHT } from "@/components/layout/SiteHeader";
import MarketingNavSection from "@/components/layout/MarketingNavSection";
import LandingFooter from "@/components/landing/LandingFooter";

export type AppShellUser = {
  name?: string | null;
};

const navCardWidth = 260;

function isNavItemActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/events/create" || pathname.startsWith("/events")) {
    return pathname === href || pathname.startsWith(href);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

type AppShellProps = {
  children: React.ReactNode;
  /** User data for sidebar welcome; omit when unknown */
  user?: AppShellUser | null;
};

export default function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = React.useState<null | HTMLElement>(null);

  const accountMenuOpen = Boolean(accountMenuAnchor);
  const displayName = user?.name?.trim() || "there";

  const NavCardContent = () => (
    <>
      <Box sx={{ px: 2, py: 2.5, display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        <WavingHandRoundedIcon
          sx={{
            fontSize: 26,
            color: "primary.main",
            opacity: 0.85,
            flexShrink: 0,
          }}
          aria-hidden
        />
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontWeight: 500,
              letterSpacing: 0.3,
              opacity: 0.9,
            }}
          >
            Welcome back
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mt: 0.25, fontSize: "1rem" }}
          >
            {displayName}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
      <List
        sx={{
          px: 1.5,
          py: 1.5,
          "& .MuiListItemButton-root": {
            mb: 0.25,
            transition: "background-color 0.2s ease",
            borderRadius: 2,
          },
        }}
      >
        {appNavItems.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);
          return (
            <ListItemButton
              key={item.href}
              component={Link}
              href={item.href}
              selected={active}
              onClick={() => setMobileOpen(false)}
              sx={{ borderRadius: 2 }}
            >
              <ListItemIcon sx={{ minWidth: 38 }}>
                <Icon color={active ? "primary" : "inherit"} />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ px: 2, pt: 1, pb: 2 }}>
        <Button
          component={Link}
          href={createEventHref}
          variant="contained"
          color="primary"
          fullWidth
          size="medium"
          startIcon={<AddCircleRoundedIcon />}
          onClick={() => setMobileOpen(false)}
          sx={{
            py: 1.25,
            borderRadius: 2,
            textTransform: "capitalize",
            boxShadow: "none",
            transition: "opacity 0.2s ease",
            "&:hover": { boxShadow: "none", opacity: 0.95 },
          }}
        >
          Create Event
        </Button>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
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
              onClick={() => setMobileOpen((previous) => !previous)}
              sx={{ mr: 0, display: { md: "none" } }}
            >
              <MenuRoundedIcon />
            </IconButton>
          }
          rightSide={
            <>
              <IconButton
                color="inherit"
                aria-label="notifications"
                size="medium"
              >
                <NotificationsOutlinedIcon fontSize="medium" />
              </IconButton>
              <IconButton
                color="inherit"
                aria-label="open account menu"
                size="medium"
                aria-controls={accountMenuOpen ? "appshell-account-menu" : undefined}
                aria-haspopup="true"
                aria-expanded={accountMenuOpen ? "true" : undefined}
                onClick={(event) => setAccountMenuAnchor(event.currentTarget)}
              >
                <PersonRoundedIcon fontSize="medium" />
              </IconButton>
              <Menu
                id="appshell-account-menu"
                anchorEl={accountMenuAnchor}
                open={accountMenuOpen}
                onClose={() => setAccountMenuAnchor(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                disableScrollLock
              >
                <MenuItem
                  onClick={() => {
                    setAccountMenuAnchor(null);
                    router.push("/settings");
                  }}
                >
                  <ListItemIcon>
                    <SettingsRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Settings
                </MenuItem>
                <MenuItem
                  onClick={async () => {
                    setAccountMenuAnchor(null);
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <ListItemIcon>
                    <LogoutRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Logout
                </MenuItem>
              </Menu>
            </>
          }
        />
      </AppBar>

      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            boxSizing: "border-box",
            width: navCardWidth,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Toolbar sx={{ minHeight: HEADER_MIN_HEIGHT }} />
        <Divider />
        <NavCardContent />
        <Divider sx={{ borderColor: "divider", opacity: 0.6, mt: 0 }} />
        <MarketingNavSection onLinkClick={() => setMobileOpen(false)} />
      </Drawer>

      {/* Main content + footer */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          pt: { xs: 8, lg: 10 },
          pb: 0,
        }}
      >
        <Box
          sx={{
            flex: 1,
            pb: { xs: 0, md: 4 },
          }}
        >
          <Container
            maxWidth="lg"
            sx={{
              pt: { xs: 3, sm: 4 },
              pb: { xs: 2, sm: 3 },
              px: { xs: 2, sm: 3 },
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: `${navCardWidth}px 1fr` },
                gap: { xs: 2, sm: 3 },
                alignItems: "start",
              }}
            >
              {/* Desktop: floating nav card */}
              <Paper
                variant="outlined"
                sx={{
                  display: { xs: "none", md: "block" },
                  position: "sticky",
                  top: "88px",
                  borderRadius: 2.5,
                  overflow: "hidden",
                  flexShrink: 0,
                  bgcolor: "background.paper",
                  borderColor: "divider",
                  borderWidth: 1,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <NavCardContent />
              </Paper>

              {/* Page content */}
              <Box sx={{ minWidth: 0 }}>
                {children}
              </Box>
            </Box>
          </Container>
        </Box>
        <Box
          component="footer"
          sx={{
            py: 4,
            mt: "auto",
            backgroundColor: "background.paper",
            borderTop: 1,
            borderColor: "grey.200",
          }}
        >
          <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
            <LandingFooter />
          </Container>
        </Box>
      </Box>

    </Box>
  );
}
