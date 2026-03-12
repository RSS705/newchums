"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import Link from "next/link";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import InterestsRoundedIcon from "@mui/icons-material/InterestsRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ThumbUpAltRoundedIcon from "@mui/icons-material/ThumbUpAltRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";

/**
 * Full public homepage content for logged-out visitors.
 * Sections: Hero → Examples (plans) → Why It Helps → Social Upside → CTA
 *
 * Messaging hierarchy: (1) organize and join hobby-based plans around what you enjoy,
 * (2) clear details and easy follow-through, (3) social upside via shared interests.
 * The examples section uses mock data structured for easy replacement with real API data.
 */

const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };

// (Hero image placeholder — the right column of the hero section is an image frame
//  ready to hold a screenshot or product photo. See the Grid item below.)

// ── "How does it work?" two-path flow data ──────────────────────────────────
const HOW_IT_WORKS_JOIN = [
  {
    title: "Add your hobbies to your profile",
    body: "Tell us what you enjoy so we can show you relevant plans nearby.",
  },
  {
    title: "Get notified about nearby plans",
    body: (
      <>
        When someone organizes something you&apos;d enjoy, you&apos;ll <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>hear about it</Box>.
      </>
    ),
  },
  {
    title: "Join and stay in the loop",
    body: (
      <>
        Use the plan&apos;s <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>chat room</Box> for updates and coordination, everything in one place.
      </>
    ),
  },
  {
    title: "Show up and have a great time",
    body: "The real goal here.",
  },
  {
    title: "Leave feedback afterward",
    body: "Your input helps improve future matches and keeps the community strong.",
  },
];

const HOW_IT_WORKS_CREATE = [
  {
    title: "Start a plan around something you love",
    body: "Pick a hobby, add the details, and set it up in minutes.",
  },
  {
    title: "Invite your people",
    body: (
      <>
        Bring your friends, or open it up to <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>others nearby</Box> who share the interest.
      </>
    ),
  },
  {
    title: "Find a time and keep everyone updated",
    body: (
      <>
        Use the <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>built in chat</Box> so nobody misses a thing.
      </>
    ),
  },
  {
    title: "RSVP reminders go out automatically",
    body: (
      <>
        24 hours before the gathering, everyone gets a <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>nudge</Box> to confirm.
      </>
    ),
  },
  {
    title: "Show up and have a great time",
    body: "You made it happen. Well done.",
  },
];

const HOW_IT_WORKS_EXTRAS: {
  imageSrc: string;
  Icon: typeof TuneRoundedIcon;
  title: string;
  body: string;
}[] = [
  {
    imageSrc: "/images/home/Your-Rules.png",
    Icon: TuneRoundedIcon,
    title: "Control who sees your plans",
    body: "Keep it private for your friend group, open it to everyone, or mix both to grow your circle.",
  },
  {
    imageSrc: "/images/home/Hosting-Reputation.png",
    Icon: StarRoundedIcon,
    title: "Build your hosting reputation",
    body: "Organize great experiences and build a track record as someone worth showing up for.",
  },
  {
    imageSrc: "/images/home/No-Shows.png",
    Icon: BlockRoundedIcon,
    title: "No-shows get removed",
    body: "People who bail without notice are eliminated from the system. Your time matters.",
  },
];

// ── "Meet new people" section feature callouts ──────────────────────────────
const MEET_PEOPLE_CALLOUTS: {
  imageSrc?: string;
  Icon: typeof ExploreRoundedIcon;
  title: string;
  body: string;
}[] = [
  {
    imageSrc: "/images/home/Preferences.png",
    Icon: ExploreRoundedIcon,
    title: "Setup your profile",
    body: "Set your hobbies, your location, how far you\u2019d travel, and the kind of people you enjoy spending time with. NewChums handles the rest.",
  },
  {
    imageSrc: "/images/home/Notifications.png",
    Icon: NotificationsActiveRoundedIcon,
    title: "Get notified of plans that fit you",
    body: "You won\u2019t get flooded with everything happening nearby. You\u2019ll only hear about gatherings that match your interests and preferences.",
  },
  {
    imageSrc: "/images/home/Meet.png",
    Icon: VerifiedUserRoundedIcon,
    title: "Your chum preferences are remembered",
    body: "Matching is based on shared hobbies, location, and the social preferences you set. The right people find the right plans.",
  },
];

// ── "Why this works" reasoning cards ─────────────────────────────────────────
const WHY_THIS_WORKS_CARDS: {
  Icon: typeof InterestsRoundedIcon;
  accentColor: string;
  title: string;
  body: string | ReactNode;
}[] = [
  {
    Icon: InterestsRoundedIcon,
    accentColor: "#E65B13",
    title: "Shared hobbies make everything easier",
    body: "When you already have something in common, meeting up feels natural. A shared activity gives people something to do and talk about, not just sit across from each other trying to think of something to say.",
  },
  {
    Icon: PeopleRoundedIcon,
    accentColor: "#1565c0",
    title: "Smaller gatherings, stronger connections",
    body: "Big groups make it hard to get to know anyone. NewChums is designed for the kind of gathering where people actually talk, learn names, and get to know each other.",
  },
  {
    Icon: AutoAwesomeRoundedIcon,
    accentColor: "#7c3aed",
    title: "It gets better the more you use it",
    body: (
      <>
        Your <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>feedback</Box> after each gathering helps improve which plans and people you&apos;re notified about. Each time, the experience becomes more customized to you.
      </>
    ),
  },
];

// ── "NewChums Features" section ──────────────────────────────────────────────
const FEATURES: {
  Icon: typeof TuneRoundedIcon;
  accentColor: string;
  title: string;
  body: string | ReactNode;
}[] = [
  {
    Icon: VisibilityRoundedIcon,
    accentColor: "#1565c0",
    title: "Create public or private plans",
    body: "Create a plan for just your friend group, open it to others nearby, or use a mix of both.",
  },
  {
    Icon: MailOutlineRoundedIcon,
    accentColor: "#E65B13",
    title: "Invite friends easily",
    body: (
      <>
        Send invites directly, and your chums receive an <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>email notification</Box> so they know you&apos;re planning something.
      </>
    ),
  },
  {
    Icon: EventAvailableRoundedIcon,
    accentColor: "#2e7d32",
    title: "RSVP tools",
    body: "Attendees can confirm whether they can make it, and if you allow it, suggest a better time that works for everyone.",
  },
  {
    Icon: ChatRoundedIcon,
    accentColor: "#7c3aed",
    title: "Built-in plan chat",
    body: "Use the plan details page to share updates, coordinate details, or just say hi before meeting up.",
  },
  {
    Icon: NotificationsActiveRoundedIcon,
    accentColor: "#c2410c",
    title: "Automatic reminder nudges",
    body: "Everyone gets an email reminder 24 hours before the plan. No excuses for no-shows and no last-minute confusion.",
  },
  {
    Icon: ThumbUpAltRoundedIcon,
    accentColor: "#0e7490",
    title: "Feedback that improves future matches",
    body: (
      <>
        After the plan, attendees share <Box component="span" sx={{ color: "#0e7490", fontWeight: 600 }}>feedback</Box>. NewChums remembers your preferences and avoids notifying people about your plans who aren&apos;t a good fit, and flags potential mismatches in other people&apos;s plans.
      </>
    ),
  },
  {
    Icon: EmojiEventsRoundedIcon,
    accentColor: "#b45309",
    title: "Earn Chum Points",
    body: (
      <>
        Hosts and attendees earn <Box component="span" sx={{ color: "#b45309", fontWeight: 600 }}>Chum Points</Box> for successful plans, building a reputation as a solid chum who can be relied on.
      </>
    ),
  },
];

const HIGH_FIVE_IMAGE = "/images/home/High-Five.png";
const BROKEN_CHAT_IMAGE = "/images/home/Broken-Chat.png";

export default function LandingPageContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [highFiveImgError, setHighFiveImgError] = useState(false);
  const [brokenChatImgError, setBrokenChatImgError] = useState(false);
  const [extrasImageErrors, setExtrasImageErrors] = useState<Set<string>>(new Set());
  const [meetPeopleImageErrors, setMeetPeopleImageErrors] = useState<Set<string>>(new Set());

  return (
    <Box sx={{ pt: { xs: 4, sm: 6, md: 8 }, pb: { xs: 4, sm: 6 } }}>

      {/* ── Section 1: Hero ── */}
      <Box component="section" sx={{ pb: { xs: 6, sm: 8, md: 10 } }}>
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="stretch">

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
                Start, share, and join plans nearby
              </Typography>

              {/* H1 */}
              <Typography component="h1" variant="h1" sx={{ mt: "0 !important" }}>
                Get off your phone and organize something
              </Typography>

              {/* Subtext */}
              <Typography
                variant="h5"
                fontWeight={400}
                sx={{
                  color: "grey.800",
                  lineHeight: 1.7,
                  fontSize: "1.2rem",
                }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>Life&apos;s short.</Box>{" "}
                Don&apos;t waste it staring at screens.
                Create an account, invite friends, meet new friends, actually be with people.
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
                        fontSize: "1.125rem",
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
                        fontSize: "1.125rem",
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
                        fontSize: "1.125rem",
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      Do something
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
                        fontSize: "1.125rem",
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                      }}
                    >
                      Explain it to me
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </Grid>

          {/* Right: hero image — desktop only, height matches left column */}
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", justifyContent: "center", overflow: "visible" }}>
            <Box
              component="img"
              src="/images/home/Phone-Exploding.png"
              alt="Get off your phone and organize a gathering"
              sx={{
                height: "100%",
                width: "auto",
                maxWidth: "100%",
                objectFit: "contain",
                display: "block",
                transform: "scale(1.25)",
              }}
            />
          </Grid>

        </Grid>
      </Box>

      {/* ── Section 1.5: Brand / Positioning ── */}
      <Box
        component="section"
        sx={{
          py: { xs: 7, sm: 9, md: 11 },
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "#FCECC3" : "grey.900",
        }}
      >
        <Box maxWidth={720} mx="auto" sx={{ textAlign: "center" }}>
          {/* Heading */}
          <Typography
            component="h2"
            variant="h2"
            fontWeight={800}
            sx={{
              fontSize: { xs: "1.85rem", sm: "2.5rem", md: "2.75rem" },
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              mb: 2,
            }}
          >
            Tired of boring nights on the couch?
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="h5"
            fontWeight={500}
            sx={{
              fontSize: { xs: "1.05rem", sm: "1.2rem" },
              lineHeight: 1.6,
              color: "text.secondary",
              mb: { xs: 5, sm: 6 },
            }}
          >
            You&apos;re in the right place. So are we.
          </Typography>

          {/* Accent bar */}
          <Box
            sx={{
              width: 48,
              height: 3.5,
              bgcolor: "primary.main",
              borderRadius: 2,
              mx: "auto",
              mb: { xs: 5, sm: 6 },
            }}
          />

          {/* Messaging pillars */}
          <Stack
            spacing={{ xs: 4, sm: 5 }}
            sx={{ textAlign: { xs: "center", sm: "left" } }}
          >
            {/* Pillar 1 */}
            <Box
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === "light"
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(255,255,255,0.04)",
                borderRadius: 2.5,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 3.5 },
                borderLeft: { xs: "none", sm: "4px solid #E65B13" },
                borderTop: { xs: "3px solid #E65B13", sm: "none" },
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 3 }} alignItems={{ xs: "center", sm: "flex-start" }}>
                {highFiveImgError ? (
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 2,
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <PeopleRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
                  </Box>
                ) : (
                  <Box sx={{ width: 80, height: 80, flexShrink: 0, position: "relative" }}>
                    <Image
                      src={HIGH_FIVE_IMAGE}
                      alt=""
                      width={80}
                      height={80}
                      style={{ objectFit: "contain" }}
                      onError={() => setHighFiveImgError(true)}
                    />
                  </Box>
                )}
                <Box>
                  <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5 }}>
                    For the people who actually show up
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    NewChums is for people who want to <Box component="span" sx={{ fontWeight: 700 }}>organize gatherings with friends</Box>, the people you already know and the new ones you&apos;re
                    excited to meet.
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Pillar 2 */}
            <Box
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === "light"
                    ? "rgba(255,255,255,0.65)"
                    : "rgba(255,255,255,0.04)",
                borderRadius: 2.5,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 3.5 },
                borderLeft: { xs: "none", sm: "4px solid #E65B13" },
                borderTop: { xs: "3px solid #E65B13", sm: "none" },
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 3 }} alignItems={{ xs: "center", sm: "flex-start" }}>
                {brokenChatImgError ? (
                  <Box
                    sx={{
                      width: 80,
                      height: 80,
                      borderRadius: 2,
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <CalendarMonthRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
                  </Box>
                ) : (
                  <Box sx={{ width: 80, height: 80, flexShrink: 0, position: "relative" }}>
                    <Image
                      src={BROKEN_CHAT_IMAGE}
                      alt=""
                      width={80}
                      height={80}
                      style={{ objectFit: "contain" }}
                      onError={() => setBrokenChatImgError(true)}
                    />
                  </Box>
                )}
                <Box>
                  <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5 }}>
                    Built to eliminate every annoyance
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    Stalled group chats, vague &ldquo;let&apos;s do something&rdquo;
                    plans, flaky replies. This tool is built to <Box component="span" sx={{ fontWeight: 700 }}>remove the friction</Box> of
                    getting people together. All of it. Including the unreliable people
                    who take your time for granted.
                  </Typography>
                </Box>
              </Stack>
            </Box>

            {/* Pillar 3 — closing statement */}
            <Box
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === "light"
                    ? "primary.dark"
                    : "grey.800",
                borderRadius: 2.5,
                px: { xs: 3, sm: 4 },
                py: { xs: 3, sm: 3.5 },
                textAlign: "center",
              }}
            >
              <Typography
                variant="body1"
                fontWeight={700}
                sx={{
                  fontSize: { xs: "1.05rem", sm: "1.15rem" },
                  lineHeight: 1.5,
                  color: "white",
                  letterSpacing: "-0.01em",
                }}
              >
                Your time is your most precious resource. We defend it.
              </Typography>
            </Box>
          </Stack>
        </Box>
      </Box>

      {/* ── Section: How Does It Work? ── */}
      <Box
        component="section"
        id="how-it-works"
        sx={SECTION_SPACING}
      >
        <Box maxWidth={1100} mx="auto">
          {/* Section heading */}
          <Box sx={{ textAlign: "center", mb: { xs: 5, sm: 7 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "2.75rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                mb: 2,
              }}
            >
              How does it work?
            </Typography>
            <Typography
              variant="h5"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
              }}
            >
              There are two main ways to use NewChums.
            </Typography>
          </Box>

          {/* Two-path layout */}
          <Grid container spacing={{ xs: 4, md: 5 }}>
            {/* Path 1: Discover & Join */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  backgroundColor: "background.paper",
                  borderRadius: 3,
                  overflow: "hidden",
                  boxShadow: (theme) =>
                    theme.palette.mode === "light"
                      ? "0 2px 12px rgba(0,0,0,0.08)"
                      : "none",
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Card header */}
                <Box
                  sx={{
                    background: "linear-gradient(135deg, #1565c0 0%, #1976d2 100%)",
                    px: { xs: 3, sm: 4 },
                    py: { xs: 3, sm: 3.5 },
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      fontSize: "0.65rem",
                      display: "block",
                      mb: 0.5,
                    }}
                  >
                    Path 1
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    sx={{
                      color: "white",
                      fontSize: { xs: "1.15rem", sm: "1.3rem" },
                      lineHeight: 1.3,
                    }}
                  >
                    Find and join plans around your hobbies
                  </Typography>
                </Box>

                {/* Steps */}
                <Box sx={{ px: { xs: 3, sm: 4 }, py: { xs: 3, sm: 4 }, flex: 1 }}>
                  <Stack spacing={3}>
                    {HOW_IT_WORKS_JOIN.map((step, idx) => (
                      <Stack key={idx} direction="row" spacing={2} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            bgcolor: "primary.light",
                            color: "primary.main",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            flexShrink: 0,
                            mt: 0.25,
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box>
                          <Typography variant="body1" fontWeight={700} sx={{ mb: 0.25, lineHeight: 1.4 }}>
                            {step.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                            {step.body}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </Box>

                {/* Screenshot placeholder */}
                <Box
                  aria-hidden="true"
                  sx={{
                    mx: { xs: 2, sm: 3 },
                    mb: { xs: 2, sm: 3 },
                    borderRadius: 2,
                    overflow: "hidden",
                    aspectRatio: "4 / 3",
                    background: (theme) =>
                      `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.grey[200]} 100%)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Stack alignItems="center" spacing={1} sx={{ opacity: 0.4 }}>
                    <PeopleRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Screenshot &mdash; Explore view
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            </Grid>

            {/* Path 2: Create & Organize */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  backgroundColor: "background.paper",
                  borderRadius: 3,
                  overflow: "hidden",
                  boxShadow: (theme) =>
                    theme.palette.mode === "light"
                      ? "0 2px 12px rgba(0,0,0,0.08)"
                      : "none",
                  border: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Card header */}
                <Box
                  sx={{
                    background: "linear-gradient(135deg, #c2410c 0%, #e65100 100%)",
                    px: { xs: 3, sm: 4 },
                    py: { xs: 3, sm: 3.5 },
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      color: "rgba(255,255,255,0.7)",
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      fontSize: "0.65rem",
                      display: "block",
                      mb: 0.5,
                    }}
                  >
                    Path 2
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    sx={{
                      color: "white",
                      fontSize: { xs: "1.15rem", sm: "1.3rem" },
                      lineHeight: 1.3,
                    }}
                  >
                    Create and organize your own plans
                  </Typography>
                </Box>

                {/* Steps */}
                <Box sx={{ px: { xs: 3, sm: 4 }, py: { xs: 3, sm: 4 }, flex: 1 }}>
                  <Stack spacing={3}>
                    {HOW_IT_WORKS_CREATE.map((step, idx) => (
                      <Stack key={idx} direction="row" spacing={2} alignItems="flex-start">
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: "50%",
                            bgcolor: "#fff3e0",
                            color: "#bf360c",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: "0.875rem",
                            flexShrink: 0,
                            mt: 0.25,
                          }}
                        >
                          {idx + 1}
                        </Box>
                        <Box>
                          <Typography variant="body1" fontWeight={700} sx={{ mb: 0.25, lineHeight: 1.4 }}>
                            {step.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                            {step.body}
                          </Typography>
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </Box>

                {/* Screenshot placeholder */}
                <Box
                  aria-hidden="true"
                  sx={{
                    mx: { xs: 2, sm: 3 },
                    mb: { xs: 2, sm: 3 },
                    borderRadius: 2,
                    overflow: "hidden",
                    aspectRatio: "4 / 3",
                    background: (theme) =>
                      `linear-gradient(135deg, ${theme.palette.grey[100]} 0%, ${theme.palette.primary.light} 100%)`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Stack alignItems="center" spacing={1} sx={{ opacity: 0.4 }}>
                    <CalendarMonthRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Screenshot &mdash; Plan details view
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Supporting points */}
          <Grid container spacing={{ xs: 3, sm: 4 }} sx={{ mt: { xs: 4, sm: 6 } }}>
            {HOW_IT_WORKS_EXTRAS.map(({ imageSrc, Icon, title, body }) => {
              const showFallback = extrasImageErrors.has(title);
              return (
                <Grid key={title} size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      height: "100%",
                      backgroundColor: (theme) =>
                        theme.palette.mode === "light" ? "grey.50" : "grey.800",
                      borderRadius: 2.5,
                      p: { xs: 2.5, sm: 3 },
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 2,
                    }}
                  >
                    <Box
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: 2,
                        bgcolor: showFallback ? "primary.light" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        overflow: "hidden",
                      }}
                    >
                      {showFallback ? (
                        <Icon sx={{ fontSize: 40, color: "primary.main" }} />
                      ) : (
                        <Image
                          src={imageSrc}
                          alt=""
                          width={80}
                          height={80}
                          style={{ objectFit: "contain" }}
                          onError={() =>
                            setExtrasImageErrors((prev) => new Set(prev).add(title))
                          }
                        />
                      )}
                    </Box>
                    <Box>
                      <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.4 }}>
                        {title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                        {body}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>

      {/* ── Section: NewChums Features ── */}
      <Box
        component="section"
        id="features"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.50" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={1100} mx="auto">
          {/* Section heading */}
          <Box sx={{ textAlign: "center", mb: { xs: 5, sm: 7 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "2.75rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                mb: 2,
              }}
            >
              NewChums Features
            </Typography>
            <Typography
              variant="h5"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 620,
                mx: "auto",
              }}
            >
              Everything you need to organize great plans, keep everyone in the loop, and make future get-togethers even better.
            </Typography>
          </Box>

          {/* Feature cards grid */}
          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {FEATURES.map(({ Icon, accentColor, title, body }) => (
              <Grid key={title} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderRadius: 2.5,
                    p: { xs: 3, sm: 3.5 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light"
                        ? "0 1px 6px rgba(0,0,0,0.07)"
                        : "none",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: { xs: "center", sm: "flex-start" },
                    textAlign: { xs: "center", sm: "left" },
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: `${accentColor}14`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 2,
                    }}
                  >
                    <Icon sx={{ fontSize: 24, color: accentColor }} />
                  </Box>
                  <Typography
                    variant="h6"
                    component="h3"
                    fontWeight={700}
                    sx={{
                      mb: 1,
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
        </Box>
      </Box>

      {/* ── Section: Meet New People ── */}
      <Box
        component="section"
        id="meet-people"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "#FCECC3" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={1100} mx="auto">
          {/* Section heading */}
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "2.75rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                mb: 2,
              }}
            >
              A great way to meet new people, too
            </Typography>
            <Typography
              variant="h5"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 580,
                mx: "auto",
              }}
            >
              Not every plan has to be with people you already know.
            </Typography>
          </Box>

          {/* Split content: copy left, placeholder right */}
          <Grid container spacing={{ xs: 4, md: 6 }} alignItems="center" sx={{ mb: { xs: 5, sm: 7 } }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.85, mb: 3, color: "text.primary" }}
              >
                When you create a plan on NewChums, <Box component="span" sx={{ fontWeight: 700 }}>you decide who can join</Box>.
                Keep it private for your friends, open it up to new people, or
                both, it&apos;s up to you.
              </Typography>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.85, mb: { xs: 3, sm: 4 }, color: "text.primary" }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>Public plans</Box> are where it gets interesting. When someone nearby
                shares your hobbies and fits your preferences, they&apos;ll hear about
                your plan. And you&apos;ll hear about theirs. No cold introductions,
                no awkward swiping, just real people showing up to do
                something they already enjoy.
              </Typography>
              {!isLoggedIn && (
                <Button
                  component={Link}
                  href="/signup"
                  variant="contained"
                  color="primary"
                  size="large"
                  sx={{
                    px: 4,
                    py: 1.5,
                    fontWeight: 600,
                    borderRadius: 2.5,
                    textTransform: "none",
                    minWidth: { xs: "100%", sm: "auto" },
                  }}
                >
                  Setup your profile
                </Button>
              )}
            </Grid>

            {/* Placeholder for screenshot or lifestyle image */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Box
                aria-hidden="true"
                sx={{
                  borderRadius: 3,
                  overflow: "hidden",
                  aspectRatio: "4 / 3",
                  background: (theme) =>
                    theme.palette.mode === "light"
                      ? `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.grey[200]} 100%)`
                      : `linear-gradient(135deg, ${theme.palette.grey[800]} 0%, ${theme.palette.grey[700]} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.4 }}>
                  <PeopleRoundedIcon sx={{ fontSize: 48, color: "primary.main" }} />
                  <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    Screenshot placeholder &mdash; Profile preferences
                  </Typography>
                </Stack>
              </Box>
            </Grid>
          </Grid>

          {/* Three feature callouts */}
          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {MEET_PEOPLE_CALLOUTS.map(({ imageSrc, Icon, title, body }) => {
              const showFallback = !imageSrc || meetPeopleImageErrors.has(title);
              return (
                <Grid key={title} size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      height: "100%",
                      backgroundColor: (theme) =>
                        theme.palette.mode === "light"
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(255,255,255,0.04)",
                      borderRadius: 2.5,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    {/* Image area */}
                    <Box
                      sx={{
                        width: "100%",
                        aspectRatio: "2 / 1",
                        position: "relative",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        bgcolor: showFallback ? "primary.light" : "transparent",
                        p: showFallback ? 0 : 2,
                      }}
                    >
                      {showFallback ? (
                        <Icon sx={{ fontSize: 40, color: "primary.main" }} />
                      ) : (
                        <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
                          <Image
                            src={imageSrc}
                            alt=""
                            fill
                            sizes="(max-width: 600px) 100vw, 33vw"
                            style={{ objectFit: "contain" }}
                            onError={() =>
                              setMeetPeopleImageErrors((prev) => new Set(prev).add(title))
                            }
                          />
                        </Box>
                      )}
                    </Box>

                    {/* Text content */}
                    <Box sx={{ px: { xs: 3, sm: 3 }, pb: { xs: 3, sm: 3.5 }, pt: 1.5, flex: 1 }}>
                      <Typography
                        variant="h6"
                        component="h3"
                        fontWeight={700}
                        sx={{
                          mb: 1,
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
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>

      {/* ── Section: Why This Works ── */}
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
        <Box maxWidth={960} mx="auto">
          {/* Section heading */}
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "2.75rem" },
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                mb: 2,
              }}
            >
              The nitty gritty
            </Typography>
            <Typography
              variant="h5"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 560,
                mx: "auto",
              }}
            >
              This isn&apos;t guesswork. NewChums is designed around the conditions that make plans work.
        
            </Typography>
          </Box>

          {/* Three reasoning cards */}
          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {WHY_THIS_WORKS_CARDS.map(({ Icon, accentColor, title, body }) => (
              <Grid key={title} size={{ xs: 12, sm: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderTop: "3px solid",
                    borderColor: accentColor,
                    borderRadius: 2.5,
                    p: { xs: 3, sm: 3.5 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light"
                        ? "0 1px 6px rgba(0,0,0,0.07)"
                        : "none",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: { xs: "center", sm: "flex-start" },
                    textAlign: { xs: "center", sm: "left" },
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      bgcolor: `${accentColor}14`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 2,
                    }}
                  >
                    <Icon sx={{ fontSize: 24, color: accentColor }} />
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
              mt: { xs: 5, sm: 7 },
              textAlign: "center",
            }}
          >
            <Box
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === "light"
                    ? "primary.dark"
                    : "grey.800",
                borderRadius: 2.5,
                px: { xs: 3, sm: 5 },
                py: { xs: 3.5, sm: 4 },
                maxWidth: 640,
                mx: "auto",
              }}
            >
              <Typography
                variant="body1"
                fontWeight={600}
                sx={{
                  color: "white",
                  lineHeight: 1.65,
                  mb: 2.5,
                  fontSize: { xs: "0.975rem", sm: "1.05rem" },
                }}
              >
                There&apos;s real research behind why shared activities, smaller groups,
                and repeated contact lead to stronger friendships.
              </Typography>
              <Button
                component={Link}
                href="/science-of-friendship"
                variant="contained"
                color="onPrimary"
                size="large"
                sx={{
                  px: 4,
                  py: 1.25,
                  fontWeight: 600,
                  borderRadius: 2.5,
                  textTransform: "none",
                  fontSize: "0.9375rem",
                }}
              >
                Read the science behind it
              </Button>
            </Box>
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
            backgroundColor: (theme) => theme.palette.onPrimary.main,
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
            DO SOMETHING!
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
            Sign up, add the hobbies you enjoy, and start organizing and discovering plans.
          </Typography>

          <Divider
            sx={{
              borderColor: "rgba(247,206,22,0.7)",
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
            color="onPrimary"
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
            {isLoggedIn ? "Explore NewChums" : "Alright, I'm in"}
          </Button>
        </Box>
      </Box>

    </Box>
  );
}
