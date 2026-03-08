"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import SectionHeader from "@/components/ui/SectionHeader";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";

/**
 * Full public homepage content for logged-out visitors.
 * Sections: Hero → Event Discovery → Making Plans Easier → Why This Works → CTA
 *
 * The event discovery section uses mock data structured to be easily replaced
 * with real API data. See MOCK_EVENTS and the rendering logic below.
 */

const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };

// ── Hero panel preview events ──────────────────────────────────────────────
// Three events shown in the hero right-column mini-preview panel.
const HERO_PREVIEW_EVENTS = [
  {
    id: 1,
    category: "Board Games",
    title: "Thursday Board Game Night",
    dayTime: "Thu \u00b7 7 pm",
    attending: 6,
    spots: 2,
  },
  {
    id: 2,
    category: "Coffee \u0026 Social",
    title: "Morning Coffee Walk",
    dayTime: "Sat \u00b7 9 am",
    attending: 4,
    spots: 4,
  },
  {
    id: 3,
    category: "Sport \u0026 Outdoor",
    title: "Beginner Pickleball",
    dayTime: "Wed \u00b7 9 am",
    attending: 5,
    spots: 3,
  },
];

// ── Discovery section mock events ─────────────────────────────────────────
// Replace or supplement this data with real API events in future.
// Structure is intentionally simple and API-friendly.
type EventCard = {
  id: number;
  category: string;
  title: string;
  dayTime: string;
  location: string;
  attending: number;
  spots: number;
};

const MOCK_EVENTS: EventCard[] = [
  {
    id: 1,
    category: "Board Games",
    title: "Thursday Board Game Night",
    dayTime: "Every Thu \u00b7 7 pm",
    location: "Community Space",
    attending: 6,
    spots: 2,
  },
  {
    id: 2,
    category: "Coffee \u0026 Social",
    title: "Morning Coffee Walk",
    dayTime: "Saturday \u00b7 9 am",
    location: "Local Park",
    attending: 4,
    spots: 4,
  },
  {
    id: 3,
    category: "Arts \u0026 Crafts",
    title: "Pottery Session, Beginners Welcome",
    dayTime: "Sunday \u00b7 2 pm",
    location: "Art Studio",
    attending: 5,
    spots: 3,
  },
  {
    id: 4,
    category: "Card Games",
    title: "MTG Draft Night",
    dayTime: "Every Fri \u00b7 7 pm",
    location: "Game Shop",
    attending: 8,
    spots: 0,
  },
  {
    id: 5,
    category: "Sport \u0026 Outdoor",
    title: "Beginner Pickleball Meetup",
    dayTime: "Wednesday \u00b7 9 am",
    location: "Sports Centre",
    attending: 5,
    spots: 3,
  },
  {
    id: 6,
    category: "Learning",
    title: "Casual Study Session",
    dayTime: "Tuesday \u00b7 6 pm",
    location: "Caf\u00e9",
    attending: 3,
    spots: 5,
  },
];

const FILTER_CATEGORIES = [
  "All",
  "Coffee \u0026 Social",
  "Board Games",
  "Arts \u0026 Crafts",
  "Card Games",
  "Sport \u0026 Outdoor",
  "Learning",
];

// ── "Making Plans Easier" feature blocks ──────────────────────────────────
const PLAN_FEATURES = [
  {
    Icon: ChatRoundedIcon,
    title: "Stop losing plans in the group chat",
    body: "\u201cWe should hang out\u201d messages get buried. NewChums gives plans a real home, visible, clear, and easy to say yes to.",
  },
  {
    Icon: CalendarMonthRoundedIcon,
    title: "Easy for friends to join",
    body: "Share an event with people you already know, or let others nearby discover it. Everyone has the same info, no chasing people down.",
  },
  {
    Icon: FavoriteRoundedIcon,
    title: "Hobbies give people a reason to show up",
    body: "When a gathering has a clear activity, people are more likely to commit. A shared interest beats a vague \u201cdrinks sometime\u201d every time.",
  },
];

// ── "Why This Works" benefit cards ────────────────────────────────────────
const BENEFIT_CARDS = [
  {
    accentColor: "secondary.main" as const,
    title: "Shared interests make it easy to say yes",
    body: "When you already have something in common, there\u2019s less awkwardness about meeting up. A shared hobby is a built-in conversation starter and a reason to come back.",
  },
  {
    accentColor: "primary.main" as const,
    title: "Clear plans mean better follow-through",
    body: "People are more likely to show up when the details are clear, what\u2019s happening, where it is, and who else is coming.",
  },
  {
    accentColor: "secondary.main" as const,
    title: "Smaller gatherings feel more approachable",
    body: "NewChums is built around events that don\u2019t require a big commitment: a coffee walk, a board game session, an afternoon pottery class.",
  },
];

export default function LandingPageContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [activeCategory, setActiveCategory] = useState("All");

  const filteredEvents =
    activeCategory === "All"
      ? MOCK_EVENTS
      : MOCK_EVENTS.filter((e) => e.category === activeCategory);

  return (
    <Box sx={{ pt: { xs: 4, sm: 6, md: 8 }, pb: { xs: 4, sm: 6 } }}>

      {/* ── Section 1: Hero ── */}
      <Box component="section" sx={{ pb: { xs: 6, sm: 8, md: 10 } }}>
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="center">

          {/* Left: copy + CTAs */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3}>
              {/* Eyebrow */}
              <Typography
                variant="overline"
                sx={{
                  color: "secondary.main",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: "0.7rem",
                  display: "block",
                }}
              >
                Shared interests bring people together
              </Typography>

              {/* H1 — preserved from original */}
              <Typography
                component="h1"
                variant="h1"
                fontWeight={900}
                sx={{
                  fontSize: { xs: "2.25rem", sm: "2.75rem", md: "3rem" },
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  mt: "0 !important",
                }}
              >
                Organize{" "}
                <Box component="span" sx={{ color: "primary.main" }}>
                  hobbies and events
                </Box>
                {" "}without the group chat chaos
              </Typography>

              {/* Subtext — preserved from original */}
              <Typography
                variant="h5"
                fontWeight={400}
                color="text.secondary"
                sx={{
                  lineHeight: 1.7,
                  fontSize: { xs: "1rem", sm: "1.125rem" },
                  mt: "0 !important",
                }}
              >
                Sign up once and get notified when people nearby are organizing
                activities around your interests.
              </Typography>

              {/* CTAs */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{ pt: 0.5 }}
              >
                {isLoggedIn ? (
                  <>
                    <Button
                      component={Link}
                      href="/events"
                      variant="contained"
                      color="primary"
                      size="large"
                      sx={{
                        px: 4,
                        py: 1.625,
                        fontWeight: 600,
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      Browse gatherings
                    </Button>
                    <Button
                      component={Link}
                      href="/profile"
                      variant="outlined"
                      color="primary"
                      size="large"
                      sx={{
                        px: 4,
                        py: 1.625,
                        fontWeight: 600,
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      My profile
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      component={Link}
                      href="/signup"
                      variant="contained"
                      color="primary"
                      size="large"
                      sx={{
                        px: 4,
                        py: 1.625,
                        fontWeight: 600,
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      Sign up
                    </Button>
                    <Button
                      component="a"
                      href="#how-it-works"
                      variant="outlined"
                      color="primary"
                      size="large"
                      sx={{
                        px: 4,
                        py: 1.625,
                        fontWeight: 600,
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      How it works
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </Grid>

          {/* Right: mini product preview panel — desktop only */}
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: { xs: "none", md: "block" } }}>
            <Box
              sx={{
                backgroundColor: "background.paper",
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                overflow: "hidden",
                boxShadow: "0 4px 32px rgba(37,99,235,0.08), 0 1px 8px rgba(0,0,0,0.05)",
              }}
            >
              {/* Panel header */}
              <Box
                sx={{
                  px: 2.5,
                  py: 1.75,
                  backgroundColor: "primary.light",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                      opacity: 0.75,
                    }}
                  />
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    color="primary.dark"
                    sx={{ letterSpacing: "0.07em", fontSize: "0.6875rem" }}
                  >
                    GATHERINGS NEAR YOU
                  </Typography>
                </Stack>
              </Box>

              {/* Event rows */}
              {HERO_PREVIEW_EVENTS.map((event, i) => (
                <Box
                  key={event.id}
                  sx={{
                    px: 2.5,
                    py: 2.25,
                    borderBottom:
                      i < HERO_PREVIEW_EVENTS.length - 1 ? "1px solid" : "none",
                    borderColor: "divider",
                    transition: "background-color 0.15s",
                    "&:hover": { backgroundColor: "grey.50" },
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="flex-start"
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "primary.main",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          fontSize: "0.6875rem",
                        }}
                      >
                        {event.category}
                      </Typography>
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        sx={{ lineHeight: 1.35 }}
                      >
                        {event.title}
                      </Typography>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <PeopleRoundedIcon sx={{ fontSize: 11, color: "text.disabled" }} />
                        <Typography variant="caption" color="text.secondary">
                          {event.attending} attending
                        </Typography>
                      </Stack>
                    </Stack>

                    <Stack alignItems="flex-end" spacing={0.75}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: "nowrap", fontWeight: 500 }}
                      >
                        {event.dayTime}
                      </Typography>
                      {event.spots > 0 && (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            bgcolor: (t) => `${t.palette.secondary.main}20`,
                            border: "1px solid",
                            borderColor: (t) => `${t.palette.secondary.main}50`,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontSize: "0.625rem",
                              fontWeight: 700,
                              color: "secondary.dark",
                            }}
                          >
                            {event.spots} spots
                          </Typography>
                        </Box>
                      )}
                    </Stack>
                  </Stack>
                </Box>
              ))}

              {/* Panel footer */}
              <Box
                sx={{
                  px: 2.5,
                  py: 1.5,
                  backgroundColor: "grey.50",
                  borderTop: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontWeight: 500 }}
                >
                  Sign up to see gatherings near you &rarr;
                </Typography>
              </Box>
            </Box>
          </Grid>

        </Grid>
      </Box>

      {/* ── Section 2: Event Discovery ── */}
      {/*
       * FUTURE-READY NOTE:
       * Replace MOCK_EVENTS with real API data. Recommended fallback order:
       *   1. Events near the user (if location known and logged in)
       *   2. Featured / recently active events (fallback for logged-out / no location)
       *   3. Empty state below if no events available
       * The filteredEvents, card rendering, and chip filter UI are all ready for real data.
       */}
      <Box
        component="section"
        id="discover"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={1100} mx="auto">
          <SectionHeader
            title="See the kinds of gatherings NewChums makes easier"
            emphasis="primary"
            accentColor="secondary"
          />

          <Typography
            variant="body1"
            sx={{
              mb: { xs: 3, sm: 4 },
              lineHeight: 1.75,
              textAlign: { xs: "center", sm: "left" },
              maxWidth: 680,
            }}
          >
            From board game nights to coffee walks, real activities, shared interests,
            no group chat needed. Sign up to discover what&apos;s happening near you.
          </Typography>

          {/* Category filter chips */}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 1,
              mb: { xs: 3.5, sm: 4.5 },
              justifyContent: { xs: "center", sm: "flex-start" },
            }}
          >
            {FILTER_CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat}
                size="small"
                onClick={() => setActiveCategory(cat)}
                variant={activeCategory === cat ? "filled" : "outlined"}
                color={activeCategory === cat ? "primary" : "default"}
                sx={{
                  fontWeight: activeCategory === cat ? 600 : 400,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              />
            ))}
          </Box>

          {/* Event cards */}
          {filteredEvents.length > 0 ? (
            <Grid container spacing={{ xs: 2, sm: 2.5 }}>
              {filteredEvents.map((event) => (
                <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Box
                    sx={{
                      backgroundColor: "background.paper",
                      borderRadius: 2,
                      p: { xs: 2.5, sm: 3 },
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      boxShadow: (theme) =>
                        theme.palette.mode === "light"
                          ? "0 1px 6px rgba(0,0,0,0.07)"
                          : "none",
                      transition: "box-shadow 0.2s, transform 0.2s",
                      "&:hover": {
                        boxShadow: "0 4px 16px rgba(0,0,0,0.11)",
                        transform: "translateY(-2px)",
                      },
                    }}
                  >
                    {/* Category chip */}
                    <Chip
                      label={event.category}
                      size="small"
                      variant="outlined"
                      color="primary"
                      sx={{
                        alignSelf: "flex-start",
                        mb: 1.5,
                        fontSize: "0.6875rem",
                        height: 22,
                      }}
                    />

                    {/* Title */}
                    <Typography
                      variant="h6"
                      component="h3"
                      fontWeight={700}
                      sx={{
                        mb: 1.5,
                        fontSize: { xs: "1rem", sm: "1.0625rem" },
                        lineHeight: 1.3,
                        flex: "0 0 auto",
                      }}
                    >
                      {event.title}
                    </Typography>

                    {/* Meta */}
                    <Stack spacing={0.75} sx={{ mb: "auto" }}>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <AccessTimeRoundedIcon
                          sx={{ fontSize: 14, color: "text.disabled" }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {event.dayTime}
                        </Typography>
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.75}>
                        <LocationOnRoundedIcon
                          sx={{ fontSize: 14, color: "text.disabled" }}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {event.location}
                        </Typography>
                      </Stack>
                    </Stack>

                    {/* Footer */}
                    <Box
                      sx={{
                        mt: 2.5,
                        pt: 2,
                        borderTop: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                      >
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <PeopleRoundedIcon
                            sx={{ fontSize: 14, color: "text.disabled" }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {event.attending} attending
                          </Typography>
                        </Stack>
                        {event.spots > 0 ? (
                          <Typography
                            variant="caption"
                            sx={{ color: "secondary.dark", fontWeight: 600 }}
                          >
                            {event.spots} spots left
                          </Typography>
                        ) : (
                          <Chip
                            label="Full"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 20,
                              fontSize: "0.6875rem",
                              color: "text.secondary",
                              borderColor: "divider",
                            }}
                          />
                        )}
                      </Stack>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          ) : (
            /* Empty state — shown if API returns no events for a category */
            <Box sx={{ textAlign: "center", py: { xs: 6, sm: 8 } }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                No gatherings in this category yet.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Be the first to organize one.
              </Typography>
            </Box>
          )}

          {/* Bottom note + CTA */}
          <Box sx={{ mt: { xs: 4, sm: 5 }, textAlign: { xs: "center", sm: "left" } }}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2.5, fontStyle: "italic" }}
            >
              These are examples of the kinds of gatherings you&apos;ll find on NewChums.
            </Typography>
            {!isLoggedIn && (
              <Button
                component={Link}
                href="/signup"
                variant="contained"
                color="primary"
                size="large"
                sx={{
                  px: 5,
                  py: 1.5,
                  fontWeight: 600,
                  borderRadius: 2.5,
                  minWidth: { xs: "100%", sm: "auto" },
                  textTransform: "none",
                }}
              >
                Sign up to discover plans near you
              </Button>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── Section 3: Making Plans Easier ── */}
      <Box
        component="section"
        id="how-it-works"
        sx={SECTION_SPACING}
      >
        <Box maxWidth={900} mx="auto" sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader
            title="Better plans start with a clearer place to organize them"
            emphasis="primary"
            accentColor="secondary"
          />

          <Typography
            variant="body1"
            sx={{ mb: { xs: 4, sm: 5 }, lineHeight: 1.75 }}
          >
            NewChums makes it easy to turn &ldquo;we should do something&rdquo; into an actual
            plan, whether you&apos;re organizing things with friends you already know or
            discovering others who enjoy the same things you do.
          </Typography>

          <Grid container spacing={{ xs: 5, sm: 5, md: 6 }}>
            {PLAN_FEATURES.map(({ Icon, title, body }) => (
              <Grid key={title} size={{ xs: 12, sm: 4 }}>
                <Stack
                  spacing={1.75}
                  alignItems={{ xs: "center", sm: "flex-start" }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 24, color: "primary.main" }} />
                  </Box>
                  <Typography
                    variant="h6"
                    component="h3"
                    fontWeight={700}
                    sx={{
                      fontSize: { xs: "1rem", sm: "1.0625rem" },
                      lineHeight: 1.35,
                      textAlign: { xs: "center", sm: "left" },
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      lineHeight: 1.75,
                      textAlign: { xs: "center", sm: "left" },
                    }}
                  >
                    {body}
                  </Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Section 4: Why This Works ── */}
      <Box
        component="section"
        id="why-this-works"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.50" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          borderTop: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "light" ? "grey.200" : "grey.800",
        }}
      >
        <Box maxWidth={900} mx="auto">
          <SectionHeader
            title="A simpler way to get together"
            emphasis="primary"
            accentColor="secondary"
          />

          <Typography
            variant="body1"
            sx={{
              mb: { xs: 4, sm: 5 },
              lineHeight: 1.75,
              textAlign: { xs: "center", sm: "left" },
            }}
          >
            Most plans with friends fall apart somewhere between &ldquo;good idea&rdquo;
            and &ldquo;actually doing it.&rdquo; NewChums is built around the things that
            help people follow through.
          </Typography>

          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {BENEFIT_CARDS.map(({ accentColor, title, body }) => (
              <Grid key={title} size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderTop: "3px solid",
                    borderColor: accentColor,
                    borderRadius: 2,
                    p: { xs: 3, sm: 3.5 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light"
                        ? "0 1px 6px rgba(0,0,0,0.07)"
                        : "none",
                  }}
                >
                  <Typography
                    variant="h6"
                    component="h3"
                    fontWeight={700}
                    sx={{
                      mb: 1.25,
                      fontSize: { xs: "1rem", sm: "1.0625rem" },
                      lineHeight: 1.35,
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ lineHeight: 1.75 }}
                  >
                    {body}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Bridge to Science of Friendship */}
          <Box
            sx={{
              mt: { xs: 4, sm: 5 },
              pl: { xs: 0, sm: 3 },
              pt: { xs: 2.5, sm: 0.5 },
              pb: { xs: 0.5, sm: 0.5 },
              borderLeft: { xs: "none", sm: "3px solid" },
              borderTop: { xs: "2px solid", sm: "none" },
              borderColor: "secondary.main",
              textAlign: { xs: "center", sm: "left" },
            }}
          >
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              There&apos;s research behind why this works.{" "}
              <Typography
                component={Link}
                href="/science-of-friendship"
                variant="body1"
                sx={{
                  color: "primary.main",
                  fontWeight: 600,
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Read the science &rarr;
              </Typography>
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Section 5: CTA ── */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 8, sm: 12 },
          textAlign: "center",
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? theme.palette.primary.dark : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 3, sm: 4 },
          color: "white",
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            backgroundColor: "secondary.main",
          },
        }}
      >
        <Box maxWidth={800} mx="auto">
          {/* Eyebrow */}
          <Typography
            variant="overline"
            sx={{
              display: "block",
              mb: 1.5,
              opacity: 0.65,
              letterSpacing: 2,
              fontSize: "0.6875rem",
              fontWeight: 600,
            }}
          >
            Ready to make better plans?
          </Typography>

          {/* Heading */}
          <Typography
            component="h2"
            variant="h4"
            fontWeight={700}
            sx={{
              mb: 2,
              fontSize: { xs: "1.5rem", sm: "2rem" },
              lineHeight: 1.25,
              color: "inherit",
            }}
          >
            Organize something around what you already enjoy
          </Typography>

          {/* Subtext */}
          <Typography
            variant="body1"
            sx={{
              mb: { xs: 6, sm: 8 },
              opacity: 0.8,
              lineHeight: 1.75,
              maxWidth: 480,
              mx: "auto",
            }}
          >
            Sign up once, add a few hobbies, and start discovering better plans.
          </Typography>

          <Divider
            sx={{
              borderColor: "rgba(255,255,255,0.12)",
              mb: { xs: 6, sm: 8 },
              maxWidth: 480,
              mx: "auto",
            }}
          />

          {/* CTA button */}
          <Button
            component={Link}
            href={isLoggedIn ? "/" : "/signup"}
            variant="contained"
            color="secondary"
            size="large"
            sx={{
              px: { xs: 5, sm: 6 },
              py: 1.75,
              fontSize: "1.0625rem",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2.5,
              minWidth: { xs: "100%", sm: 240 },
              maxWidth: { xs: "none", sm: 320 },
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              "&:hover": {
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
              },
            }}
          >
            {isLoggedIn ? "Explore NewChums" : "Get started"}
          </Button>
        </Box>
      </Box>

    </Box>
  );
}
