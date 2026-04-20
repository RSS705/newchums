"use client";

import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import WavingHandRoundedIcon from "@mui/icons-material/WavingHandRounded";
import FeedbackRoundedIcon from "@mui/icons-material/FeedbackRounded";
import {
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
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
import { appNavItems, superAdminNavItems, createEventHref } from "@/config/nav";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import UserAvatar from "@/components/common/UserAvatar";
import SiteHeader, { HEADER_MIN_HEIGHT } from "@/components/layout/SiteHeader";
import MarketingNavSection from "@/components/layout/MarketingNavSection";
import LandingFooter from "@/components/landing/LandingFooter";
import NotificationBell from "@/components/layout/NotificationBell";
import PasswordSetupBanner from "@/components/layout/PasswordSetupBanner";

export type AppShellUser = {
  name?: string | null;
  role?: string | null;
};

const navCardWidth = 260;

/** Survives remounts; prevents avatar flash when navigating between pages */
let cachedAvatarUrl: string | null = null;

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
  /** When true, show the "finish setting up your account" banner above the
   *  shell. Resolved server-side from the user row's password_setup_pending
   *  column so we don't need a client round-trip to decide whether to
   *  render it. */
  passwordSetupPending?: boolean;
};

type NavProfile = { avatar_url?: string | null; name?: string | null; username?: string | null; role?: string | null };

export default function AppShell({ children, user, passwordSetupPending }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isAuthenticated = Boolean(user);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [navProfile, setNavProfile] = React.useState<NavProfile | null>(null);
  const [adminBadges, setAdminBadges] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!user) {
      cachedAvatarUrl = null;
      return;
    }
    let cancelled = false;
    apiFetch("/profile", { auth: true })
      .then((res) => res.json())
      .then((data: { ok?: boolean; profile?: NavProfile & { email?: string } }) => {
        if (!cancelled && data.ok && data.profile) {
          setNavProfile(data.profile);
          if (data.profile.avatar_url) {
            cachedAvatarUrl = `${getAvatarBaseUrl()}${data.profile.avatar_url}`;
          } else {
            cachedAvatarUrl = null;
          }

          // Consume any pending invite token stored before a Google OAuth redirect.
          // Only runs once: token is removed from sessionStorage before the request fires.
          const pendingInvite = sessionStorage.getItem("nc_pending_invite");
          const userEmail = data.profile.email;
          if (pendingInvite && userEmail) {
            sessionStorage.removeItem("nc_pending_invite");
            apiFetch("/chums/invite/accept", {
              method: "POST",
              body: JSON.stringify({ token: pendingInvite, email: userEmail }),
            }).catch(() => {});
          }

          // Record legal acceptance stored during Google OAuth signup.
          const legalRaw = sessionStorage.getItem("nc_legal_accepted");
          if (legalRaw) {
            sessionStorage.removeItem("nc_legal_accepted");
            try {
              const legal = JSON.parse(legalRaw) as { terms?: string; privacy?: string };
              if (legal.terms || legal.privacy) {
                apiFetch("/auth/record-legal-acceptance", {
                  method: "POST",
                  body: JSON.stringify({
                    accepted_terms_version: legal.terms,
                    accepted_privacy_version: legal.privacy,
                  }),
                }).catch(() => {});
              }
            } catch { /* ignore malformed data */ }
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // Fetch admin badge counts
  const isSuperAdmin = navProfile?.role === "super_admin" || user?.role === "super_admin";
  React.useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    apiFetch("/admin/badge-counts", { auth: true })
      .then((res) => res.json())
      .then((data: { ok?: boolean; users?: number; interests?: number; plans?: number; roadmap?: number; safety?: number; communities?: number; shoutouts?: number }) => {
        if (!cancelled && data.ok) {
          setAdminBadges({
            "/admin/chums": data.users ?? 0,
            "/admin/interests": data.interests ?? 0,
            "/admin/plans": data.plans ?? 0,
            "/admin/roadmap": data.roadmap ?? 0,
            "/admin/safety": data.safety ?? 0,
            "/admin/communities": data.communities ?? 0,
            "/admin/shoutouts": data.shoutouts ?? 0,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isSuperAdmin, navProfile]);

  // Unauthenticated shell: minimal header with logo + Sign in / Sign up, no sidebar
  if (!isAuthenticated) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100dvh", bgcolor: "background.default" }}>
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
            rightSide={
              <Stack direction="row" spacing={1} alignItems="center">
                <Button
                  component={Link}
                  href="/login"
                  variant="text"
                  size="small"
                  sx={{ textTransform: "none", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  Sign in
                </Button>
                <Button
                  component={Link}
                  href="/signup"
                  variant="contained"
                  color="primary"
                  size="small"
                  sx={{ textTransform: "none", fontWeight: 600, fontSize: "0.875rem", borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                >
                  Sign up
                </Button>
              </Stack>
            }
          />
        </AppBar>

        <Box
          component="main"
          sx={{ flexGrow: 1, display: "flex", flexDirection: "column" }}
        >
          <Box sx={{ flex: 1, pb: { xs: 0, md: 4 } }}>
            <Container maxWidth="lg" sx={{ pt: { xs: 3, sm: 4 }, pb: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3 } }}>
              {children}
            </Container>
          </Box>
          <Box
            component="footer"
            sx={{ py: 5, mt: "auto", backgroundColor: "background.paper", borderTop: 1, borderColor: "grey.200" }}
          >
            <Container maxWidth="lg" sx={{ px: { xs: 2, sm: 3 } }}>
              <LandingFooter />
            </Container>
          </Box>
        </Box>
      </Box>
    );
  }

  const accountMenuOpen = Boolean(accountMenuAnchor);
  const displayName = navProfile?.name?.trim() || user?.name?.trim() || "there";
  const avatarUrl = navProfile?.avatar_url ? `${getAvatarBaseUrl()}${navProfile.avatar_url}` : null;
  const isLoading = Boolean(user) && navProfile === null;
  const effectiveAvatarUrl = avatarUrl ?? cachedAvatarUrl;
  const showWaveIcon = !isLoading && !effectiveAvatarUrl;
  const navIconSize = 48;

  const NavCardContent = () => (
    <>
      <Box sx={{ px: 2.5, py: 2.5, display: "flex", alignItems: "center", gap: 1.5 }}>
        {effectiveAvatarUrl ? (
          <UserAvatar
            src={effectiveAvatarUrl}
            name={navProfile?.name}
            username={navProfile?.username}
            size={navIconSize}
            sx={{ flexShrink: 0 }}
          />
        ) : showWaveIcon ? (
          <Box
            sx={{
              width: navIconSize,
              height: navIconSize,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderRadius: "50%",
              bgcolor: "primary.light",
            }}
          >
            <WavingHandRoundedIcon
              sx={{
                fontSize: 24,
                color: "primary.main",
              }}
              aria-hidden
            />
          </Box>
        ) : (
          <Box
            sx={{
              width: navIconSize,
              height: navIconSize,
              borderRadius: "50%",
              bgcolor: "action.hover",
              flexShrink: 0,
            }}
            aria-hidden
          />
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            Welcome back
          </Typography>
          <Typography
            variant="subtitle1"
            fontWeight={700}
            sx={{ mt: 0.125, fontSize: "1rem", lineHeight: 1.3 }}
          >
            {displayName}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
      <List
        sx={{
          px: 1.5,
          py: 1,
          "& .MuiListItemButton-root": {
            mb: 0.5,
            py: 1,
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
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon sx={{ fontSize: 22, color: active ? "primary.main" : "text.secondary" }} />
              </ListItemIcon>
              <ListItemText
                primary={
                  item.tag ? (
                    <Stack direction="row" alignItems="center" spacing={0.75}>
                      <span>{item.label}</span>
                      <Chip label={item.tag} size="small" variant="outlined" color="info" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 600, cursor: "inherit" }} />
                    </Stack>
                  ) : item.label
                }
                primaryTypographyProps={{
                  fontWeight: active ? 600 : 500,
                  fontSize: "0.9375rem",
                }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ px: 2, pt: 0.5, pb: 2.5 }}>
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
            borderRadius: 2.5,
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.9375rem",
            boxShadow: "none",
            "&:hover": { boxShadow: "none", opacity: 0.92 },
          }}
        >
          Start a plan
        </Button>
      </Box>
      {(navProfile?.role === "super_admin" || user?.role === "super_admin") && (
        <>
          <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
          <Box sx={{ px: 2, pt: 1.5, pb: 0.25 }}>
            <Typography
              variant="caption"
              sx={{
                color: "text.disabled",
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                fontSize: "0.6875rem",
              }}
            >
              Super Admin
            </Typography>
          </Box>
          <List
            sx={{
              px: 1.5,
              pb: 1.5,
              "& .MuiListItemButton-root": {
                mb: 0.5,
              },
            }}
          >
            {superAdminNavItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              const badgeCount = adminBadges[item.href] ?? 0;
              return (
                <ListItemButton
                  key={item.href}
                  component={Link}
                  href={item.href}
                  selected={active}
                  onClick={() => {
                    setMobileOpen(false);
                    if (badgeCount > 0) {
                      const sectionMap: Record<string, string> = { "/admin/chums": "users", "/admin/interests": "interests", "/admin/plans": "plans", "/admin/roadmap": "roadmap", "/admin/safety": "safety", "/admin/communities": "communities", "/admin/shoutouts": "shoutouts" };
                      const section = sectionMap[item.href];
                      if (section) {
                        apiFetch("/admin/mark-viewed", { auth: true, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ section }) }).catch(() => {});
                        setAdminBadges((prev) => ({ ...prev, [item.href]: 0 }));
                      }
                    }
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Badge badgeContent={badgeCount} color="error" max={99} sx={{ "& .MuiBadge-badge": { fontSize: "0.625rem", height: 16, minWidth: 16 } }}>
                      <Icon sx={{ fontSize: 20, color: active ? "primary.main" : "text.secondary" }} />
                    </Badge>
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: "0.875rem", fontWeight: active ? 600 : 500 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </>
      )}
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
          color: "text.primary",
          minHeight: HEADER_MIN_HEIGHT,
        }}
      >
        <SiteHeader
          mobileMenuButton={
            <IconButton
              aria-label="open navigation"
              edge="start"
              onClick={() => setMobileOpen((previous) => !previous)}
              sx={{ mr: 0, display: { md: "none" }, color: "text.primary" }}
            >
              <MenuRoundedIcon />
            </IconButton>
          }
          rightSide={
            <>
              <NotificationBell viewerHandle={navProfile?.username ?? null} />
              <IconButton
                aria-label="open account menu"
                size="medium"
                aria-controls={accountMenuOpen ? "appshell-account-menu" : undefined}
                aria-haspopup="true"
                aria-expanded={accountMenuOpen ? "true" : undefined}
                onClick={(event) => setAccountMenuAnchor(event.currentTarget)}
                sx={{ color: "text.primary" }}
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
                  onClick={() => {
                    setAccountMenuAnchor(null);
                    router.push("/roadmap");
                  }}
                >
                  <ListItemIcon>
                    <FeedbackRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Give Feedback
                </MenuItem>
                <MenuItem
                  onClick={async () => {
                    setAccountMenuAnchor(null);
                    cachedAvatarUrl = null;
                    await signOut({ redirectTo: "/" });
                  }}
                >
                  <ListItemIcon>
                    <LogoutRoundedIcon fontSize="small" />
                  </ListItemIcon>
                  Sign out
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
          pb: 0,
        }}
      >
        {isAuthenticated && passwordSetupPending && <PasswordSetupBanner />}
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
              {/* Desktop: floating nav card. `top: 0` + `overflow: hidden`
               *  matches the original alignment so the card's first row
               *  lines up with the page header next to it. The internal
               *  scroll affordance (wheel-scroll the sidebar on hover,
               *  useful once enough entries are added that the card is
               *  taller than the viewport, super-admin users first) is
               *  handled by the inner <Box> below instead of by giving
               *  the Paper itself `maxHeight` + `overflowY`, which had
               *  the side-effect of nudging the card down a chunk on
               *  first paint.
               */}
              <Paper
                variant="outlined"
                sx={{
                  display: { xs: "none", md: "block" },
                  position: "sticky",
                  top: 0,
                  borderRadius: 3,
                  overflow: "hidden",
                  flexShrink: 0,
                  bgcolor: "background.paper",
                  borderColor: "grey.200",
                  borderWidth: 1,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.02)",
                }}
              >
                {/* Inner scroll container. Scrollbar chrome is hidden via
                 *  the standard `scrollbarWidth: none` + `::-webkit-scrollbar
                 *  display: none` recipe used elsewhere in the app, so the
                 *  nav scrolls naturally without painting a visible thumb
                 *  or track. `clipPath` is retained to geometrically clip
                 *  anything that might otherwise paint over the card's
                 *  rounded corners (keeps the shell defensive if the
                 *  scrollbar is ever re-enabled). Radius matches Paper's
                 *  `borderRadius: 3` (24px) in the MUI theme.
                 */}
                <Box
                  sx={{
                    maxHeight: {
                      md: `calc(100vh - ${HEADER_MIN_HEIGHT.xs}px)`,
                      lg: `calc(100vh - ${HEADER_MIN_HEIGHT.lg}px)`,
                    },
                    overflowY: "auto",
                    overflowX: "hidden",
                    clipPath: "inset(0 round 24px)",
                    scrollbarWidth: "none",
                    "&::-webkit-scrollbar": { display: "none" },
                  }}
                >
                  <NavCardContent />
                </Box>
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
            py: 5,
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
