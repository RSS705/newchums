"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import Link from "next/link";
import type { SvgIconComponent } from "@mui/icons-material";

// Lifecycle icons
import AddCircleOutlineRoundedIcon from "@mui/icons-material/AddCircleOutlineRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

// Section icons
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";

// Use case icons
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import LocalCafeRoundedIcon from "@mui/icons-material/LocalCafeRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import HikingRoundedIcon from "@mui/icons-material/HikingRounded";

// Comparison icons
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";

/**
 * Public marketing page: "How it Works", comprehensive product feature deep-dive.
 *
 * Screenshot placeholders: drop images into /public/images/how-it-works/ using the
 * filenames referenced below. The page renders them automatically via <Image> with
 * onError fallback to a styled gradient placeholder.
 *
 * Naming convention: /public/images/how-it-works/{section}-{descriptor}.png
 */

const CONTENT_MAX_WIDTH = 800;
const WIDE_MAX_WIDTH = 1100;
const FULL_BLEED = { mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 } };

// ── Lifecycle stepper (Section 2) ────────────────────────────────────────────

type LifecycleStep = {
  Icon: SvgIconComponent;
  label: string;
  headline: string;
  description: string;
  color: string;
  imageSrc: string;
  placeholder: string;
  highlights: string[];
};

const LIFECYCLE_STEPS: LifecycleStep[] = [
  {
    Icon: AddCircleOutlineRoundedIcon,
    label: "Create",
    headline: "Start with a plan",
    description: "Pick an activity, set the time and place, and choose who can see it. You control visibility, seat limits, and whether people need approval to join.",
    color: "#E65B13",
    imageSrc: "/images/how-it-works/step-create.png",
    placeholder: "Screenshot: Create a plan",
    highlights: ["Public, private, or invite-only", "In-person or online", "Seat limits and approval controls"],
  },
  {
    Icon: MailOutlineRoundedIcon,
    label: "Invite",
    headline: "Get people involved",
    description: "Send direct invites, share a link, or let people find your plan in the explore feed. Even people without an account can RSVP.",
    color: "#1565c0",
    imageSrc: "/images/how-it-works/step-invite.png",
    placeholder: "Screenshot: Invite flow",
    highlights: ["Invite by handle or email", "Shareable links for anyone", "Guest RSVP without signup"],
  },
  {
    Icon: ScheduleRoundedIcon,
    label: "Schedule",
    headline: "Find the right time",
    description: "Let attendees suggest alternate times or share their full availability. See what overlaps and pick the time that works for the most people.",
    color: "#7c3aed",
    imageSrc: "/images/how-it-works/step-schedule.png",
    placeholder: "Screenshot: Scheduling",
    highlights: ["Suggest alternate times", "Availability mode with deadlines", "Host promotes the best time"],
  },
  {
    Icon: EventAvailableRoundedIcon,
    label: "Confirm",
    headline: "Know who's actually coming",
    description: "About 24 hours before the plan, everyone who marked Going is asked to confirm they are still coming. One tap to respond. You see viability in real time.",
    color: "#059669",
    imageSrc: "/images/how-it-works/step-confirm.png",
    placeholder: "Screenshot: Attendance confirmation",
    highlights: ["Timed reminders at 24h, 12h, 3h", "Minimum attendee thresholds", "Auto-cancel or notify the host"],
  },
  {
    Icon: GroupsRoundedIcon,
    label: "Meet",
    headline: "Everyone shows up prepared",
    description: "The plan page is the single source of truth. Everyone sees the same details, the chat keeps coordination in one place, and nothing gets lost.",
    color: "#0e7490",
    imageSrc: "/images/how-it-works/step-meet.png",
    placeholder: "Screenshot: Plan details",
    highlights: ["Built-in plan chat", "Real-time updates for changes", "Unread message indicators"],
  },
  {
    Icon: StarRoundedIcon,
    label: "Follow up",
    headline: "Build trust over time",
    description: "After the plan, leave quick private feedback. Attendance records and reputation scores help everyone make better decisions about who to plan with next.",
    color: "#E65B13",
    imageSrc: "/images/how-it-works/step-followup.png",
    placeholder: "Screenshot: Feedback and profile",
    highlights: ["Post-plan feedback", "Attendance record on profiles", "Reliability and hosting scores"],
  },
];

// ── "Create and shape" feature cards (Section 3) ────────────────────────────

type CreateCard = { label: string; detail: string; imageSrc: string; placeholder: string };

const CREATE_CARDS: CreateCard[] = [
  { label: "Hobbies & interests", detail: "Tag multiple hobbies so the right people can find your plan. Create new hobbies on the fly.", imageSrc: "/images/how-it-works/create-hobbies.png", placeholder: "Screenshot: Hobby tagging" },
  { label: "Location privacy", detail: "Show exact location to everyone, to confirmed attendees only, or just an approximate area.", imageSrc: "/images/how-it-works/create-location.png", placeholder: "Screenshot: Location controls" },
  { label: "Visibility controls", detail: "Public (anyone can find it), chums-only (your connections), or invite-only (specific people).", imageSrc: "/images/how-it-works/create-visibility.png", placeholder: "Screenshot: Visibility options" },
  { label: "Require approval", detail: "New people request to join and you approve or decline before they're added.", imageSrc: "/images/how-it-works/create-approval.png", placeholder: "Screenshot: Approval flow" },
  { label: "24-hour attendance check", detail: "Ask people who marked Going to confirm they are still coming about 24 hours before the plan.", imageSrc: "/images/how-it-works/create-confirmation.png", placeholder: "Screenshot: Attendance check settings" },
  { label: "Scheduling flexibility", detail: "Let attendees suggest alternate times, or request everyone's full availability with a deadline.", imageSrc: "/images/how-it-works/create-scheduling.png", placeholder: "Screenshot: Scheduling options" },
];

// ── Feature sections data ───────────────────────────────────────────────────

type FeatureSection = {
  id: string;
  sectionTitle: string;
  subtitle: string;
  accentColor: string;
  imageOnLeft: boolean;
  images: { src: string; placeholder: string; Icon: SvgIconComponent }[];
  features: { label: string; detail: string }[];
  beta?: boolean;
};

const FEATURE_SECTIONS: FeatureSection[] = [
  {
    id: "inviting",
    sectionTitle: "Invite people and manage attendance",
    subtitle: "Get the right people involved, whether they have an account or not. Share a link, send a direct invite, or let people find you.",
    accentColor: "#1565c0",
    imageOnLeft: true,
    images: [
      { src: "/images/how-it-works/invite-direct.png", placeholder: "Screenshot: Direct invites", Icon: MailOutlineRoundedIcon },
      { src: "/images/how-it-works/invite-share.png", placeholder: "Screenshot: Share link", Icon: LinkRoundedIcon },
      { src: "/images/how-it-works/invite-rsvp.png", placeholder: "Screenshot: RSVP options", Icon: GroupsRoundedIcon },
    ],
    features: [
      { label: "Direct invites", detail: "Invite people by NewChums handle or email address. They get a notification and an email." },
      { label: "Custom invite messages", detail: "Add a personal note when sending invites so people know why you're reaching out." },
      { label: "Share links", detail: "Generate a permanent shareable link for any plan. Send it anywhere." },
      { label: "Guest RSVP without an account", detail: "Anyone with a link can RSVP using just their email and a quick verification code." },
      { label: "Going, Maybe, or Can't Make It", detail: "Three clear RSVP options with optional personal notes. Update anytime." },
      { label: "Join requests", detail: "For plans that require approval, people request to join and the host reviews each one." },
    ],
  },
  {
    id: "scheduling",
    sectionTitle: "Scheduling that actually works",
    subtitle: "Stop guessing when people are free. Let attendees suggest times or share their availability, and find the slot that works.",
    accentColor: "#7c3aed",
    imageOnLeft: false,
    images: [
      { src: "/images/how-it-works/schedule-suggest.png", placeholder: "Screenshot: Suggest a time", Icon: ScheduleRoundedIcon },
      { src: "/images/how-it-works/schedule-availability.png", placeholder: "Screenshot: Availability mode", Icon: AccessTimeRoundedIcon },
      { src: "/images/how-it-works/schedule-overlap.png", placeholder: "Screenshot: Overlap view", Icon: EventAvailableRoundedIcon },
    ],
    features: [
      { label: "Suggest alternate times", detail: "Attendees propose a different start time with an optional note." },
      { label: "Request availability", detail: "Ask everyone to share their free windows, with an optional deadline." },
      { label: "See what overlaps", detail: "A visual breakdown shows which times work for the most people." },
      { label: "Host picks the time", detail: "Promote the best suggestion to become the official plan time with one click." },
    ],
  },
  {
    id: "plan-chat",
    sectionTitle: "Coordinate in one place",
    subtitle: "Every plan has its own built-in chat. Sort out last-minute details, share updates, or just say hello.",
    accentColor: "#0e7490",
    imageOnLeft: true,
    images: [
      { src: "/images/how-it-works/chat.png", placeholder: "Screenshot: Plan chat", Icon: ChatRoundedIcon },
    ],
    features: [
      { label: "Real-time messaging", detail: "Messages appear instantly for everyone in the plan." },
      { label: "Unread indicators", detail: "See at a glance which plans have new messages." },
      { label: "Daily catch-up emails", detail: "A daily digest email summarizes unread messages so you stay in the loop." },
      { label: "Plan updates & changes", detail: "When the host updates the plan, changes are logged and attendees are notified." },
    ],
  },
  {
    id: "discovery",
    sectionTitle: "Discover plans and communities",
    subtitle: "Find plans that match your interests and location. Browse what people near you are organizing, and join a community if you want a regular group.",
    accentColor: "#1565c0",
    imageOnLeft: false,
    images: [
      { src: "/images/how-it-works/discover-explore.png", placeholder: "Screenshot: Explore feed", Icon: ExploreRoundedIcon },
      { src: "/images/how-it-works/discover-digest.png", placeholder: "Screenshot: Match digest email", Icon: MailOutlineRoundedIcon },
      { src: "/images/how-it-works/discover-community.png", placeholder: "Screenshot: Community page", Icon: GroupsRoundedIcon },
    ],
    features: [
      { label: "Explore feed", detail: "Browse plans filtered by hobby, distance, time range, and sort order. Personalized to your interests." },
      { label: "Browse without an account", detail: "Public plans are visible to anyone. No signup required." },
      { label: "Daily match digest", detail: "A daily email surfaces new plans that match your hobbies and travel distance." },
      { label: "Communities", detail: "Create or join public and private groups. Community plans appear in a dedicated feed." },
      { label: "Smart matching", detail: "Your chum preferences help filter which plans and people show up in your recommendations." },
    ],
  },
  {
    id: "trust",
    sectionTitle: "Trust and accountability",
    subtitle: "A lightweight reputation system that rewards people who show up and follow through.",
    accentColor: "#E65B13",
    imageOnLeft: true,
    images: [
      { src: "/images/how-it-works/trust-profile.png", placeholder: "Screenshot: Attendance record", Icon: StarRoundedIcon },
      { src: "/images/how-it-works/trust-reporting.png", placeholder: "Screenshot: Issue reporting", Icon: ShieldRoundedIcon },
      { src: "/images/how-it-works/trust-preferences.png", placeholder: "Screenshot: Chum preferences", Icon: TuneRoundedIcon },
    ],
    features: [
      { label: "Attendance record", detail: "Every profile shows: shows up, confirms attendance, and host follow-through." },
      { label: "Post-plan feedback", detail: "Leave quick private feedback on reliability, sociability, and hosting quality." },
      { label: "Issue reporting", detail: "Flag no-shows, late cancellations, and very late arrivals. Private and affects reliability scores." },
      { label: "Conduct and safety", detail: "Report safety concerns directly from any plan. Goes to the admin team immediately." },
      { label: "Chum preference matching", detail: "Set per-metric thresholds for reliability and more. Plans are filtered based on your preferences." },
    ],
  },
];

// ── Use cases (Section 6) ───────────────────────────────────────────────────

type UseCase = { Icon: SvgIconComponent; title: string; description: string; bannerSrc: string; bannerPlaceholder: string; bannerColor: string };

const USE_CASES: UseCase[] = [
  { Icon: CasinoRoundedIcon, title: "Board game nights", description: "Set a player cap, pick the game, share a link. No more 'who's in?' messages that nobody replies to.", bannerSrc: "/images/how-it-works/usecase-boardgames.png", bannerPlaceholder: "Board games", bannerColor: "#E65B13" },
  { Icon: LocalCafeRoundedIcon, title: "Coffee walks & casual meetups", description: "Low-key, low-commitment. Post a time and a meeting point and see who shows up.", bannerSrc: "/images/how-it-works/usecase-coffee.png", bannerPlaceholder: "Coffee meetup", bannerColor: "#7c3aed" },
  { Icon: MenuBookRoundedIcon, title: "Study groups & coworking", description: "Find people working on the same thing nearby. Use availability mode to pick the best time.", bannerSrc: "/images/how-it-works/usecase-study.png", bannerPlaceholder: "Study group", bannerColor: "#1565c0" },
  { Icon: CelebrationRoundedIcon, title: "Community events", description: "Associate your plan with a community. Members see it in their feed automatically.", bannerSrc: "/images/how-it-works/usecase-community.png", bannerPlaceholder: "Community event", bannerColor: "#059669" },
  { Icon: HikingRoundedIcon, title: "Outdoor adventures", description: "Hikes, bike rides, park hangs. Approximate location keeps the meeting point flexible.", bannerSrc: "/images/how-it-works/usecase-outdoors.png", bannerPlaceholder: "Outdoor adventure", bannerColor: "#0e7490" },
  { Icon: LocalCafeRoundedIcon, title: "Dinner parties & potlucks", description: "Set the vibe, cap the guest list, and let people RSVP. Everyone knows what to bring.", bannerSrc: "/images/how-it-works/usecase-dinner.png", bannerPlaceholder: "Dinner party", bannerColor: "#E65B13" },
];

// ── Group chat comparison ───────────────────────────────────────────────────

const COMPARISON_POINTS: { problem: string; solution: string }[] = [
  { problem: "'Who's in?' messages that nobody replies to", solution: "Structured RSVPs: Going, Maybe, or Can't Make It, with optional notes." },
  { problem: "Nobody knows the final time or place", solution: "One source of truth for every detail, always up to date." },
  { problem: "Half the group says maybe and never confirms", solution: "Automatic 24-hour confirmation window with timed reminders." },
  { problem: "You show up and nobody else does", solution: "Minimum attendee thresholds with auto-cancel or host notification." },
  { problem: "Inviting new people means adding them to another chat", solution: "Share a link. Anyone can RSVP, even without an account." },
  { problem: "No memory of who flaked last time", solution: "Attendance records and post-plan feedback visible on every profile." },
];

// ── Shared components ───────────────────────────────────────────────────────

function InlineCTA({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <Button
      component={Link}
      href={isLoggedIn ? "/" : "/signup"}
      variant="contained"
      color="primary"
      size="large"
      sx={{
        px: { xs: 4, sm: 5 },
        py: 1.5,
        fontSize: "1rem",
        fontWeight: 600,
        textTransform: "none",
        borderRadius: 2.5,
        minWidth: { xs: "100%", sm: 200 },
        maxWidth: { xs: "none", sm: 280 },
        boxShadow: "0 2px 12px rgba(230,91,19,0.2)",
        "&:hover": { boxShadow: "0 4px 20px rgba(230,91,19,0.3)" },
      }}
    >
      {isLoggedIn ? "Explore NewChums" : "Try it, it's free"}
    </Button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HowItWorksContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [activeStep, setActiveStep] = useState(0);

  function Screenshot({ src, placeholder, icon: Icon, accentColor = "#E65B13", aspectRatio = "3 / 2", width = 1200, height = 800 }: {
    src: string;
    placeholder: string;
    icon: SvgIconComponent;
    accentColor?: string;
    aspectRatio?: string;
    width?: number;
    height?: number;
  }) {
    const hasError = imageErrors.has(src);
    return (
      <Box
        sx={{
          borderRadius: { xs: 2.5, md: 3 },
          overflow: "hidden",
          position: "relative",
          ...(hasError && { aspectRatio }),
          background: hasError
            ? `linear-gradient(135deg, ${accentColor}08 0%, #f9fafb 100%)`
            : "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: (theme) =>
            theme.palette.mode === "light"
              ? "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)"
              : "0 4px 16px rgba(0,0,0,0.3)",
          border: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "light" ? "rgba(0,0,0,0.06)" : "divider",
        }}
      >
        {!hasError ? (
          <Image
            src={src}
            alt={placeholder}
            width={width}
            height={height}
            sizes="(max-width: 960px) 100vw, 50vw"
            style={{ width: "100%", height: "auto", display: "block" }}
            onError={() => setImageErrors((prev) => new Set(prev).add(src))}
          />
        ) : (
          <Stack alignItems="center" spacing={1} sx={{ opacity: 0.2, py: 4 }}>
            <Icon sx={{ fontSize: 36, color: accentColor }} />
            <Typography variant="caption" color="text.secondary" fontWeight={500}>
              {placeholder}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.625rem", fontFamily: "monospace" }}>
              {width} x {height}px
            </Typography>
          </Stack>
        )}
      </Box>
    );
  }

  const step = LIFECYCLE_STEPS[activeStep];

  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 }, overflow: "hidden" }}>

      {/* ═══════════════ Section 1: Hero ═══════════════ */}
      <Box component="section" sx={{ py: { xs: 5, sm: 8, md: 10 } }}>
        <Stack alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
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
              <ExploreRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
              How NewChums works
            </Typography>
          </Stack>
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: { xs: "2.5rem", sm: "3.25rem", md: "4rem" }, lineHeight: 1.15, mb: 3 }}
          >
            From the first idea to the day you meet up
          </Typography>
          <Box sx={{ width: 48, height: 3, bgcolor: "secondary.main", borderRadius: 1, mb: { xs: 3.5, sm: 4.5 } }} />
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.25rem" }, mb: 2 }}
          >
            Whether it&apos;s a one-off get-together or something you run every week, NewChums supports the whole flow: posting plans, inviting people, collecting RSVPs, finding the best time, confirming attendance, and following up after.
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.secondary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.125rem" }, mb: { xs: 4, sm: 5 } }}
          >
            Here&apos;s everything it can do.
          </Typography>
          <InlineCTA isLoggedIn={isLoggedIn} />
        </Stack>
      </Box>

      {/* ═══════════════ Section 2: Lifecycle stepper ═══════════════ */}
      <Box
        component="section"
        sx={{
          py: { xs: 6, sm: 10, md: 12 },
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          ...FULL_BLEED,
        }}
      >
        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography component="h2" variant="h2" fontWeight={800} sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}>
              From idea to gathering
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              Most tools cover one piece of the puzzle. NewChums covers the whole thing.
            </Typography>
          </Box>

          {/* Stepper tabs */}
          <Box sx={{
            display: "flex", justifyContent: { xs: "flex-start", sm: "center" }, gap: { xs: 0.5, sm: 1 }, mb: { xs: 3, sm: 4 },
            overflowX: { xs: "auto", sm: "visible" }, flexWrap: { xs: "nowrap", sm: "wrap" },
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" },
            px: { xs: 1, sm: 0 },
          }}>
            {LIFECYCLE_STEPS.map(({ Icon, label, color }, i) => {
              const isActive = i === activeStep;
              return (
                <Box
                  key={label}
                  onClick={() => setActiveStep(i)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveStep(i); } }}
                  sx={{
                    display: "flex", alignItems: "center", gap: 1, flexShrink: 0,
                    px: { xs: 1.5, sm: 2.5 }, py: { xs: 1, sm: 1.25 }, borderRadius: 3,
                    cursor: "pointer", transition: "all 0.2s ease", userSelect: "none",
                    backgroundColor: isActive ? "background.paper" : "transparent",
                    boxShadow: isActive ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
                    border: "1.5px solid", borderColor: isActive ? color : "transparent",
                    "&:hover": { backgroundColor: "background.paper", boxShadow: "0 2px 8px rgba(0,0,0,0.06)" },
                  }}
                >
                  <Box sx={{
                    width: { xs: 28, sm: 36 }, height: { xs: 28, sm: 36 }, borderRadius: "50%",
                    bgcolor: isActive ? `${color}14` : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon sx={{ fontSize: { xs: 16, sm: 20 }, color: isActive ? color : "text.secondary" }} />
                  </Box>
                  <Typography variant="body2" fontWeight={isActive ? 700 : 500} sx={{
                    color: isActive ? color : "text.secondary",
                    fontSize: { xs: "0.75rem", sm: "0.875rem" },
                    display: { xs: isActive ? "block" : "none", sm: "block" },
                    whiteSpace: "nowrap",
                  }}>
                    {label}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Active step content: two-column with screenshot + details */}
          <Box
            sx={{
              backgroundColor: "background.paper",
              borderRadius: 4,
              overflow: "hidden",
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Grid container>
              {/* Screenshot side */}
              <Grid size={{ xs: 12, md: 7 }}>
                <Box sx={{ p: { xs: 1.5, sm: 3 } }}>
                  <Screenshot
                    src={step.imageSrc}
                    placeholder={step.placeholder}
                    icon={step.Icon}
                    accentColor={step.color}
                    aspectRatio="16 / 10"
                    width={1200}
                    height={750}
                  />
                </Box>
              </Grid>
              {/* Details side */}
              <Grid size={{ xs: 12, md: 5 }}>
                <Box sx={{ p: { xs: 2.5, sm: 3, md: 4 }, pt: { xs: 1, sm: 3, md: 4 }, display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: "50%", bgcolor: `${step.color}12`,
                    display: { xs: "none", md: "flex" }, alignItems: "center", justifyContent: "center", mb: 2,
                  }}>
                    {(() => { const StepIcon = step.Icon; return <StepIcon sx={{ fontSize: 22, color: step.color }} />; })()}
                  </Box>
                  <Typography variant="overline" sx={{ color: step.color, fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.65rem", mb: 0.5 }}>
                    Step {activeStep + 1}
                  </Typography>
                  <Typography variant="h5" fontWeight={700} sx={{ mb: 1.5, fontSize: { xs: "1.25rem", sm: "1.375rem" }, lineHeight: 1.25 }}>
                    {step.headline}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2.5 }}>
                    {step.description}
                  </Typography>
                  <Stack spacing={1}>
                    {step.highlights.map((h) => (
                      <Stack key={h} direction="row" spacing={1} alignItems="center">
                        <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: step.color, flexShrink: 0 }} />
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: "0.8125rem" }}>{h}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
              </Grid>
            </Grid>
          </Box>
        </Box>
      </Box>

      {/* ═══════════════ Section 3: Create and shape the plan ═══════════════ */}
      <Box
        component="section"
        id="create-plan"
        sx={{
          py: { xs: 8, sm: 12, md: 14 },
          position: "relative",
          overflow: "hidden",
          ...FULL_BLEED,
        }}
      >
        <Box sx={{ position: "absolute", inset: 0, background: (theme) => theme.palette.mode === "light" ? "linear-gradient(165deg, #FFF7ED 0%, #FFFFFF 40%, #FFF7ED 100%)" : "none", zIndex: 0 }} />
        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto" sx={{ position: "relative", zIndex: 1 }}>
          <Box sx={{ textAlign: "center", mb: { xs: 5, sm: 7 } }}>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1.75 }}>
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
                <TuneRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
                Host controls
              </Typography>
            </Stack>
            <Typography component="h2" variant="h2" fontWeight={800} sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.75rem" }, lineHeight: 1.15, mb: 2 }}>
              Create and shape the plan
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 620, mx: "auto" }}>
              Every plan starts with the basics, a title, time, and place. Then customize exactly how it works.
            </Typography>
          </Box>

          {/* Feature cards with image placeholders */}
          <Grid container spacing={{ xs: 2.5, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
            {CREATE_CARDS.map(({ label, detail, imageSrc, placeholder }) => (
              <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderRadius: 3,
                    overflow: "hidden",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    border: "1px solid",
                    borderColor: "divider",
                    transition: "box-shadow 0.2s ease, transform 0.2s ease",
                    "&:hover": { boxShadow: "0 6px 24px rgba(0,0,0,0.08)", transform: "translateY(-2px)" },
                  }}
                >
                  {/* Card image */}
                  <Screenshot src={imageSrc} placeholder={placeholder} icon={TuneRoundedIcon} accentColor="#E65B13" aspectRatio="16 / 10" width={1200} height={750} />
                  {/* Card text */}
                  <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.3, color: "primary.main" }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {detail}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>

        </Box>
      </Box>

      {/* ═══════════════ Sections 4-8: Feature deep-dives ═══════════════ */}
      {FEATURE_SECTIONS.map((section, index) => {
        const bgColors = [undefined, "grey.100", undefined, "grey.100", undefined];
        const bg = bgColors[index];
        const needsBleed = !!bg;
        const hasMultipleImages = section.images.length > 1;
        return (
          <Box
            key={section.id}
            component="section"
            id={section.id}
            sx={{
              py: { xs: 7, sm: 10, md: 12 },
              ...(needsBleed && {
                backgroundColor: (theme) => theme.palette.mode === "light" ? bg : "grey.900",
                ...FULL_BLEED,
              }),
            }}
          >
            <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
              <Grid container spacing={{ xs: 4, sm: 5, md: 8 }} alignItems="center">
                {/* Text column */}
                <Grid size={{ xs: 12, md: 5 }} sx={{ order: { xs: 0, md: section.imageOnLeft ? 1 : 0 } }}>
                  <Typography variant="overline" sx={{ color: section.accentColor, fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.65rem", display: "block", mb: 1.5 }}>
                    {section.id.replace(/-/g, " ")}
                  </Typography>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                    <Typography component="h2" variant="h3" fontWeight={800} sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2rem" }, lineHeight: 1.2 }}>
                      {section.sectionTitle}
                    </Typography>
                    {section.beta && <Chip label="Beta" size="small" variant="outlined" sx={{ fontSize: "0.6875rem", height: 22, fontWeight: 600 }} />}
                  </Stack>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, mb: 3 }}>
                    {section.subtitle}
                  </Typography>
                  <Stack spacing={2}>
                    {section.features.map(({ label, detail }) => (
                      <Box key={label} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: section.accentColor, flexShrink: 0, mt: 1 }} />
                        <Box>
                          <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.4 }}>{label}</Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>{detail}</Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </Grid>

                {/* Image column */}
                <Grid size={{ xs: 12, md: 7 }} sx={{ order: { xs: 1, md: section.imageOnLeft ? 0 : 1 } }}>
                  {hasMultipleImages ? (
                    <Stack spacing={2}>
                      {/* Primary large screenshot */}
                      <Screenshot src={section.images[0].src} placeholder={section.images[0].placeholder} icon={section.images[0].Icon} accentColor={section.accentColor} aspectRatio="16 / 10" width={1200} height={750} />
                      {/* Secondary screenshots side by side */}
                      <Grid container spacing={2}>
                        {section.images.slice(1).map((img) => (
                          <Grid key={img.src} size={{ xs: 6 }}>
                            <Screenshot src={img.src} placeholder={img.placeholder} icon={img.Icon} accentColor={section.accentColor} aspectRatio="4 / 3" width={1200} height={900} />
                          </Grid>
                        ))}
                      </Grid>
                    </Stack>
                  ) : (
                    <Screenshot src={section.images[0].src} placeholder={section.images[0].placeholder} icon={section.images[0].Icon} accentColor={section.accentColor} />
                  )}
                </Grid>
              </Grid>
            </Box>
          </Box>
        );
      })}

      {/* ═══════════════ Section 9: Use cases ═══════════════ */}
      <Box
        component="section"
        id="use-cases"
        sx={{
          py: { xs: 7, sm: 10, md: 12 },
          backgroundColor: (theme) => theme.palette.mode === "light" ? "#FFF7ED" : "grey.900",
          ...FULL_BLEED,
        }}
      >
        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography component="h2" variant="h2" fontWeight={800} sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}>
              What people use NewChums for
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              The best plans are simple and specific. Here are some of the ways people are using the platform.
            </Typography>
          </Box>
          <Grid container spacing={{ xs: 2.5, sm: 3 }}>
            {USE_CASES.map(({ Icon, title, description, bannerSrc, bannerPlaceholder, bannerColor }) => (
              <Grid key={title} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box sx={{
                  height: "100%", backgroundColor: "background.paper", borderRadius: 3,
                  overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                  border: "1px solid", borderColor: "divider",
                  transition: "box-shadow 0.2s ease, transform 0.2s ease",
                  "&:hover": { boxShadow: "0 8px 32px rgba(0,0,0,0.08)", transform: "translateY(-3px)" },
                  display: "flex", flexDirection: "column",
                }}>
                  {/* Banner image */}
                  <Box sx={{
                    height: 120, overflow: "hidden", position: "relative",
                    background: imageErrors.has(bannerSrc)
                      ? `linear-gradient(135deg, ${bannerColor}18 0%, ${bannerColor}08 100%)`
                      : undefined,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {!imageErrors.has(bannerSrc) ? (
                      <Image
                        src={bannerSrc}
                        alt={bannerPlaceholder}
                        width={600}
                        height={240}
                        sizes="(max-width: 600px) 100vw, 33vw"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        onError={() => setImageErrors((prev) => new Set(prev).add(bannerSrc))}
                      />
                    ) : (
                      <Stack alignItems="center" spacing={0.5}>
                        <Icon sx={{ fontSize: 32, color: bannerColor, opacity: 0.25 }} />
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.625rem", fontFamily: "monospace", opacity: 0.6 }}>
                          600 x 240px
                        </Typography>
                      </Stack>
                    )}
                  </Box>
                  {/* Card content */}
                  <Box sx={{ p: { xs: 2.5, sm: 3 }, flex: 1 }}>
                    <Typography variant="h6" component="h3" fontWeight={700} sx={{ mb: 0.75, fontSize: "1.0625rem", lineHeight: 1.35 }}>{title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>{description}</Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ═══════════════ Section 10: Why not group chat? ═══════════════ */}
      <Box component="section" id="why-not-group-chat" sx={{ py: { xs: 7, sm: 10, md: 12 } }}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography component="h2" variant="h2" fontWeight={800} sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}>
              Why not just use a group chat?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              Group chats are great for chatting. They&apos;re not great for organizing.
              Plans get buried, nobody replies to the poll, and by the time you pin down the details half the group has moved on.
            </Typography>
          </Box>
          <Stack spacing={0} sx={{ mb: { xs: 4, sm: 5 } }}>
            {COMPARISON_POINTS.map(({ problem, solution }, i) => (
              <Box key={problem} sx={{
                display: "flex", gap: { xs: 2, sm: 3 }, py: { xs: 2.5, sm: 3 },
                borderBottom: i < COMPARISON_POINTS.length - 1 ? "1px solid" : "none", borderColor: "divider",
                flexDirection: { xs: "column", sm: "row" },
              }}>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <CancelRoundedIcon sx={{ fontSize: 18, color: "error.main", mt: 0.25, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ lineHeight: 1.5, color: "text.secondary" }}>{problem}</Typography>
                  </Stack>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main", mt: 0.25, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.5 }}>{solution}</Typography>
                  </Stack>
                </Box>
              </Box>
            ))}
          </Stack>
          <Box sx={{
            p: { xs: 3, sm: 4 }, borderRadius: 3,
            bgcolor: (theme) => theme.palette.mode === "light" ? "#FFF7ED" : "grey.900",
            border: "1px solid", borderColor: (theme) => theme.palette.mode === "light" ? "#FDBA7420" : "divider",
            textAlign: "center",
          }}>
            <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75 }}>
              NewChums isn&apos;t another chat app. It&apos;s the thing that sits between the idea and the gathering,
              and makes sure the gathering actually happens.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ═══════════════ Section 11: Final CTA ═══════════════ */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 8, sm: 12 }, textAlign: "center",
          backgroundColor: (theme) => theme.palette.mode === "light" ? theme.palette.primary.main : "grey.900",
          ...FULL_BLEED, color: "white", position: "relative",
          "&::before": { content: '""', position: "absolute", top: 0, left: 0, right: 0, height: "3px", backgroundColor: (theme) => theme.palette.onPrimary.main },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Typography variant="overline" sx={{ display: "block", mb: 1.5, opacity: 0.65, letterSpacing: 2, fontSize: "0.6875rem", fontWeight: 600 }}>
            Ready to make plans that actually happen?
          </Typography>
          <Typography component="h2" variant="h4" fontWeight={700} sx={{ mb: 2, fontSize: { xs: "1.5rem", sm: "2rem" }, lineHeight: 1.25, color: "inherit" }}>
            Stop patching it together
          </Typography>
          <Typography variant="body1" sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.8, lineHeight: 1.75, maxWidth: 480, mx: "auto" }}>
            One place for the plan, the people, and the follow-through.
          </Typography>
          <Grid container spacing={{ xs: 4, sm: 3 }} justifyContent="center" sx={{ mb: { xs: 6, sm: 8 }, maxWidth: 680, mx: "auto" }}>
            {[
              isLoggedIn ? "Open your profile" : "Sign up in under a minute",
              "Create a plan or browse what's happening nearby",
              "Show up and enjoy",
            ].map((text, i) => (
              <Grid key={text} size={{ xs: 12, sm: 4 }}>
                <Stack alignItems="center" spacing={2}>
                  <Box sx={{
                    width: 48, height: 48, borderRadius: "50%", border: "2px solid", borderColor: "#F7CE16",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#F7CE16", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0,
                  }}>
                    {i + 1}
                  </Box>
                  <Typography variant="body1" fontWeight={500} sx={{ opacity: 0.9, lineHeight: 1.5, maxWidth: 180 }}>{text}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
          <Divider sx={{ borderColor: "rgba(247,206,22,0.7)", mb: { xs: 6, sm: 8 }, maxWidth: 480, mx: "auto" }} />
          <Button
            component={Link}
            href={isLoggedIn ? "/" : "/signup"}
            variant="contained"
            color="onPrimary"
            size="large"
            sx={{
              px: { xs: 5, sm: 6 }, py: 1.75, fontSize: "1.0625rem", fontWeight: 600,
              textTransform: "none", borderRadius: 2.5,
              minWidth: { xs: "100%", sm: 220 }, maxWidth: { xs: "none", sm: 300 },
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              "&:hover": { boxShadow: "0 4px 20px rgba(0,0,0,0.25)" },
            }}
          >
            {isLoggedIn ? "Explore NewChums" : "Try it, it's free"}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
