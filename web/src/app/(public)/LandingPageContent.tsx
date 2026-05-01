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
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import InterestsRoundedIcon from "@mui/icons-material/InterestsRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import VerifiedUserRoundedIcon from "@mui/icons-material/VerifiedUserRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";

import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import EmojiPeopleRoundedIcon from "@mui/icons-material/EmojiPeopleRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PublicExploreFeed from "@/components/landing/PublicExploreFeed";
import RecentlyHappenedSection from "@/components/events/RecentlyHappenedSection";

/**
 * Full public homepage content for logged-out visitors.
 * Sections: Hero -> Public Explore -> For Organizers -> How It Works -> Features ->
 * Meet People -> Why This Works -> CTA
 *
 * Messaging hierarchy (pilot positioning, oriented toward local hobby
 * communities, clubs, and game stores):
 *   (1) Help your community make more plans happen.
 *   (2) Make plans visible, reduce RSVP friction, help newcomers join in.
 *   (3) Member side: find local plans that match your hobbies and a way
 *       into a community.
 * The "For Organizers" section sits directly under the public Explore feed
 * so a store owner / club leader / Discord admin sees the wedge value
 * within the first scroll. Member value still has its own dedicated
 * section further down.
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
    title: "Set up a community or plan",
    body: "Make a community page for your group, or post a one-off plan. Either way you choose the activity, the where, and the when.",
    placeholder: "Screenshot, Create plan flow",
    imageSrc: "/images/home/how-step-create.png",
  },
  {
    step: 2,
    accentColor: "#1565c0",
    Icon: MailOutlineRoundedIcon,
    title: "Share what's happening",
    body: "Send invite links, copy a share link for your group chat, or let nearby people with matching hobbies discover it.",
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
    body: "Confirmation reminders, plan chat, and post-plan feedback help follow-through become the default, not the exception.",
    placeholder: "Screenshot, Plan details",
    imageSrc: "/images/home/how-step-meetup.png",
  },
];

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
    body: "Set your hobbies, your location, how far you'd travel, and the kind of people you enjoy spending time with. NewChums handles the rest.",
  },
  {
    imageSrc: "/images/home/Notifications.png",
    Icon: NotificationsActiveRoundedIcon,
    title: "Get notified of plans that fit you",
    body: "You won't get flooded with everything happening nearby. You'll only hear about gatherings that match your interests and preferences.",
  },
  {
    imageSrc: "/images/home/Meet.png",
    Icon: VerifiedUserRoundedIcon,
    title: "Your chum preferences are remembered",
    body: "Matching is based on shared hobbies, location, and the social preferences you set. The right people find the right plans.",
  },
];

// Organizer-value cards. Wired to surfaces that already exist:
//   - "Make plans visible"     -> public community pages, public Explore feed, hobby matching
//   - "Reduce RSVP friction"   -> RSVP buttons, request-to-join, 24-hour attendance check
//   - "Help newcomers join in" -> public community slug URL, lightweight signup card
//   - "Keep organizers in control" -> approval-required, invite-only, host lock, share link
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
    title: "Make plans visible",
    body: "Give your community a public page where every upcoming gathering shows up in one place. Members and nearby people with matching hobbies can find what's happening without digging through chats.",
  },
  {
    Icon: HowToRegRoundedIcon,
    accentColor: "#1565c0",
    title: "Reduce RSVP friction",
    body: "Built-in RSVPs, request-to-join, and a 24-hour attendance check so you know who's actually coming. Less back-and-forth in group chat, fewer no-shows on the day.",
  },
  {
    Icon: EmojiPeopleRoundedIcon,
    accentColor: "#2e7d32",
    title: "Help newcomers join in",
    body: "Share one link and a curious newcomer can preview the community, sign up in seconds, and request to join a plan. No app download, no waiting on a moderator to add them to a chat.",
  },
  {
    Icon: TuneRoundedIcon,
    accentColor: "#7c3aed",
    title: "Keep organizers in control",
    body: "Choose public, members-only, or invite-only per plan. Approve requests when you want to vet new players. Lock a plan when seats are full. The defaults are sensible, the toggles are yours.",
  },
];

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
    title: "Flexible invites and discovery",
    body: (
      <>
        Invite people by name or email,{" "}
        <Box component="span" sx={{ fontWeight: 700 }}>
          share a link
        </Box>
        , or let nearby people with matching hobbies discover your plan. Daily digests surface plans
        you&apos;d actually enjoy.
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
  const [meetPeopleImageErrors, setMeetPeopleImageErrors] = useState<Set<string>>(new Set());
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
  const meetReveal = useReveal();
  const whyReveal = useReveal();
  const ctaReveal = useReveal(0.2);

  return (
    <Box sx={{ pt: { xs: 4, sm: 6, md: 8 }, pb: { xs: 4, sm: 6 } }}>
      {/* ── Section 1: Hero ── */}
      <Box
        component="section"
        ref={heroReveal.ref}
        sx={{ pb: { xs: 6, sm: 8, md: 10 }, ...REVEAL_SX(heroReveal.visible) }}
      >
        <Grid container spacing={{ xs: 4, md: 8 }} alignItems="stretch">
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
                For local hobby communities, clubs, and game stores
              </Typography>

              <Typography component="h1" variant="h1" sx={{ mt: "0 !important" }}>
                Help your community make more plans happen
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
                NewChums gives your community a simple place to{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  post plans, collect RSVPs, invite people,
                </Box>{" "}
                and help members find local gatherings that match their hobbies.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 0.5 }}>
                {isLoggedIn ? (
                  <>
                    <Button
                      component={Link}
                      href="/communities"
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
                        boxShadow: "0 4px 14px rgba(230,91,19,0.25)",
                        "&:hover": { boxShadow: "0 6px 20px rgba(230,91,19,0.35)" },
                        ...BTN_HOVER,
                      }}
                    >
                      Browse communities
                    </Button>
                    <Button
                      component={Link}
                      href="/events"
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
                        ...BTN_HOVER,
                      }}
                    >
                      Browse plans
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      component={Link}
                      href="/communities"
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
                        boxShadow: "0 4px 14px rgba(230,91,19,0.25)",
                        "&:hover": { boxShadow: "0 6px 20px rgba(230,91,19,0.35)" },
                        ...BTN_HOVER,
                      }}
                    >
                      Browse communities
                    </Button>
                    <Button
                      component="a"
                      href="#for-organizers"
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
                        ...BTN_HOVER,
                      }}
                    >
                      For organizers
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </Grid>

          {/* Right: hero image.
              Placeholder path, deliberately wired ahead of the asset:
                /public/images/home/community-hero.png
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
                aria-label="Local hobby community gathering"
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
                  Your community, in one place.
                </Typography>
              </Box>
            ) : (
              <Box
                component="img"
                src="/images/home/community-hero.png"
                alt="A local hobby community making plans together"
                onError={() => setHeroImageErrored(true)}
                sx={{
                  height: "100%",
                  width: "auto",
                  maxWidth: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            )}
          </Grid>
        </Grid>
      </Box>

      {/* ── Section 1.1: Public Explore Feed ── */}
      {!isLoggedIn && <PublicExploreFeed />}

      {/* ── Sections 1.2 + 1.3: Recently happened + closing CTA ──
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

          {/* Closing CTA panel. Soft contained card so the affordance
              feels like an intentional conclusion to the plan-preview
              block, not detached marketing text. Visual weight is
              intentionally lighter than the orange Section 5 CTA so
              it reads as a calm "want more?" rather than a hard sell. */}
          <Box
            sx={{
              mt: { xs: 3.5, sm: 4.5 },
              borderRadius: 3,
              border: "1px solid",
              borderColor: "grey.200",
              bgcolor: "grey.50",
              px: { xs: 2.5, sm: 4 },
              py: { xs: 3, sm: 4 },
              textAlign: "center",
            }}
          >
            <Stack spacing={1.25} alignItems="center" sx={{ maxWidth: 520, mx: "auto" }}>
              <Typography
                component="h2"
                sx={{
                  fontSize: { xs: "1.125rem", sm: "1.25rem" },
                  fontWeight: 700,
                  lineHeight: 1.3,
                  letterSpacing: "-0.015em",
                }}
              >
                Want to see more plans near you?
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ lineHeight: 1.65, fontSize: "0.9375rem" }}
              >
                Sign up to get personalized recommendations, RSVP, chat with attendees, and create your own.
              </Typography>
              <Button
                component={Link}
                href="/signup"
                variant="contained"
                color="primary"
                sx={{
                  mt: 0.5,
                  px: 3.5,
                  py: 1.25,
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  fontSize: "0.9375rem",
                  boxShadow: "0 4px 14px rgba(230,91,19,0.22)",
                  "&:hover": { boxShadow: "0 6px 18px rgba(230,91,19,0.28)" },
                  ...BTN_HOVER,
                }}
              >
                Create a free account
              </Button>
            </Stack>
          </Box>
        </Box>
      )}

      {/* ── Section: For Organizers ──
          Pilot-positioning section. Anchored from the top nav
          ("For Organizers" -> /#for-organizers). Speaks directly to
          local store owners, club leaders, and Discord/Facebook group
          admins. Card data lives in ORGANIZER_VALUE_CARDS at the top
          of this file. Visual treatment is the same accent-bordered
          card pattern used by "Why NewChums works" so the section
          reads as a peer of the rest of the page rather than a
          retrofitted block. */}
      <Box
        component="section"
        id="for-organizers"
        ref={organizersReveal.ref}
        sx={{
          ...SECTION_SPACING,
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#F6F7F9" : "grey.900"),
          // The for-organizers anchor needs scroll-margin so the sticky
          // site header doesn't cover the heading on hash navigation.
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
                For organizers
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
              Built for the people who keep communities moving
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
              Game stores, hobby clubs, league captains, Discord and Facebook group admins. If
              you&apos;re the person turning &ldquo;we should do something&rdquo; into actual plans,
              NewChums is built to make that part easier.
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
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={2}
              justifyContent="center"
              alignItems="center"
            >
              <Button
                component={Link}
                href={isLoggedIn ? "/communities/create" : "/signup"}
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
                  minWidth: { xs: "100%", sm: 220 },
                  boxShadow: "0 4px 16px rgba(230,91,19,0.25)",
                  "&:hover": { boxShadow: "0 6px 24px rgba(230,91,19,0.35)" },
                  ...BTN_HOVER,
                }}
              >
                {isLoggedIn ? "Start a community" : "Create a free account"}
              </Button>
              <Button
                component={Link}
                href="/communities"
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
                  minWidth: { xs: "100%", sm: 220 },
                  ...BTN_HOVER,
                }}
              >
                See active communities
              </Button>
            </Stack>
          </Box>
        </Box>
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
              Whether you run a community or you&apos;re hosting a one-off, the same four steps get you from idea to gathering.
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
                minWidth: { xs: "100%", sm: "auto" },
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

      {/* ── Section: Meet New People ── */}
      <Box
        component="section"
        id="meet-people"
        ref={meetReveal.ref}
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => (theme.palette.mode === "light" ? "#FCECC3" : "grey.900"),
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={1100} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 }, ...REVEAL_SX(meetReveal.visible) }}>
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
              For people looking for their hobby community
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
              Find local plans and communities that match what you actually enjoy doing.
            </Typography>
          </Box>

          <Grid
            container
            spacing={{ xs: 4, md: 6 }}
            alignItems="center"
            sx={{ mb: { xs: 5, sm: 7 } }}
          >
            <Grid size={{ xs: 12, md: 6 }} sx={REVEAL_SX(meetReveal.visible, 0.1)}>
              <Typography variant="body1" sx={{ lineHeight: 1.85, mb: 3, color: "text.primary" }}>
                Browse{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  nearby plans and communities
                </Box>{" "}
                that fit your hobbies. RSVP to a board game night, request to join a community for
                your local pottery group, jump into the plan chat once you&apos;re in.
              </Typography>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.85, mb: { xs: 3, sm: 4 }, color: "text.primary" }}
              >
                Set your hobbies and the kind of plans you enjoy, and{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  matching gatherings come to you
                </Box>{" "}
                instead of you trawling group chats. New to the area or new to the hobby? Public
                community pages are an easy first step in.
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
                    boxShadow: "0 4px 14px rgba(230,91,19,0.25)",
                    "&:hover": { boxShadow: "0 6px 20px rgba(230,91,19,0.35)" },
                    ...BTN_HOVER,
                  }}
                >
                  Setup your profile
                </Button>
              )}
            </Grid>

            <Grid size={{ xs: 12, md: 6 }} sx={REVEAL_SX(meetReveal.visible, 0.2)}>
              <Box
                sx={{
                  borderRadius: 3,
                  overflow: "hidden",
                  border: "1px solid",
                  borderColor: (theme) =>
                    theme.palette.mode === "light" ? "rgba(0,0,0,0.06)" : "divider",
                  boxShadow: (theme) =>
                    theme.palette.mode === "light" ? "0 8px 32px rgba(0,0,0,0.10)" : "none",
                  ...CARD_HOVER,
                }}
              >
                <Image
                  src="/images/home/profile-settings.png"
                  alt="NewChums profile and preference settings"
                  width={1200}
                  height={900}
                  sizes="(max-width: 960px) 100vw, 50vw"
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </Box>
            </Grid>
          </Grid>

          {/* Three feature callouts */}
          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {MEET_PEOPLE_CALLOUTS.map(({ imageSrc, Icon, title, body }, i) => {
              const showFallback = !imageSrc || meetPeopleImageErrors.has(title);
              return (
                <Grid key={title} size={{ xs: 12, sm: 4 }}>
                  <Box
                    sx={{
                      height: "100%",
                      backgroundColor: (theme) =>
                        theme.palette.mode === "light"
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(255,255,255,0.04)",
                      borderRadius: 3,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      ...CARD_HOVER,
                      ...REVEAL_SX(meetReveal.visible, 0.15 + i * 0.1),
                    }}
                  >
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
                            alt={title}
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
                    <Box sx={{ px: { xs: 3, sm: 3 }, pb: { xs: 3, sm: 3.5 }, pt: 1.5, flex: 1 }}>
                      <Typography
                        variant="h6"
                        component="h3"
                        fontWeight={700}
                        sx={{ mb: 1, fontSize: { xs: "1rem", sm: "1.0625rem" }, lineHeight: 1.35 }}
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
        ref={whyReveal.ref}
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
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 }, ...REVEAL_SX(whyReveal.visible) }}>
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
              Why NewChums works
            </Typography>
            <Typography
              variant="h5"
              component="p"
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

          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {WHY_THIS_WORKS_CARDS.map(({ Icon, accentColor, title, body }, i) => (
              <Grid key={title} size={{ xs: 12, sm: 4 }}>
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
                    alignItems: { xs: "center", sm: "flex-start" },
                    textAlign: { xs: "center", sm: "left" },
                    ...CARD_HOVER,
                    ...REVEAL_SX(whyReveal.visible, 0.1 * i),
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
                    sx={{ mb: 1.25, fontSize: { xs: "1rem", sm: "1.0625rem" }, lineHeight: 1.35 }}
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

          <Box
            sx={{
              mt: { xs: 5, sm: 7 },
              textAlign: "center",
              ...REVEAL_SX(whyReveal.visible, 0.35),
            }}
          >
            <Box
              sx={{
                backgroundColor: (theme) =>
                  theme.palette.mode === "light" ? "primary.dark" : "grey.800",
                borderRadius: 3,
                px: { xs: 3, sm: 5 },
                py: { xs: 3.5, sm: 4 },
                maxWidth: 640,
                mx: "auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
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
                There&apos;s real research behind why shared activities, smaller gatherings, and
                repeated contact help communities show up consistently.
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
                  ...BTN_HOVER,
                }}
              >
                Read the research
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Section 5: CTA ── */}
      <Box
        component="section"
        id="cta"
        ref={ctaReveal.ref}
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
            Ready to make your community easier to join?
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
            Let&apos;s make plans happen
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.85, lineHeight: 1.75, maxWidth: 520, mx: "auto" }}
          >
            Create a free account, explore local plans, or start building a home for your hobby community.
          </Typography>
          <Divider
            sx={{
              borderColor: "rgba(247,206,22,0.7)",
              mb: { xs: 6, sm: 8 },
              maxWidth: 480,
              mx: "auto",
            }}
          />
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            alignItems="center"
          >
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
                fontWeight: 700,
                textTransform: "none",
                borderRadius: 2.5,
                minWidth: { xs: "100%", sm: 240 },
                boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
                "&:hover": { boxShadow: "0 4px 20px rgba(0,0,0,0.2)" },
                ...BTN_HOVER,
              }}
            >
              {isLoggedIn ? "Explore NewChums" : "Create a free account"}
            </Button>
            <Button
              component={Link}
              href="/communities"
              variant="outlined"
              size="large"
              sx={{
                px: { xs: 5, sm: 6 },
                py: 1.75,
                fontSize: "1.0625rem",
                fontWeight: 600,
                textTransform: "none",
                borderRadius: 2.5,
                minWidth: { xs: "100%", sm: 240 },
                color: "white",
                borderColor: "rgba(255,255,255,0.6)",
                "&:hover": {
                  borderColor: "white",
                  backgroundColor: "rgba(255,255,255,0.08)",
                },
                ...BTN_HOVER,
              }}
            >
              Browse communities
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
