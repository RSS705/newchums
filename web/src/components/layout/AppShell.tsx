"use client";

import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { signOut } from "next-auth/react";
import { appNavItems } from "@/config/nav";

const drawerWidth = 240;

function isNavItemActive(pathname: string, href: string) {
  if (href === "/events" && pathname.startsWith("/events")) {
    return true;
  }

  return pathname === href;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [accountMenuAnchor, setAccountMenuAnchor] = React.useState<null | HTMLElement>(null);

  const accountMenuOpen = Boolean(accountMenuAnchor);

  const currentBottomValue = React.useMemo(() => {
    const matchingItem = appNavItems.find((item) => isNavItemActive(pathname, item.href));
    return matchingItem?.href ?? "/";
  }, [pathname]);

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: "divider",
          backdropFilter: "blur(10px)",
        }}
      >
        <Toolbar sx={{ px: { xs: 2, md: 3 } }}>
          <IconButton
            color="inherit"
            aria-label="open navigation"
            edge="start"
            onClick={() => setMobileOpen((previous) => !previous)}
            sx={{ mr: 1, display: { md: "none" } }}
          >
            <MenuRoundedIcon />
          </IconButton>
          <Typography component={Link} href="/" variant="h6" sx={{ color: "inherit" }}>
            NewChums
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton
            color="inherit"
            aria-label="open account menu"
            aria-controls={accountMenuOpen ? "appshell-account-menu" : undefined}
            aria-haspopup="true"
            aria-expanded={accountMenuOpen ? "true" : undefined}
            onClick={(event) => setAccountMenuAnchor(event.currentTarget)}
          >
            <PersonRoundedIcon />
          </IconButton>
          <Menu
            id="appshell-account-menu"
            anchorEl={accountMenuAnchor}
            open={accountMenuOpen}
            onClose={() => setAccountMenuAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <MenuItem
              onClick={() => {
                setAccountMenuAnchor(null);
                router.push("/profile");
              }}
            >
              <ListItemIcon>
                <PersonRoundedIcon fontSize="small" />
              </ListItemIcon>
              Profile
            </MenuItem>
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
                await signOut({ redirectTo: "/login" });
              }}
            >
              <ListItemIcon>
                <LogoutRoundedIcon fontSize="small" />
              </ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { boxSizing: "border-box", width: drawerWidth },
          }}
        >
          <Toolbar />
          <Divider />
          <List sx={{ p: 1 }}>
            {appNavItems.map((item) => {
              const Icon = item.icon;

              return (
                <ListItemButton
                  key={item.href}
                  component={Link}
                  href={item.href}
                  selected={isNavItemActive(pathname, item.href)}
                  onClick={() => setMobileOpen(false)}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 38 }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              );
            })}
          </List>
        </Drawer>

        <Drawer
          variant="permanent"
          open
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: drawerWidth,
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            },
          }}
        >
          <Toolbar />
          <List sx={{ p: 1.5 }}>
            {appNavItems.map((item) => {
              const Icon = item.icon;

              return (
                <ListItemButton
                  key={item.href}
                  component={Link}
                  href={item.href}
                  selected={isNavItemActive(pathname, item.href)}
                  sx={{ borderRadius: 2, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 38 }}>
                    <Icon />
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              );
            })}
          </List>
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, pb: { xs: 11, md: 4 } }}>
        <Toolbar />
        <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 3 } }}>
          {children}
        </Container>
      </Box>

      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          display: { xs: "block", md: "none" },
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <BottomNavigation
          value={currentBottomValue}
          onChange={(_event, value) => router.push(value)}
          showLabels
        >
          {appNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <BottomNavigationAction
                key={item.href}
                label={item.label}
                value={item.href}
                icon={<Icon />}
              />
            );
          })}
        </BottomNavigation>
      </Box>
    </Box>
  );
}
