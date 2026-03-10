"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import SectionHeader from "@/components/ui/SectionHeader";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EmojiPeopleRoundedIcon from "@mui/icons-material/EmojiPeopleRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import type { SvgIconComponent } from "@mui/icons-material";

/**
 * Public marketing page: "How it Works."
 * Layout provides Container — this component uses maxWidth wrappers
 * for consistent bounds with the other marketing pages.
 */

const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };
const CONTENT_MAX_WIDTH = 800;

// ── Step-by-step walkthrough data ─────────────────────────────────────────

type WalkthroughStep = {
  num: string;
  title: string;
  paragraphs: string[];
  Icon: SvgIconComponent;
};

const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    num: "01",
    title: "Tell us what you enjoy",
    Icon: StyleRoundedIcon,
    paragraphs: [
      "Pick the hobbies and interests that matter to you, board games, hiking, pottery, cooking, card games, whatever you like.",
      "Your interests help us surface relevant gatherings and connect you with people who enjoy the same things.",
    ],
  },
  {
    num: "02",
    title: "Explore gatherings or create your own",
    Icon: ExploreRoundedIcon,
    paragraphs: [
      "Browse gatherings happening near you, or start one yourself. Creating a plan is quick, name it, pick a time and place, and share what people can expect.",
      "Board game nights, coffee walks, study sessions, beginner sports, the best gatherings are simple and specific.",
    ],
  },
  {
    num: "03",
    title: "Invite the right people",
    Icon: GroupsRoundedIcon,
    paragraphs: [
      "Share your plan with friends, chums, or let others nearby discover it. NewChums helps surface people whose interests match the gathering.",
      "You stay in control, choose who you want to invite, or let interested people find you.",
    ],
  },
  {
    num: "04",
    title: "Coordinate without the chaos",
    Icon: ChatRoundedIcon,
    paragraphs: [
      "See who\u2019s coming, chat about the plan, and make changes, all in one place. No more chasing replies across scattered threads.",
      "Attendees can suggest alternate times and share availability, so finding the right moment is easier for everyone.",
    ],
  },
  {
    num: "05",
    title: "Meet up and enjoy it",
    Icon: EmojiPeopleRoundedIcon,
    paragraphs: [
      "When the day arrives, everyone knows the plan. Show up, do something you enjoy, and spend time with people who share your interest.",
      "Most NewChums gatherings are small and low-pressure, the kind that are easy to say yes to.",
    ],
  },
  {
    num: "06",
    title: "Keep the momentum going",
    Icon: RepeatRoundedIcon,
    paragraphs: [
      "After a great gathering, the connection does not have to end. Stay in touch, plan the next one, or discover new gatherings from people you've met.",
      "The more you show up, the easier it gets, and the more your community grows.",
    ],
  },
];

// ── "Made for real plans" group-chat pain points ──────────────────────────

const PAIN_POINTS = [
  "\u201cWe should do something sometime\u201d never turns into a plan",
  "Good ideas get buried in the group chat",
  "Scheduling is awkward and nobody wants to pin things down",
  "People mean well, but plans fall apart before they start",
];

// ── Friends + new connections cards ───────────────────────────────────────

const AUDIENCE_CARDS = [
  {
    accentColor: "secondary.main" as const,
    Icon: PeopleRoundedIcon,
    title: "Organize with people you already know",
    body: "Create a plan and invite friends directly. Everyone gets the same clear details, no more chasing replies or losing track in long group threads.",
  },
  {
    accentColor: "primary.main" as const,
    Icon: FavoriteRoundedIcon,
    title: "Discover plans through shared interests",
    body: "When you enjoy the same hobbies, there\u2019s already common ground. Browse local gatherings, show up, and new connections can happen naturally.",
  },
];

// ── Discovery section mock previews ───────────────────────────────────────
// Structured for easy future replacement with real API data.

const DISCOVERY_PREVIEWS = [
  {
    id: 1,
    category: "Board Games",
    title: "Thursday Board Game Night",
    dayTime: "Every Thu \u00b7 7 pm",
    location: "Community Space",
    attending: 6,
  },
  {
    id: 2,
    category: "Coffee \u0026 Social",
    title: "Morning Coffee Walk",
    dayTime: "Saturday \u00b7 9 am",
    location: "Riverside Park",
    attending: 4,
  },
  {
    id: 3,
    category: "Sport",
    title: "Beginner Pickleball",
    dayTime: "Wednesday \u00b7 9 am",
    location: "Sports Centre",
    attending: 5,
  },
];

// ── Trust / comfort benefit items ─────────────────────────────────────────

const TRUST_ITEMS = [
  {
    Icon: FavoriteRoundedIcon,
    label: "Shared interests make meeting up easier",
  },
  {
    Icon: CalendarMonthRoundedIcon,
    label: "Clear plans reduce friction",
  },
  {
    Icon: PeopleRoundedIcon,
    label: "Smaller gatherings feel more approachable",
  },
  {
    Icon: CheckCircleRoundedIcon,
    label: "The goal is real-life connection, not more complexity",
  },
];

export default function HowItWorksContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 } }}>

      {/* ─────────────── Section 1: Hero ─────────────── */}
      <Box component="section" sx={{ ...SECTION_SPACING, mb: { xs: 2, sm: 4 } }}>
        <Stack alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
          {/* Eyebrow */}
          <Typography
            variant="overline"
            sx={{
              color: "secondary.main",
              fontWeight: 700,
              letterSpacing: "0.12em",
              fontSize: "0.7rem",
              display: "block",
              mb: 2,
            }}
          >
            Product walkthrough
          </Typography>

          {/* Heading */}
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{
              fontSize: "4rem",
              lineHeight: 1.2,
              mb: 3,
            }}
          >
            From shared interests to real&nbsp;plans
          </Typography>

          {/* Gold accent bar */}
          <Box
            sx={{
              width: 48,
              height: 3,
              bgcolor: "secondary.main",
              borderRadius: 1,
              mb: { xs: 3.5, sm: 4.5 },
            }}
          />

          {/* Subheading */}
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{
              lineHeight: 1.7,
              fontSize: { xs: "1.0625rem", sm: "1.25rem" },
              mb: 2.5,
            }}
          >
            NewChums helps you organize gatherings around the things you already enjoy,
            whether you&apos;re making plans with friends or discovering people nearby
            who share your interests.
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.secondary"
            sx={{
              lineHeight: 1.7,
              fontSize: { xs: "1.0625rem", sm: "1.125rem" },
              mb: { xs: 4, sm: 5 },
            }}
          >
            Here&apos;s how it works, step by step.
          </Typography>

          {/* CTAs */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            sx={{ width: "100%", maxWidth: 420 }}
          >
            {!isLoggedIn && (
              <Button
                component={Link}
                href="/signup"
                variant="contained"
                color="primary"
                size="large"
                sx={{
                  px: { xs: 4, sm: 5 },
                  py: 1.625,
                  fontSize: "1rem",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  textTransform: "none",
                  minWidth: { xs: "100%", sm: 160 },
                }}
              >
                Sign up
              </Button>
            )}
            <Button
              component="a"
              href="#walkthrough"
              variant="outlined"
              color="primary"
              size="large"
              sx={{
                px: { xs: 4, sm: 5 },
                py: 1.625,
                fontSize: "1rem",
                fontWeight: 600,
                borderRadius: 2.5,
                textTransform: "none",
                minWidth: { xs: "100%", sm: 160 },
              }}
            >
              See the steps
            </Button>
          </Stack>
        </Stack>

        {/* Hero image placeholder */}
        <Box
          aria-hidden="true"
          sx={{
            mt: { xs: 5, sm: 7 },
            mx: "auto",
            maxWidth: CONTENT_MAX_WIDTH,
            borderRadius: 2,
            overflow: "hidden",
            width: "100%",
            aspectRatio: "16 / 9",
            background: (theme) =>
              `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.grey[200]} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.5 }}>
            <CalendarMonthRoundedIcon sx={{ fontSize: 56, color: "primary.main" }} />
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Image placeholder, the NewChums experience
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* ─────────────── Section 2: Step-by-step walkthrough ─────────────── */}
      <Box
        component="section"
        id="walkthrough"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader
            title="How NewChums works in six simple steps"
            emphasis="primary"
            accentColor="secondary"
          />
          <Typography
            variant="body1"
            sx={{
              mb: { xs: 5, sm: 6 },
              lineHeight: 1.75,
              textAlign: { xs: "center", sm: "left" },
            }}
          >
            From picking your interests to meeting up in person, each step is
            designed to make organizing and attending gatherings as easy as possible.
          </Typography>

          <Stack spacing={{ xs: 5, sm: 6 }} sx={{ mb: { xs: 5, sm: 6 } }}>
            {WALKTHROUGH_STEPS.map(({ num, title, paragraphs, Icon }, index) => {
              const isEven = index % 2 === 0;
              return (
                <Box
                  key={num}
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", sm: "row" },
                    alignItems: { xs: "center", sm: "flex-start" },
                    gap: { xs: 2.5, sm: 3 },
                    textAlign: { xs: "center", sm: "left" },
                  }}
                >
                  {/* Number + icon block */}
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      bgcolor: isEven ? "primary.light" : (theme) => `${theme.palette.secondary.main}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      position: "relative",
                    }}
                  >
                    <Icon
                      sx={{
                        fontSize: 26,
                        color: isEven ? "primary.main" : "secondary.dark",
                      }}
                    />
                    {/* Step number badge */}
                    <Box
                      sx={{
                        position: "absolute",
                        top: -8,
                        right: -8,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        bgcolor: "secondary.main",
                        color: (theme) => theme.palette.primary.dark,
                        fontWeight: 800,
                        fontSize: "0.6875rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {num}
                    </Box>
                  </Box>

                  {/* Copy */}
                  <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h5"
                      component="h3"
                      fontWeight={700}
                      sx={{
                        fontSize: { xs: "1.15rem", sm: "1.25rem" },
                        lineHeight: 1.3,
                        textAlign: { xs: "center", sm: "left" },
                      }}
                    >
                      {title}
                    </Typography>
                    {paragraphs.map((text, i) => (
                      <Typography
                        key={i}
                        variant="body1"
                        color="text.secondary"
                        sx={{
                          lineHeight: 1.75,
                          textAlign: { xs: "center", sm: "left" },
                        }}
                      >
                        {text}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              );
            })}
          </Stack>

          {/* Screenshot placeholder — will be replaced with plan creation screen */}
          <Box
            aria-hidden="true"
            sx={{
              borderRadius: 2.5,
              overflow: "hidden",
              width: "100%",
              aspectRatio: "16 / 8",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.grey[200]} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.45 }}>
              <CalendarMonthRoundedIcon sx={{ fontSize: 52, color: "primary.main" }} />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Screenshot placeholder — Create a plan
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* ─────────────── Section 3: Made for real plans ─────────────── */}
      <Box
        component="section"
        id="real-plans"
        sx={SECTION_SPACING}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader
            title='Turn "we should do something" into an actual plan'
            emphasis="primary"
            accentColor="secondary"
          />

          <Typography variant="body1" sx={{ lineHeight: 1.75, mb: 2.5 }}>
            Most plans with friends run into the same problems. Good ideas come up
            in a group chat, people agree in principle, and then&hellip; nothing happens.
          </Typography>

          {/* Pain points — divider list */}
          <Stack
            divider={<Divider />}
            spacing={0}
            sx={{
              mb: { xs: 3.5, sm: 4 },
              maxWidth: { xs: 400, sm: "none" },
              mx: { xs: "auto", sm: 0 },
            }}
          >
            {PAIN_POINTS.map((text) => (
              <Box
                key={text}
                sx={{
                  py: 1.75,
                  textAlign: { xs: "center", sm: "left" },
                }}
              >
                <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                  {text}
                </Typography>
              </Box>
            ))}
          </Stack>

          {/* Callout */}
          <Box
            sx={{
              pl: { xs: 0, sm: 3 },
              pt: { xs: 2.5, sm: 0.5 },
              pb: { xs: 0.5, sm: 0.5 },
              borderLeft: { xs: "none", sm: "3px solid" },
              borderTop: { xs: "2px solid", sm: "none" },
              borderColor: "secondary.main",
              textAlign: { xs: "center", sm: "left" },
              mb: { xs: 3.5, sm: 4 },
            }}
          >
            <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75 }}>
              NewChums gives plans a real home, visible, organized, and easy
              for people to commit to.
            </Typography>
          </Box>

          {/* Mini mock: coordination panel */}
          <Box
            sx={{
              backgroundColor: "background.paper",
              borderRadius: 2.5,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
              boxShadow: (theme) =>
                theme.palette.mode === "light"
                  ? "0 2px 16px rgba(0,0,0,0.06)"
                  : "none",
              maxWidth: 480,
              mx: { xs: "auto", sm: 0 },
            }}
          >
            {/* Mock panel header */}
            <Box
              sx={{
                px: 2.5,
                py: 1.75,
                backgroundColor: "primary.light",
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                fontWeight={700}
                color="primary.dark"
                sx={{ letterSpacing: "0.07em", fontSize: "0.6875rem" }}
              >
                BOARD GAME NIGHT &middot; THURSDAY
              </Typography>
            </Box>

            {/* Mock rows */}
            {[
              { name: "Alex", status: "Going", statusColor: "success.main" },
              { name: "Jordan", status: "Maybe, suggested Fri?", statusColor: "secondary.dark" },
              { name: "Sam", status: "Going", statusColor: "success.main" },
              { name: "Taylor", status: "Waiting", statusColor: "text.disabled" },
            ].map((row, i, arr) => (
              <Box
                key={row.name}
                sx={{
                  px: 2.5,
                  py: 1.5,
                  borderBottom: i < arr.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                }}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={500}>
                    {row.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: row.statusColor, fontWeight: 600 }}
                  >
                    {row.status}
                  </Typography>
                </Stack>
              </Box>
            ))}

            {/* Footer */}
            <Box
              sx={{
                px: 2.5,
                py: 1.5,
                backgroundColor: "grey.50",
                borderTop: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Everyone sees the same plan, no chasing replies
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ─────────────── Section 4: Friends + new connections ─────────────── */}
      <Box
        component="section"
        id="who-its-for"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.50" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader
            title="Works for existing friends and new connections"
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
            NewChums is not just about meeting strangers. It&apos;s a better way to organize
            anything social, from coordinating plans with friends you already have, to
            finding people nearby who enjoy the same things you do.
          </Typography>

          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {AUDIENCE_CARDS.map(({ accentColor, Icon, title, body }) => (
              <Grid key={title} size={{ xs: 12, sm: 6 }}>
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
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 2,
                    }}
                  >
                    <Icon sx={{ fontSize: 20, color: "primary.main" }} />
                  </Box>
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
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    {body}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Screenshot placeholder — will be replaced with Your Plans / profile screen */}
          <Box
            aria-hidden="true"
            sx={{
              mt: { xs: 4, sm: 5 },
              borderRadius: 2.5,
              overflow: "hidden",
              width: "100%",
              aspectRatio: "16 / 7",
              background: (theme) =>
                `linear-gradient(135deg, ${theme.palette.grey[100]} 0%, ${theme.palette.primary.light} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.45 }}>
              <GroupsRoundedIcon sx={{ fontSize: 52, color: "primary.main" }} />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Screenshot placeholder — Your Plans view
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* ─────────────── Section 5: Discovery / nearby events ─────────────── */}
      {/*
       * FUTURE-READY NOTE:
       * Replace DISCOVERY_PREVIEWS with real API data when available.
       * The mock panel structure mirrors the homepage discovery section
       * and can be swapped to live event cards without layout changes.
       */}
      <Box
        component="section"
        id="discovery"
        sx={SECTION_SPACING}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader
            title="Discover plans without the endless searching"
            emphasis="primary"
            accentColor="secondary"
          />

          <Stack spacing={2} sx={{ mb: { xs: 4, sm: 5 }, textAlign: { xs: "center", sm: "left" } }}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Once you set your interests, NewChums can surface gatherings that are relevant
              to you, no more scrolling through scattered posts and community boards
              trying to find something worth joining.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Get notified when something you care about is being planned nearby, or browse
              at your own pace.
            </Typography>
          </Stack>

          {/* Discovery mock panel */}
          <Box
            sx={{
              backgroundColor: "background.paper",
              borderRadius: 2.5,
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
              boxShadow: (theme) =>
                theme.palette.mode === "light"
                  ? "0 2px 16px rgba(0,0,0,0.06)"
                  : "none",
              maxWidth: 520,
              mx: { xs: "auto", sm: 0 },
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
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <NotificationsRoundedIcon
                sx={{ fontSize: 14, color: "primary.main", opacity: 0.8 }}
              />
              <Typography
                variant="caption"
                fontWeight={700}
                color="primary.dark"
                sx={{ letterSpacing: "0.07em", fontSize: "0.6875rem" }}
              >
                NEARBY GATHERINGS MATCHING YOUR INTERESTS
              </Typography>
            </Box>

            {/* Event rows */}
            {DISCOVERY_PREVIEWS.map((event, i) => (
              <Box
                key={event.id}
                sx={{
                  px: 2.5,
                  py: 2,
                  borderBottom:
                    i < DISCOVERY_PREVIEWS.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
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
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.35 }}>
                      {event.title}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <AccessTimeRoundedIcon sx={{ fontSize: 11, color: "text.disabled" }} />
                        <Typography variant="caption" color="text.secondary">
                          {event.dayTime}
                        </Typography>
                      </Stack>
                      <Stack direction="row" alignItems="center" spacing={0.5}>
                        <LocationOnRoundedIcon sx={{ fontSize: 11, color: "text.disabled" }} />
                        <Typography variant="caption" color="text.secondary">
                          {event.location}
                        </Typography>
                      </Stack>
                    </Stack>
                  </Stack>

                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0, pt: 0.5 }}>
                    <PeopleRoundedIcon sx={{ fontSize: 12, color: "text.disabled" }} />
                    <Typography variant="caption" color="text.secondary">
                      {event.attending}
                    </Typography>
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
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Sign up to see what&apos;s happening near you &rarr;
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ─────────────── Section 6: Trust / comfort ─────────────── */}
      <Box
        component="section"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader
            title="Built for the way people actually connect"
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
            NewChums is designed around the idea that real connection happens when the
            conditions are right, shared interests, clear plans, and
            low-pressure settings.
          </Typography>

          <Grid container spacing={{ xs: 2.5, sm: 3 }}>
            {TRUST_ITEMS.map(({ Icon, label }) => (
              <Grid key={label} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    backgroundColor: "background.paper",
                    borderRadius: 2,
                    p: { xs: 2.5, sm: 2.5 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light"
                        ? "0 1px 4px rgba(0,0,0,0.05)"
                        : "none",
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 18, color: "primary.main" }} />
                  </Box>
                  <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.4 }}>
                    {label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Links to related pages */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 3 }}
            sx={{
              mt: { xs: 4, sm: 5 },
              textAlign: { xs: "center", sm: "left" },
            }}
          >
            <Typography
              component={Link}
              href="/science-of-friendship"
              variant="body2"
              sx={{
                color: "primary.main",
                fontWeight: 600,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              Read the science &rarr;
            </Typography>
            <Typography
              component={Link}
              href="/safety-center"
              variant="body2"
              sx={{
                color: "primary.main",
                fontWeight: 600,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              Safety Center &rarr;
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* ─────────────── Section 7: CTA ─────────────── */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 8, sm: 12 },
          textAlign: "center",
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? theme.palette.primary.main : "grey.900",
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
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
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
            Getting started takes less than a minute
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
            Make plans that actually happen
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
            Sign up once, add the hobbies you care about, and start seeing
            what&apos;s possible.
          </Typography>

          {/* Steps */}
          <Grid
            container
            spacing={{ xs: 4, sm: 3 }}
            justifyContent="center"
            sx={{ mb: { xs: 6, sm: 8 }, maxWidth: 680, mx: "auto" }}
          >
            {[
              isLoggedIn ? "Open your profile" : "Sign up",
              "Add your interests",
              "Discover and organize gatherings",
            ].map((text, i) => (
              <Grid key={text} size={{ xs: 12, sm: 4 }}>
                <Stack alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      border: "2px solid",
                      borderColor: "secondary.main",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "secondary.main",
                      fontWeight: 700,
                      fontSize: "1.1rem",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography
                    variant="body1"
                    fontWeight={500}
                    sx={{ opacity: 0.9, lineHeight: 1.5, maxWidth: 180 }}
                  >
                    {text}
                  </Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>

          <Divider
            sx={{
              borderColor: "rgba(255,255,255,0.12)",
              mb: { xs: 6, sm: 8 },
              maxWidth: 480,
              mx: "auto",
            }}
          />

          {/* CTA Button */}
          <Button
            component={Link}
            href={isLoggedIn ? "/" : "/signup"}
            variant="contained"
            color="onPrimary"
            size="large"
            sx={{
              px: { xs: 5, sm: 6 },
              py: 1.75,
              fontSize: "1.0625rem",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2.5,
              minWidth: { xs: "100%", sm: 220 },
              maxWidth: { xs: "none", sm: 300 },
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              "&:hover": {
                boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
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
