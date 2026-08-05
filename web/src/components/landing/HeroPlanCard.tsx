"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";

/** The interactive sample plan the card opens. Same id the ui-survey uses,
 *  so any route change breaks a monitored surface rather than silently
 *  dead-ending the homepage hero. */
const SAMPLE_PLAN_HREF = "/sample-plan/00000000-0000-4000-8000-000000000001";

/**
 * The hero's visual: a miniature plan page built from the product's own UI
 * vocabulary (banner wash, icon-circle rows, attendance-check line, RSVP
 * buttons), replacing the illustrated artwork that used to sit here. The
 * whole card links to a live sample plan, so the first thing a visitor can
 * do on the site is the product's whole pitch: open a plan link and
 * instantly understand it.
 *
 * The RSVP buttons are decorative (aria-hidden, no pointer events of their
 * own): the click target is the card. Styled by hand rather than with real
 * Buttons so nothing here ever half-works.
 *
 * No date is shown, only "Saturday", so the card never contradicts a
 * calendar.
 */
export default function HeroPlanCard() {
  const iconCircle = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    bgcolor: "primary.light",
    color: "primary.dark",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  } as const;

  return (
    <Stack spacing={1.5} alignItems="center" sx={{ width: "100%" }}>
      <Paper
        component={Link}
        href={SAMPLE_PLAN_HREF}
        aria-label="Open a live example plan"
        elevation={0}
        sx={{
          display: "block",
          width: "100%",
          maxWidth: 430,
          borderRadius: 4,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "grey.200",
          boxShadow: "0 8px 32px rgba(230,91,19,0.10), 0 2px 8px rgba(0,0,0,0.05)",
          textDecoration: "none",
          bgcolor: "background.paper",
          transition: "transform 0.25s ease, box-shadow 0.25s ease",
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: "0 14px 44px rgba(230,91,19,0.16), 0 4px 12px rgba(0,0,0,0.07)",
          },
          "@media (prefers-reduced-motion: no-preference)": {
            animation: "ncHeroCardFloat 8s ease-in-out infinite",
          },
          "@keyframes ncHeroCardFloat": {
            "0%, 100%": { translate: "0 0" },
            "50%": { translate: "0 -7px" },
          },
        }}
      >
        {/* Banner wash, same recipe as the plan form's colour themes */}
        <Box
          sx={{
            height: 92,
            background: "linear-gradient(135deg, #b45309 0%, #c2410c 100%)",
            position: "relative",
          }}
        >
          <Chip
            label="Public"
            size="small"
            sx={{
              position: "absolute",
              top: 12,
              left: 14,
              bgcolor: "rgba(255,255,255,0.92)",
              fontWeight: 600,
              fontSize: "0.6875rem",
              height: 22,
            }}
          />
        </Box>

        <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography
            variant="h6"
            fontWeight={800}
            sx={{ color: "text.primary", fontSize: "1.125rem", mb: 1.5, lineHeight: 1.3 }}
          >
            Game Night &amp; Potluck
          </Typography>

          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box sx={iconCircle}>
                <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography variant="body2" fontWeight={500} sx={{ color: "text.primary" }}>
                Saturday &middot; 6:30 PM
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box sx={iconCircle}>
                <PlaceRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography variant="body2" fontWeight={500} sx={{ color: "text.primary" }}>
                Riverside Park Pavilion
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box sx={iconCircle}>
                <PeopleRoundedIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography variant="body2" fontWeight={500} sx={{ color: "text.primary" }}>
                10 going &middot; 4 seats remaining
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ pl: 0.25 }}>
              <NotificationsRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                Everyone confirms the day before
              </Typography>
            </Stack>
          </Stack>

          <Divider sx={{ my: 1.75 }} />

          {/* Decorative RSVP row; the card itself is the link */}
          <Stack direction="row" spacing={1} aria-hidden sx={{ pointerEvents: "none" }}>
            <Box
              sx={{
                flex: 1,
                py: 0.875,
                borderRadius: 2.5,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.5,
                fontWeight: 700,
                fontSize: "0.875rem",
              }}
            >
              <CheckRoundedIcon sx={{ fontSize: 17 }} />
              Going
            </Box>
            <Box
              sx={{
                flex: 1,
                py: 0.875,
                borderRadius: 2.5,
                border: "1.5px solid",
                borderColor: "grey.300",
                color: "text.secondary",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "0.875rem",
              }}
            >
              Maybe
            </Box>
          </Stack>
        </Box>
      </Paper>

      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        A live example plan. Click it and look around.
      </Typography>
    </Stack>
  );
}
