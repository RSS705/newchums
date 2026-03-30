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
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import InterestsRoundedIcon from "@mui/icons-material/InterestsRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";

import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ThumbUpAltRoundedIcon from "@mui/icons-material/ThumbUpAltRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import PublicExploreFeed from "@/components/landing/PublicExploreFeed";

/**
 * Full public homepage content for logged-out visitors.
 * Sections: Hero → Public Explore → How It Works → Features → Meet People → Why This Works → CTA
 *
 * Messaging hierarchy: (1) organize and join hobby-based plans around what you enjoy,
 * (2) clear details and easy follow-through, (3) social upside via shared interests.
 */

const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };

// (Hero image placeholder — the right column of the hero section is an image frame
//  ready to hold a screenshot or product photo. See the Grid item below.)

// ── "How it works" four-step flow ────────────────────────────────────────────
const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    accentColor: "#E65B13",
    Icon: CalendarMonthRoundedIcon,
    title: "Create a plan",
    body: "Pick an activity and set the details.",
    placeholder: "Screenshot — Create plan flow",
    imageSrc: "/images/home/how-step-create.png",
  },
  {
    step: 2,
    accentColor: "#1565c0",
    Icon: MailOutlineRoundedIcon,
    title: "Invite people",
    body: "Share a link, send email invites, or even leave it open to new people nearby.",
    placeholder: "Screenshot — Invite view",
    imageSrc: "/images/home/how-step-invite.png",
  },
  {
    step: 3,
    accentColor: "#2e7d32",
    Icon: EventAvailableRoundedIcon,
    title: "Gather responses",
    body: "Collect RSVPs, find the best time, and coordinate the details.",
    placeholder: "Screenshot — RSVP & availability",
    imageSrc: "/images/home/how-step-responses.png",
  },
  {
    step: 4,
    accentColor: "#7c3aed",
    Icon: PeopleRoundedIcon,
    title: "Meet up",
    body: "Everyone\u2019s confirmed, the details are set. Time to go.",
    placeholder: "Screenshot — Plan details",
    imageSrc: "/images/home/how-step-meetup.png",
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
        Your{" "}
        <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>
          feedback
        </Box>{" "}
        after each gathering helps improve which plans and people you&apos;re notified about. Each
        time, the experience becomes more customized to you.
      </>
    ),
  },
];

// ── "NewChums Features" section ──────────────────────────────────────────────
const FEATURES: {
  Icon: typeof VisibilityRoundedIcon;
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
        Send invites directly, and your chums receive an{" "}
        <Box component="span" sx={{ color: "#E65B13", fontWeight: 600 }}>
          email notification
        </Box>{" "}
        so they know you&apos;re planning something.
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
        After the plan, attendees share{" "}
        <Box component="span" sx={{ color: "#0e7490", fontWeight: 600 }}>
          feedback
        </Box>
        . NewChums remembers your preferences and avoids notifying people about your plans who
        aren&apos;t a good fit, and flags potential mismatches in other people&apos;s plans.
      </>
    ),
  },
];

export default function LandingPageContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
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
                <Box component="span" sx={{ fontWeight: 700 }}>
                  Life&apos;s short.
                </Box>{" "}
                Don&apos;t waste it staring at screens. Create an account, invite friends, meet new
                friends, actually be with people.
              </Typography>

              {/* CTAs */}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 0.5 }}>
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
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
          >
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

      {/* ── Section 1.1: Public Explore Feed ── */}
      {!isLoggedIn && <PublicExploreFeed />}

      {/* ── Section: How It Works ── */}
      <Box
        component="section"
        id="how-it-works"
        sx={{
          py: { xs: 7, sm: 9, md: 11 },
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#FCECC3" : "grey.900"),
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
              How it works
            </Typography>
            <Typography
              variant="h5"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 480,
                mx: "auto",
              }}
            >
              Getting together shouldn&apos;t be painful.
            </Typography>
          </Box>

          {/* Steps — alternating image / text rows */}
          <Stack spacing={{ xs: 5, sm: 8, md: 10 }}>
            {HOW_IT_WORKS_STEPS.map(
              ({ step, accentColor, Icon, title, body, placeholder, imageSrc }, idx) => {
                const imageOnRight = idx % 2 !== 0;
                return (
                  <Grid
                    key={step}
                    container
                    spacing={{ xs: 2, sm: 4, md: 6 }}
                    alignItems="center"
                  >
                    {/* Text column — always first on mobile */}
                    <Grid
                      size={{ xs: 12, md: 5 }}
                      sx={{ order: { xs: 0, md: imageOnRight ? 0 : 0 } }}
                    >
                      <Stack direction={{ xs: "row", md: "column" }} spacing={{ xs: 1.5, md: 2 }} alignItems={{ xs: "flex-start", md: "stretch" }}>
                        <Box
                          sx={{
                            width: { xs: 36, md: 44 },
                            height: { xs: 36, md: 44 },
                            borderRadius: "50%",
                            bgcolor: `${accentColor}28`,
                            color: accentColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 800,
                            fontSize: { xs: "0.9rem", md: "1.05rem" },
                            flexShrink: 0,
                            mt: { xs: 0.25, md: 0 },
                          }}
                        >
                          {step}
                        </Box>
                        <Box>
                          <Typography
                            variant="h4"
                            component="h3"
                            fontWeight={700}
                            sx={{
                              fontSize: { xs: "1.15rem", sm: "1.5rem", md: "1.65rem" },
                              lineHeight: 1.25,
                              letterSpacing: "-0.02em",
                            }}
                          >
                            {title}
                          </Typography>
                          <Typography
                            variant="body1"
                            color="text.secondary"
                            sx={{ lineHeight: 1.7, maxWidth: { md: 400 }, mt: { xs: 0.5, md: 1 }, fontSize: { xs: "0.95rem", md: "1rem" } }}
                          >
                            {body}
                          </Typography>
                        </Box>
                      </Stack>
                    </Grid>

                    {/* Image column — below text on mobile, alternates on desktop */}
                    <Grid
                      size={{ xs: 12, md: 7 }}
                      sx={{ order: { xs: 1, md: imageOnRight ? -1 : 1 } }}
                    >
                      <Box
                        sx={{
                          borderRadius: { xs: 2.5, md: 3 },
                          overflow: "hidden",
                          ...(!imageSrc && { aspectRatio: "3 / 2" }),
                          position: "relative",
                          background: imageSrc
                            ? undefined
                            : (theme) =>
                                `linear-gradient(135deg, ${accentColor}0A 0%, ${theme.palette.grey[100]} 100%)`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: (theme) =>
                            theme.palette.mode === "light"
                              ? "0 4px 24px rgba(0,0,0,0.10)"
                              : "none",
                          border: "1px solid",
                          borderColor: "divider",
                          bgcolor: imageSrc ? undefined : "background.paper",
                        }}
                      >
                        {imageSrc ? (
                          <Image
                            src={imageSrc}
                            alt={title}
                            width={1200}
                            height={800}
                            sizes="(max-width: 960px) 100vw, 60vw"
                            style={{ width: "100%", height: "auto", display: "block" }}
                          />
                        ) : (
                          <Stack alignItems="center" spacing={1} sx={{ opacity: 0.35 }}>
                            <Icon sx={{ fontSize: 40, color: accentColor }} />
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              fontWeight={500}
                            >
                              {placeholder}
                            </Typography>
                          </Stack>
                        )}
                      </Box>
                    </Grid>
                  </Grid>
                );
              }
            )}
          </Stack>

          {/* CTA */}
          <Box sx={{ textAlign: "center", mt: { xs: 5, sm: 7 } }}>
            <Button
              component={Link}
              href="/how-it-works"
              variant="outlined"
              color="primary"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontWeight: 600,
                fontSize: "1.0625rem",
                borderRadius: 2.5,
                textTransform: "none",
                minWidth: { xs: "100%", sm: "auto" },
              }}
            >
              See the full walkthrough
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Section: NewChums Features ── */}
      <Box
        component="section"
        id="features"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "grey.900"),
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
              Everything you need to organize great plans, keep everyone in the loop, and make
              future get-togethers even better.
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
                      theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
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
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
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
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#FCECC3" : "grey.900"),
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
          <Grid
            container
            spacing={{ xs: 4, md: 6 }}
            alignItems="center"
            sx={{ mb: { xs: 5, sm: 7 } }}
          >
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body1" sx={{ lineHeight: 1.85, mb: 3, color: "text.primary" }}>
                When you create a plan on NewChums,{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  you decide who can join
                </Box>
                . Keep it private for your friends, open it up to new people, or both, it&apos;s up
                to you.
              </Typography>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.85, mb: { xs: 3, sm: 4 }, color: "text.primary" }}
              >
                <Box component="span" sx={{ fontWeight: 700 }}>
                  Public plans
                </Box>{" "}
                are where it gets interesting. When someone nearby shares your hobbies and fits your
                preferences, they&apos;ll hear about your plan. And you&apos;ll hear about theirs.
                No cold introductions, no awkward swiping, just real people showing up to do
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
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
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
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "grey.900"),
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          borderTop: "1px solid",
          borderColor: (theme) => (theme.palette.mode === "light" ? "grey.200" : "grey.800"),
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
              This isn&apos;t guesswork. NewChums is designed around the conditions that make plans
              work.
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
                      theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
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
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
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
                  theme.palette.mode === "light" ? "primary.dark" : "grey.800",
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
                There&apos;s real research behind why shared activities, smaller groups, and
                repeated contact lead to stronger friendships.
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
