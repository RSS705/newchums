"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { navItems } from "./nav";
import { tokens } from "@/theme/tokens";

type AppShellProps = {
  children: React.ReactNode;
  brandHref: string;
};

function getSelectedNav(pathname: string) {
  if (pathname.startsWith("/events/")) {
    return pathname === "/events/new" ? "/events/new" : "/events";
  }
  const selected = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return selected?.href ?? "/home";
}

export default function AppShell({ children, brandHref }: AppShellProps) {
  const pathname = usePathname();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileDrawerOpen, setMobileDrawerOpen] = React.useState(false);
  const selectedNav = getSelectedNav(pathname);

  const navList = (
    <List sx={{ px: 1.5, py: 2 }}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const selected = selectedNav === item.href;
        return (
          <ListItemButton
            key={item.href}
            component={Link}
            href={item.href}
            selected={selected}
            onClick={() => setMobileDrawerOpen(false)}
            sx={{ borderRadius: 2, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <Icon color={selected ? "primary" : "inherit"} />
            </ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        );
      })}
    </List>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ minHeight: { xs: tokens.layout.appBarHeightMobile, md: tokens.layout.appBarHeight } }}>
          {!isDesktop ? (
            <IconButton edge="start" onClick={() => setMobileDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuRoundedIcon />
            </IconButton>
          ) : null}
          <Typography
            component={Link}
            href={brandHref}
            variant="h6"
            sx={{ fontWeight: 800, textDecoration: "none" }}
          >
            NewChums
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant={isDesktop ? "permanent" : "temporary"}
        open={isDesktop ? true : mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: tokens.layout.drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: tokens.layout.drawerWidth,
            borderRight: 1,
            borderColor: "divider",
            mt: { xs: `${tokens.layout.appBarHeightMobile}px`, md: `${tokens.layout.appBarHeight}px` },
            height: {
              xs: `calc(100% - ${tokens.layout.appBarHeightMobile}px)`,
              md: `calc(100% - ${tokens.layout.appBarHeight}px)`,
            },
          },
        }}
      >
        {navList}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          pb: { xs: 10, md: 4 },
        }}
      >
        <Toolbar sx={{ minHeight: { xs: tokens.layout.appBarHeightMobile, md: tokens.layout.appBarHeight } }} />
        <Container maxWidth={tokens.layout.contentMaxWidth} sx={{ py: 3 }}>
          <Stack spacing={3}>{children}</Stack>
        </Container>
      </Box>

      {!isDesktop ? (
        <BottomNavigation
          value={selectedNav}
          showLabels
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            borderTop: 1,
            borderColor: "divider",
            zIndex: (muiTheme) => muiTheme.zIndex.appBar,
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <BottomNavigationAction
                key={item.href}
                label={item.label}
                value={item.href}
                icon={<Icon />}
                component={Link}
                href={item.href}
              />
            );
          })}
        </BottomNavigation>
      ) : null}
    </Box>
  );
}
