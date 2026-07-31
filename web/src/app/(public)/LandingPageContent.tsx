"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";

import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import EmojiPeopleRoundedIcon from "@mui/icons-material/EmojiPeopleRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PublicExploreFeed from "@/components/landing/PublicExploreFeed";
import { trackEvent } from "@/lib/analytics";
import RecentlyHappenedSection from "@/components/events/RecentlyHappenedSection";

/**
 * Full public homepage content for logged-out visitors.
 * Sections: Hero -> How It Works -> For the Plan-Maker -> Features ->
 * Public Explore -> CTA
 *
 * Positioning: NewChums is a coordination tool for the individual person
 * who makes the plan. One promise: post the plan, share one link, and see
 * who is really coming. Discovery, matching, and communities exist in the
 * product but are quiet supporting features here, never the headline.
 */

const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };

// ── Intersection Observer reveal hook ──────────────────────────────────────

// Reveal animation uses a CSS class toggle via the DOM directly,
// avoiding React re-renders when elements scroll into view.
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, visible };
}

const REVEAL_SX = (visible: boolean, delay = 0) => ({
  opacity: visible ? 1 : 0,
  transform: visible ? "translateY(0)" : "translateY(24px)",
  transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
});

// ── Card hover sx mixin ────────────────────────────────────────────────────

const CARD_HOVER = {
  "@media (hover: hover)": {
    "&:hover": {
      transform: { md: "translateY(-4px)" },
      transition: "transform 0.3s cubic-bezier(0.22,1,0.36,1)",
    },
  },
};

// ── Button hover refinement ────────────────────────────────────────────────

const BTN_HOVER = {
  transition: "all 0.2s ease",
  "&:active": { transform: "scale(0.98)" },
};

// ── Data arrays (unchanged) ────────────────────────────────────────────────

const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    accentColor: "#E65B13",
    Icon: CalendarMonthRoundedIcon,
    title: "Post your plan",
    body: "Post a plan in a couple of minutes, or set up a page for a group you run regularly. Either way, you choose the activity, the where, and the when.",
    placeholder: "Screenshot, Create plan flow",
    imageSrc: "/images/home/how-step-create.png",
  },
  {
    step: 2,
    accentColor: "#1565c0",
    Icon: MailOutlineRoundedIcon,
    title: "Share what's happening",
    body: "Send direct invites, or copy one share link and drop it in your group chat. Everyone lands on the same plan page. Nearby people with matching hobbies can find it too.",
    placeholder: "Screenshot, Invite view",
    imageSrc: "/images/home/how-step-invite.png",
  },
  {
    step: 3,
    accentColor: "#2e7d32",
    Icon: EventAvailableRoundedIcon,
    title: "Collect RSVPs and join requests",
    body: "Track who's coming, gather everyone's availability, and approve newcomers when you want a light vetting step.",
    placeholder: "Screenshot, RSVP & availability",
    imageSrc: "/images/home/how-step-responses.png",
  },
  {
    step: 4,
    accentColor: "#7c3aed",
    Icon: PeopleRoundedIcon,
    title: "Meet up and keep momentum",
    body: "Confirmation reminders, plan chat, and attendance records help follow-through become the default, not the exception.",
    placeholder: "Screenshot, Plan details",
    imageSrc: "/images/home/how-step-meetup.png",
  },
];

// Plan-maker value cards. Wired to surfaces that already exist:
//   - "One link..."            -> share link, plan detail page, plan updates
//   - "Reduce RSVP friction"   -> RSVP buttons, request-to-join, 24-hour attendance check
//   - "Help newcomers join in" -> plan share link, lightweight signup card
//   - "Stay in control"        -> approval-required, invite-only, host lock, share link
// All four reference behavior that is implemented today (see AGENTS.md
// "Incomplete Areas" table for status). Do not add cards for features
// that aren't shipped, the homepage is honest-claims territory.
const ORGANIZER_VALUE_CARDS: {
  Icon: typeof CampaignRoundedIcon;
  accentColor: string;
  title: string;
  body: string;
}[] = [
  {
    Icon: CampaignRoundedIcon,
    accentColor: "#E65B13",
    title: "One link, one source of truth",
    body: "Every plan lives at a single link you can share anywhere. The time, the place, the RSVPs, and any updates stay on one page instead of scattered across chat threads, so nobody has to scroll back to find the details.",
  },
  {
    Icon: HowToRegRoundedIcon,
    accentColor: "#1565c0",
    title: "Reduce RSVP friction",
    body: "RSVPs are built in, with optional extras like request-to-join and a 24-hour attendance check so you can see who's actually coming. Less back-and-forth in the group chat, fewer no-shows on the day.",
  },
  {
    Icon: EmojiPeopleRoundedIcon,
    accentColor: "#2e7d32",
    title: "Help newcomers join in",
    body: "Send one link. Someone new can preview the plan, sign up in seconds, and join. No app to download, no waiting to be added to yet another group chat.",
  },
  {
    Icon: TuneRoundedIcon,
    accentColor: "#7c3aed",
    title: "Stay in control",
    body: "Choose public, chums-only, or invite-only per plan. Approve requests when you want to vet who's coming. Lock a plan when seats are full. The defaults are sensible, the toggles are yours.",
  },
];

const FEATURES_TOP: {
  accentColor: string;
  Icon: typeof VisibilityRoundedIcon;
  title: string;
  body: string | ReactNode;
  placeholder: string;
  imageSrc?: string;
}[] = [
  {
    accentColor: "#E65B13",
    Icon: CalendarMonthRoundedIcon,
    title: "Smarter scheduling",
    body: (
      <>
        Let attendees suggest better times, or{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          request everyone&apos;s availability
        </Box>{" "}
        and let the system find the best fit. Reminders and confirmations go out automatically.
      </>
    ),
    placeholder: "Screenshot, Availability / scheduling",
    imageSrc: "/images/home/feature-scheduling.png",
  },
  {
    accentColor: "#1565c0",
    Icon: VisibilityRoundedIcon,
    title: "Privacy on your terms",
    body: "Plans can be public, chums-only, or invite-only. Location can be exact, approximate, or hidden until someone joins. You decide who sees what.",
    placeholder: "Screenshot, Privacy controls",
    imageSrc: "/images/home/feature-privacy.png",
  },
];

const FEATURES_BOTTOM: typeof FEATURES_TOP = [
  {
    accentColor: "#7c3aed",
    Icon: ChatRoundedIcon,
    title: "Plan chat and updates",
    body: "Every plan has a built-in chat for quick hellos, coordination, and last-minute details. No separate group chat required.",
    placeholder: "Screenshot, Plan chat",
    imageSrc: "/images/home/feature-chat.png",
  },
  {
    accentColor: "#2e7d32",
    Icon: EventAvailableRoundedIcon,
    title: "Know who's actually coming",
    body: (
      <>
        A{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          24-hour attendance check
        </Box>{" "}
        asks everyone who marked Going to confirm they are still coming, with minimum-attendee
        thresholds so you never show up to an empty table.
      </>
    ),
    placeholder: "Screenshot, Confirmations",
    imageSrc: "/images/home/feature-confirmations.png",
  },
  {
    accentColor: "#0e7490",
    Icon: MailOutlineRoundedIcon,
    title: "Flexible invites and sharing",
    body: (
      <>
        Invite people by name or email, or{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          share one link
        </Box>{" "}
        anywhere your group already talks. Nearby people with matching hobbies can find public plans
        too.
      </>
    ),
    placeholder: "Screenshot, Invites / discovery",
    imageSrc: "/images/home/feature-invites.png",
  },
];

// ── Feature card component (shared by top and bottom) ──────────────────────

function FeatureCard({
  accentColor,
  Icon,
  title,
  body,
  placeholder,
  imageSrc,
  sizes,
  delay,
  visible,
}: {
  accentColor: string;
  Icon: typeof VisibilityRoundedIcon;
  title: string;
  body: string | ReactNode;
  placeholder: string;
  imageSrc?: string;
  sizes: string;
  delay: number;
  visible: boolean;
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gridRow: { sm: "span 2" },
        gridTemplateRows: { sm: "subgrid" },
        backgroundColor: (theme) =>
          theme.palette.mode === "light" ? "rgba(255,255,255,0.95)" : "background.paper",
        borderRadius: 3.5,
        overflow: "hidden",
        boxShadow: (theme) =>
          theme.palette.mode === "light"
            ? "0 1px 3px rgba(0,0,0,0.03), 0 8px 36px rgba(0,0,0,0.06)"
            : "none",
        border: "1px solid",
        borderColor: (theme) =>
          theme.palette.mode === "light" ? "rgba(255,255,255,0.3)" : "divider",
        ...CARD_HOVER,
        ...REVEAL_SX(visible, delay),
      }}
    >
      {/* Text */}
      <Box
        sx={{
          pt: { xs: 2.5, sm: 3, md: 3.5 },
          px: { xs: 2.5, sm: 3, md: 3.5 },
          pb: { xs: 1.5, sm: 1.5, md: 2 },
        }}
      >
        <Typography
          variant="h6"
          component="h3"
          fontWeight={700}
          sx={{
            mb: 0.75,
            fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.2rem" },
            lineHeight: 1.3,
            letterSpacing: "-0.01em",
            color: accentColor,
          }}
        >
          {title}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ lineHeight: 1.7, fontSize: { xs: "0.9rem", sm: "0.95rem" } }}
        >
          {body}
        </Typography>
      </Box>

      {/* Image */}
      <Box
        sx={{
          position: "relative",
          ...(!imageSrc && { aspectRatio: "3 / 2" }),
          background: imageSrc
            ? undefined
            : (theme) =>
                `linear-gradient(135deg, ${accentColor}06 0%, ${theme.palette.grey[100]} 100%)`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          borderTop: "1px solid",
          borderColor: (theme) => (theme.palette.mode === "light" ? "rgba(0,0,0,0.04)" : "divider"),
        }}
      >
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={title}
            width={1200}
            height={800}
            sizes={sizes}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        ) : (
          <Stack alignItems="center" spacing={1} sx={{ opacity: 0.3, pt: 4 }}>
            <Icon sx={{ fontSize: 36, color: accentColor }} />
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {placeholder}
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function LandingPageContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  // Hero image is wired to a community-themed placeholder path that may not
  // exist on disk yet (see comment near the <img> below). When the file is
  // missing, the onError handler swaps to a warm icon-block fallback so the
  // page never shows a broken image during the pilot rollout.
  const [heroImageErrored, setHeroImageErrored] = useState(false);

  const heroReveal = useReveal(0.05);
  const organizersReveal = useReveal();
  const howReveal = useReveal();
  const featuresTopReveal = useReveal();
  const featuresBotReveal = useReveal();
  const ctaReveal = useReveal(0.2);

  return (
    <Box sx={{ pt: { xs: 4, sm: 6, md: 8 }, pb: { xs: 4, sm: 6 } }}>
      {/* ── Section 1: Hero ── */}
      <Box
        component="section"
        ref={heroReveal.ref}
        sx={{
          pb: { xs: 6, sm: 8, md: 10 },
          position: "relative",
          ...REVEAL_SX(heroReveal.visible),
          // Soft warm ambience behind the hero so the first screen feels
          // inviting rather than flat white. Purely decorative, zero layout
          // impact; the radials fade to transparent well inside the section.
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 60% 55% at 78% 42%, rgba(252,236,195,0.55) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 8% 8%, rgba(230,91,19,0.05) 0%, transparent 70%)",
          },
        }}
      >
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="stretch" sx={{ position: "relative" }}>
          {/* Left: copy + CTAs */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3}>
              <Typography
                sx={{
                  color: "primary.dark",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  display: "block",
                }}
              >
                For the person who always makes the plan
              </Typography>

              <Typography component="h1" variant="h1" sx={{ mt: "0 !important" }}>
                Make plans that actually happen.
              </Typography>

              <Typography
                variant="h5"
                component="p"
                fontWeight={400}
                sx={{
                  color: "grey.800",
                  lineHeight: 1.7,
                  fontSize: "1.2rem",
                }}
              >
                Post the plan,{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  share one link,
                </Box>{" "}
                and see who is really coming. No “who’s in??” thread, no chasing RSVPs.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 0.5 }}>
                {isLoggedIn ? (
                  <>
                    <Button
                      component={Link}
                      href="/events/create"
                      variant="contained"
                      color="primary"
                      size="large"
                      sx={{
                        px: { xs: 3, sm: 4 },
                        py: 1.625,
                        fontWeight: 600,
                        fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                        boxShadow: "0 4px 14px rgba(230,91,19,0.25)",
                        "&:hover": { boxShadow: "0 6px 20px rgba(230,91,19,0.35)" },
                        ...BTN_HOVER,
                      }}
                    >
                      Start a plan
                    </Button>
                    <Button
                      component={Link}
                      href="/plans"
                      variant="outlined"
                      color="primary"
                      size="large"
                      sx={{
                        px: { xs: 3, sm: 4 },
                        py: 1.625,
                        fontWeight: 600,
                        fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                        ...BTN_HOVER,
                      }}
                    >
                      Your plans
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Primary hero CTA is signup framed as plan creation:
                        cold visitors are the person who makes the plan, and
                        the one obvious next step is posting it. */}
                    <Button
                      component={Link}
                      href="/signup"
                      onClick={() => trackEvent("hero_cta_clicked", { cta: "create_plan" })}
                      variant="contained"
                      color="primary"
                      size="large"
                      sx={{
                        px: { xs: 3, sm: 4 },
                        py: 1.625,
                        fontWeight: 600,
                        fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                        boxShadow: "0 4px 14px rgba(230,91,19,0.25)",
                        "&:hover": { boxShadow: "0 6px 20px rgba(230,91,19,0.35)" },
                        ...BTN_HOVER,
                      }}
                    >
                      Create a plan in 60 seconds
                    </Button>
                    <Button
                      component={Link}
                      href="/how-it-works"
                      onClick={() => trackEvent("hero_cta_clicked", { cta: "how_it_works" })}
                      variant="outlined"
                      color="primary"
                      size="large"
                      sx={{
                        px: { xs: 3, sm: 4 },
                        py: 1.625,
                        fontWeight: 600,
                        fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                        borderRadius: 2.5,
                        minWidth: { xs: "100%", sm: "auto" },
                        textTransform: "none",
                        ...BTN_HOVER,
                      }}
                    >
                      See how it works
                    </Button>
                  </>
                )}
              </Stack>

              {/* Quiet reassurance row. Every claim here is true today:
                  no billing exists, the product is a web app, and public
                  plans are viewable without an account. Rendered as soft
                  success pills (the theme's success-chip colors: mint
                  background, deep green text) rather than bare 16px icons,
                  so the row reads as designed trust markers that match the
                  hero's rounded-pill scale instead of stray green dots. */}
              {!isLoggedIn && (
                <Stack
                  direction="row"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ pt: 0.5 }}
                >
                  {/* Metrics are deliberately tight (px 1.25, 0.8rem text,
                      14px check, 8px gaps): the three pills measure ~507px
                      against the ~544px hero text column, so keep any new
                      wording inside that budget or the third pill wraps to a
                      second line at desktop. */}
                  {["Free to use", "No app to download", "Your group RSVPs in seconds"].map(
                    (claim) => (
                      <Stack
                        key={claim}
                        direction="row"
                        spacing={0.625}
                        alignItems="center"
                        sx={{
                          px: 1.25,
                          py: 0.625,
                          borderRadius: 999,
                          bgcolor: "success.light",
                          border: "1px solid",
                          borderColor: (theme) =>
                            theme.palette.mode === "dark"
                              ? "rgba(16,185,129,0.28)"
                              : "rgba(5,150,105,0.18)",
                        }}
                      >
                        <CheckRoundedIcon
                          sx={{
                            fontSize: 14,
                            color: "success.main",
                            // Optical alignment: the glyph sits a hair high
                            // against the pill's cap-height text otherwise.
                            mt: "1px",
                          }}
                        />
                        <Typography
                          variant="body2"
                          sx={{
                            fontSize: "0.8rem",
                            fontWeight: 600,
                            lineHeight: 1.4,
                            whiteSpace: "nowrap",
                            // success.dark carries better small-text contrast
                            // on the mint tint in light mode; in dark mode the
                            // tint is a deep teal, so the brighter main reads
                            // clearer.
                            color: (theme) =>
                              theme.palette.mode === "dark"
                                ? theme.palette.success.main
                                : theme.palette.success.dark,
                          }}
                        >
                          {claim}
                        </Typography>
                      </Stack>
                    )
                  )}
                </Stack>
              )}
            </Stack>
          </Grid>

          {/* Right: hero image.
              Serves the optimized WebP (community-hero.webp, ~150KB); the
              original community-hero.png (2MB) stays in the folder as the
              source asset. Regenerate the WebP from the PNG if the art
              changes (sharp: resize width 1400, webp quality 84).
              Recommended specs: 1200x800 (or 1400x900) PNG or WebP, light or
              transparent background, light/warm composition that works on
              the homepage's white background. Visual concept: a warm hobby
              or game community gathering, people around a table, a store /
              community board, calendar / plans energy. Avoid generic
              corporate networking visuals. Until the file is placed, the
              onError handler swaps to a warm icon-block fallback so the
              page never shows a broken image. */}
          <Grid
            size={{ xs: 12, md: 6 }}
            sx={{
              display: { xs: "none", md: "flex" },
              alignItems: "center",
              justifyContent: "center",
              overflow: "visible",
            }}
          >
            {heroImageErrored ? (
              <Box
                role="img"
                aria-label="Friends meeting up through a shared plan"
                sx={{
                  width: "100%",
                  aspectRatio: "3 / 2",
                  borderRadius: 4,
                  background: (theme) =>
                    `linear-gradient(135deg, #FCECC3 0%, ${theme.palette.background.paper} 100%)`,
                  border: "1px solid",
                  borderColor: "rgba(230,91,19,0.18)",
                  boxShadow: "0 8px 32px rgba(230,91,19,0.10)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1.5,
                  p: 4,
                }}
              >
                <GroupsRoundedIcon sx={{ fontSize: 96, color: "primary.main", opacity: 0.85 }} />
                <Typography
                  variant="body1"
                  fontWeight={600}
                  sx={{ color: "text.secondary", textAlign: "center", maxWidth: 320 }}
                >
                  Your plans, in one place.
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  position: "relative",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  // Warm radiant glow behind the illustration so it sits in
                  // the page like a lit scene instead of a pasted rectangle.
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    inset: "8% 4%",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(ellipse at center, rgba(230,91,19,0.14) 0%, rgba(252,236,195,0.5) 45%, transparent 72%)",
                    filter: "blur(24px)",
                    pointerEvents: "none",
                  },
                  "@keyframes ncHeroFloat": {
                    "0%, 100%": { transform: "translateY(0)" },
                    "50%": { transform: "translateY(-10px)" },
                  },
                }}
              >
                <Box
                  component="img"
                  src="/images/home/community-hero.webp"
                  alt="Friends making plans together"
                  onError={() => setHeroImageErrored(true)}
                  sx={{
                    position: "relative",
                    height: "100%",
                    width: "auto",
                    maxWidth: "100%",
                    objectFit: "contain",
                    display: "block",
                    "@media (prefers-reduced-motion: no-preference)": {
                      animation: "ncHeroFloat 7s ease-in-out infinite",
                    },
                  }}
                />
              </Box>
            )}
          </Grid>
        </Grid>
      </Box>

      {/* ── Section: How It Works ── */}
      <Box
        component="section"
        id="how-it-works"
        ref={howReveal.ref}
        sx={{
          py: { xs: 6, sm: 8, md: 9 },
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#FCECC3" : "grey.900"),
          // Rounded panel: tinted bands are container-width (maxWidth lg),
          // so hard 90-degree corners read as a floating rectangle on wide
          // screens. The radius turns each band into a deliberate soft
          // panel; overflow hidden clips the decorative radials to it.
          borderRadius: { xs: 4, sm: 6 },
          position: "relative",
          overflow: "hidden",
          "&::before, &::after": {
            content: '""',
            position: "absolute",
            borderRadius: "50%",
            pointerEvents: "none",
          },
          "&::before": {
            width: { xs: 300, md: 500 },
            height: { xs: 300, md: 500 },
            top: { xs: -80, md: -120 },
            right: { xs: -100, md: -140 },
            background: "radial-gradient(circle, rgba(230,91,19,0.07) 0%, transparent 70%)",
          },
          "&::after": {
            width: { xs: 350, md: 600 },
            height: { xs: 350, md: 600 },
            bottom: { xs: -100, md: -180 },
            left: { xs: -120, md: -200 },
            background: "radial-gradient(circle, rgba(21,101,192,0.06) 0%, transparent 70%)",
          },
        }}
      >
        <Box maxWidth={1100} mx="auto" sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              textAlign: "center",
              mb: { xs: 4, sm: 5, md: 6 },
              ...REVEAL_SX(howReveal.visible),
            }}
          >
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "3rem" },
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                mb: 2.5,
              }}
            >
              How it works
            </Typography>
            <Typography
              variant="h5"
              component="p"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem", md: "1.3rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 520,
                mx: "auto",
              }}
            >
              Whether it&apos;s a single get-together or something you run every week, the same four steps get you from idea to gathering.
            </Typography>
          </Box>

          <Stack spacing={{ xs: 4, sm: 6, md: 0 }} sx={{ position: "relative" }}>
            {/* Vertical connector line */}
            <Box
              aria-hidden="true"
              sx={{
                display: { xs: "none", md: "block" },
                position: "absolute",
                left: "50%",
                top: 40,
                bottom: 40,
                width: 0,
                borderLeft: "2px dashed",
                borderColor: "rgba(230,91,19,0.18)",
                transform: "translateX(-1px)",
                zIndex: 0,
              }}
            />

            {HOW_IT_WORKS_STEPS.map(
              ({ step, accentColor, Icon, title, body, placeholder, imageSrc }, idx) => {
                const imageOnRight = idx % 2 !== 0;
                return (
                  <Box
                    key={step}
                    sx={{
                      position: "relative",
                      zIndex: 1,
                      py: { xs: 0, md: 3 },
                      ...REVEAL_SX(howReveal.visible, 0.08 * idx),
                    }}
                  >
                    <Grid container spacing={{ xs: 2, sm: 4, md: 6 }} alignItems="center">
                      <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 0, md: 0 } }}>
                        <Stack
                          direction={{ xs: "row", md: "column" }}
                          spacing={{ xs: 1.5, md: 2 }}
                          alignItems={{ xs: "flex-start", md: "stretch" }}
                        >
                          <Box
                            sx={{
                              width: { xs: 38, md: 52 },
                              height: { xs: 38, md: 52 },
                              borderRadius: "50%",
                              bgcolor: accentColor,
                              color: "#fff",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 800,
                              fontSize: { xs: "0.9rem", md: "1.1rem" },
                              flexShrink: 0,
                              mt: { xs: 0.25, md: 0 },
                              boxShadow: `0 4px 14px ${accentColor}40`,
                            }}
                          >
                            {step}
                          </Box>
                          <Box>
                            <Typography
                              variant="h4"
                              component="h3"
                              fontWeight={800}
                              sx={{
                                fontSize: { xs: "1.15rem", sm: "1.5rem", md: "1.75rem" },
                                lineHeight: 1.2,
                                letterSpacing: "-0.025em",
                              }}
                            >
                              {title}
                            </Typography>
                            <Typography
                              variant="body1"
                              color="text.secondary"
                              sx={{
                                lineHeight: 1.75,
                                maxWidth: { md: 380 },
                                mt: { xs: 0.5, md: 1.5 },
                                fontSize: { xs: "0.95rem", md: "1.05rem" },
                              }}
                            >
                              {body}
                            </Typography>
                          </Box>
                        </Stack>
                      </Grid>

                      <Grid
                        size={{ xs: 12, md: 7 }}
                        sx={{ order: { xs: 1, md: imageOnRight ? -1 : 1 } }}
                      >
                        <Box
                          sx={{
                            borderRadius: { xs: 2.5, md: 3.5 },
                            overflow: "hidden",
                            ...(!imageSrc && { aspectRatio: "3 / 2" }),
                            position: "relative",
                            background: imageSrc
                              ? "background.paper"
                              : (theme) =>
                                  `linear-gradient(135deg, ${accentColor}0A 0%, ${theme.palette.grey[100]} 100%)`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: imageSrc ? "background.paper" : undefined,
                            boxShadow: (theme) =>
                              theme.palette.mode === "light"
                                ? "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.05)"
                                : "none",
                            border: "1px solid",
                            borderColor: (theme) =>
                              theme.palette.mode === "light" ? "rgba(0,0,0,0.06)" : "divider",
                            ...CARD_HOVER,
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
                              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                                {placeholder}
                              </Typography>
                            </Stack>
                          )}
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                );
              }
            )}
          </Stack>

          <Box
            sx={{
              textAlign: "center",
              mt: { xs: 4, sm: 5, md: 6 },
              ...REVEAL_SX(howReveal.visible, 0.4),
            }}
          >
            <Button
              component={Link}
              href="/how-it-works"
              variant="contained"
              color="primary"
              size="large"
              sx={{
                px: { xs: 4, sm: 5 },
                py: 1.75,
                fontWeight: 700,
                fontSize: "1.0625rem",
                borderRadius: 2.5,
                textTransform: "none",
                minWidth: { xs: 0, sm: "auto" },
                boxShadow: "0 4px 16px rgba(230,91,19,0.3)",
                "&:hover": { boxShadow: "0 6px 24px rgba(230,91,19,0.4)" },
                ...BTN_HOVER,
              }}
            >
              See the full walkthrough
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Section: 24-hour attendance check ──
          The most differentiating behavior the product ships gets its own
          moment instead of living as a clause inside a feature paragraph.
          Deliberately claim-honest: the check is host-configurable, so the
          copy says "turn on", never "every plan". Per AGENTS.md, the
          feature is always called exactly "24-hour attendance check" in
          user-facing copy; do not invent a brand name for it. */}
      <Box component="section" sx={{ py: { xs: 5, sm: 7, md: 8 } }}>
        <Box
          sx={{
            maxWidth: 820,
            mx: "auto",
            textAlign: "center",
            px: { xs: 2.5, sm: 4 },
            py: { xs: 4, sm: 5 },
            borderRadius: { xs: 4, sm: 6 },
            border: "1px solid",
            borderColor: (theme) =>
              theme.palette.mode === "light" ? "rgba(5,150,105,0.18)" : "rgba(16,185,129,0.28)",
            background: (theme) =>
              theme.palette.mode === "light"
                ? "linear-gradient(180deg, #ecfdf5 0%, #ffffff 85%)"
                : "linear-gradient(180deg, rgba(16,185,129,0.10) 0%, rgba(0,0,0,0) 85%)",
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                bgcolor: "success.main",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(5,150,105,0.3)",
              }}
            >
              <EventAvailableRoundedIcon sx={{ fontSize: 26 }} />
            </Box>
            <Typography component="h2" variant="h2" sx={{ fontSize: { xs: "1.6rem", sm: "1.875rem" } }}>
              Everyone confirms the day before
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: "text.secondary", lineHeight: 1.7, maxWidth: 560 }}
            >
              Turn on the 24-hour attendance check and everyone who said yes is
              asked to confirm as the day arrives. You head out with real
              numbers, not hopeful ones, and nobody cooks for ten when four are
              coming.
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* ── Section: For the Plan-Maker ──
          Speaks directly to the individual who makes the plan: game
          nights, hikes, study groups, dinners. Card data lives in
          ORGANIZER_VALUE_CARDS at the top of this file. Nothing
          external links to the old #for-organizers anchor, so the id
          moved to #for-plan-makers with the repositioning. */}
      <Box
        component="section"
        id="for-plan-makers"
        ref={organizersReveal.ref}
        sx={{
          ...SECTION_SPACING,
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#F6F7F9" : "grey.900"),
          borderRadius: { xs: 4, sm: 6 },
          // The anchor needs scroll-margin so the sticky site header
          // doesn't cover the heading on hash navigation.
          scrollMarginTop: { xs: 72, md: 88 },
        }}
      >
        <Box maxWidth={1100} mx="auto">
          <Box
            sx={{
              textAlign: "center",
              mb: { xs: 4, sm: 6 },
              ...REVEAL_SX(organizersReveal.visible),
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="center"
              sx={{ mb: 1.75 }}
            >
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CampaignRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
              </Box>
              <Typography
                sx={{
                  color: "primary.dark",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                }}
              >
                For the plan-maker
              </Typography>
            </Stack>
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
              Built for the person who makes the plan
            </Typography>
            <Typography
              variant="h5"
              component="p"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.2rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 620,
                mx: "auto",
              }}
            >
              A game night, a group hike, a study group. If you are the one who turns &ldquo;we
              should do something&rdquo; into an actual plan, NewChums is built for you.
            </Typography>
          </Box>

          <Grid container spacing={{ xs: 3, sm: 3.5 }}>
            {ORGANIZER_VALUE_CARDS.map(({ Icon, accentColor, title, body }, i) => (
              <Grid key={title} size={{ xs: 12, sm: 6 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderTop: "3px solid",
                    borderColor: accentColor,
                    borderRadius: 3,
                    p: { xs: 3, sm: 3.5 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light" ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
                    display: "flex",
                    flexDirection: "column",
                    ...CARD_HOVER,
                    ...REVEAL_SX(organizersReveal.visible, 0.08 * i),
                  }}
                >
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2.5,
                      bgcolor: `${accentColor}10`,
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
                      fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                      lineHeight: 1.35,
                    }}
                  >
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                    {body}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          <Box
            sx={{
              mt: { xs: 5, sm: 6 },
              textAlign: "center",
              ...REVEAL_SX(organizersReveal.visible, 0.4),
            }}
          >
            {/* Single CTA: the How It Works section directly above
                already links the walkthrough, and the hero carries
                See how it works too. One ask per section. */}
            <Button
              component={Link}
              href={isLoggedIn ? "/events/create" : "/signup"}
              variant="contained"
              color="primary"
              size="large"
              sx={{
                px: 4,
                py: 1.5,
                fontWeight: 700,
                fontSize: "1.0625rem",
                borderRadius: 2.5,
                textTransform: "none",
                minWidth: { xs: 0, sm: 220 },
                maxWidth: 360,
                boxShadow: "0 4px 16px rgba(230,91,19,0.25)",
                "&:hover": { boxShadow: "0 6px 24px rgba(230,91,19,0.35)" },
                ...BTN_HOVER,
              }}
            >
              {isLoggedIn ? "Start a plan" : "Create a free account"}
            </Button>
          </Box>
        </Box>
      </Box>

      {/* ── Section A: Organize with confidence ── */}
      <Box
        component="section"
        id="features"
        ref={featuresTopReveal.ref}
        sx={{
          py: { xs: 7, sm: 10, md: 12 },
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#F6F7F9" : "grey.900"),
          borderRadius: { xs: 4, sm: 6 },
          position: "relative",
          overflow: "hidden",
          "& .features-blob": { position: "absolute", borderRadius: "50%", pointerEvents: "none" },
        }}
      >
        <Box
          className="features-blob"
          sx={{
            width: { xs: 300, md: 440 },
            height: { xs: 300, md: 440 },
            top: { xs: "-4%", md: "-2%" },
            left: { xs: "-14%", md: "-8%" },
            background: "radial-gradient(circle, rgba(252,236,195,0.45) 0%, transparent 65%)",
          }}
        />
        <Box
          className="features-blob"
          sx={{
            width: { xs: 260, md: 380 },
            height: { xs: 260, md: 380 },
            top: { xs: "35%", md: "30%" },
            right: { xs: "-16%", md: "-6%" },
            background: "radial-gradient(circle, rgba(230,91,19,0.03) 0%, transparent 65%)",
          }}
        />

        <Box maxWidth={1100} mx="auto" sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              textAlign: "center",
              mb: { xs: 4, sm: 5, md: 6 },
              ...REVEAL_SX(featuresTopReveal.visible),
            }}
          >
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "3rem" },
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                mb: 2,
              }}
            >
              The tools you actually need
            </Typography>
            <Typography
              variant="h5"
              component="p"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.25rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 600,
                mx: "auto",
              }}
            >
              Pick the best time with everyone&apos;s input, and control exactly who sees what for each plan.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gridAutoRows: "auto 1fr",
              gap: { xs: 2.5, sm: 3 },
            }}
          >
            {FEATURES_TOP.map(({ accentColor, Icon, title, body, placeholder, imageSrc }, i) => (
              <FeatureCard
                key={title}
                accentColor={accentColor}
                Icon={Icon}
                title={title}
                body={body}
                placeholder={placeholder}
                imageSrc={imageSrc}
                sizes="(max-width: 960px) 100vw, 50vw"
                delay={0.1 * i}
                visible={featuresTopReveal.visible}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Section B: Stay in the loop ── */}
      <Box
        component="section"
        ref={featuresBotReveal.ref}
        sx={{
          py: { xs: 7, sm: 10, md: 12 },
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          position: "relative",
          overflow: "hidden",
          "& .loop-blob": { position: "absolute", borderRadius: "50%", pointerEvents: "none" },
        }}
      >
        <Box
          className="loop-blob"
          sx={{
            width: { xs: 280, md: 400 },
            height: { xs: 280, md: 400 },
            top: { xs: "10%", md: "8%" },
            left: { xs: "-10%", md: "5%" },
            background: "radial-gradient(circle, rgba(21,101,192,0.025) 0%, transparent 65%)",
          }}
        />
        <Box
          className="loop-blob"
          sx={{
            width: { xs: 320, md: 480 },
            height: { xs: 320, md: 480 },
            bottom: { xs: "-6%", md: "-4%" },
            right: { xs: "-12%", md: "-4%" },
            background: "radial-gradient(circle, rgba(252,236,195,0.30) 0%, transparent 65%)",
          }}
        />

        <Box maxWidth={1100} mx="auto" sx={{ position: "relative", zIndex: 1 }}>
          <Box
            sx={{
              textAlign: "center",
              mb: { xs: 4, sm: 5, md: 6 },
              ...REVEAL_SX(featuresBotReveal.visible),
            }}
          >
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{
                fontSize: { xs: "1.85rem", sm: "2.5rem", md: "3rem" },
                lineHeight: 1.1,
                letterSpacing: "-0.03em",
                mb: 2,
              }}
            >
              Coordination without the back-and-forth
            </Typography>
            <Typography
              variant="h5"
              component="p"
              fontWeight={500}
              sx={{
                fontSize: { xs: "1.05rem", sm: "1.15rem", md: "1.25rem" },
                lineHeight: 1.6,
                color: "text.secondary",
                maxWidth: 600,
                mx: "auto",
              }}
            >
              Plan chat, automated reminders, 24-hour attendance checks, and easy inviting so plans don&apos;t get lost across Discord, Facebook, and group texts.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
              gridAutoRows: "auto 1fr",
              gap: { xs: 2.5, sm: 3 },
            }}
          >
            {FEATURES_BOTTOM.map(({ accentColor, Icon, title, body, placeholder, imageSrc }, i) => (
              <FeatureCard
                key={title}
                accentColor={accentColor}
                Icon={Icon}
                title={title}
                body={body}
                placeholder={placeholder}
                imageSrc={imageSrc}
                sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw"
                delay={0.1 * i}
                visible={featuresBotReveal.visible}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ── Section: Public Explore Feed ──
          Deliberately below the message sections: the first screens
          carry the one plan-maker promise, and this block then shows
          what plans actually look like as proof. */}
      {!isLoggedIn && <PublicExploreFeed />}

      {/* ── Recently happened + closing CTA ──
          Bundled in a single wrapper that sits tight to the upcoming
          feed (negative top margin pulls the block up so it reads as
          a continuation of the discovery area rather than a separate
          mini-page). The past section uses the same grid as upcoming;
          the closing CTA is wrapped in a soft contained panel below
          so it feels like the natural conclusion to the plan-preview
          area rather than floating text under a single card.

          Past cards never look joinable, see RecentlyHappenedSection,
          and the section hides itself entirely when there are no
          qualifying past plans (the wrapper still renders so the CTA
          remains attached to the upcoming feed). Visibility / privacy
          rules: AGENTS.md, Plan Feed and Community Visibility
          Contract, "Recently happened" subsection. */}
      {!isLoggedIn && (
        <Box
          sx={{
            // PublicExploreFeed has its own `py: { xs: 5, sm: 7, md: 9 }`
            // bottom padding for visual rhythm. That's intentional for
            // when the upcoming feed is the only block, but here it
            // creates an awkward gap before the social-proof block.
            // A small negative top margin re-attaches the past +
            // CTA wrapper to the upcoming feed without having to
            // refactor PublicExploreFeed's spacing model.
            mt: { xs: -3, sm: -4, md: -6 },
            mb: { xs: 4, sm: 6 },
          }}
        >
          <RecentlyHappenedSection variant="public_explore" />
          {/* No closing CTA card here: the orange final CTA section
              directly below is the single sign-up ask at the end of
              the page, so a second card back-to-back read as nagging. */}
        </Box>
      )}

      {/* ── Section 5: CTA ── */}
      <Box
        component="section"
        id="cta"
        ref={ctaReveal.ref}
        sx={{
          py: { xs: 8, sm: 12 },
          textAlign: "center",
          background: (theme) =>
            theme.palette.mode === "light"
              ? "radial-gradient(ellipse 70% 90% at 50% -20%, rgba(247,206,22,0.18) 0%, transparent 60%), linear-gradient(135deg, #E65B13 0%, #C44D10 100%)"
              : theme.palette.grey[900],
          mx: { xs: -2, sm: -3 },
          px: { xs: 3, sm: 4 },
          mb: { xs: 1, sm: 2 },
          color: "white",
          borderRadius: { xs: 4, sm: 6 },
          overflow: "hidden",
          position: "relative",
        }}
      >
        <Box maxWidth={800} mx="auto" sx={REVEAL_SX(ctaReveal.visible)}>
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
            Ready to make your next plan happen?
          </Typography>
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
            Post the plan. Share the link. See who shows up.
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.85, lineHeight: 1.75, maxWidth: 520, mx: "auto" }}
          >
            Create a free account and post your first plan in about a minute.
          </Typography>
          <Divider
            sx={{
              borderColor: "rgba(247,206,22,0.7)",
              mb: { xs: 6, sm: 8 },
              maxWidth: 480,
              mx: "auto",
            }}
          />
          {/* Single closing ask. See how it works already appears in
              the hero and under the How It Works section; repeating it
              here diluted the final conversion step. */}
          <Button
            component={Link}
            href={isLoggedIn ? "/events/create" : "/signup"}
            variant="contained"
            color="onPrimary"
            size="large"
            sx={{
              px: { xs: 5, sm: 6 },
              py: 1.75,
              fontSize: "1.0625rem",
              fontWeight: 700,
              textTransform: "none",
              borderRadius: 2.5,
              minWidth: { xs: 0, sm: 240 },
              maxWidth: 360,
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              "&:hover": { boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
              ...BTN_HOVER,
            }}
          >
            {isLoggedIn ? "Start a plan" : "Create a free account"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
