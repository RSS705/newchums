"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Image from "next/image";
import Link from "next/link";
import SectionHeader from "@/components/ui/SectionHeader";
import type { SvgIconComponent } from "@mui/icons-material";

// Lifecycle icons
import AddCircleOutlineRoundedIcon from "@mui/icons-material/AddCircleOutlineRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";

// Feature section icons
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";

// Use case icons
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import LocalCafeRoundedIcon from "@mui/icons-material/LocalCafeRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import RepeatRoundedIcon from "@mui/icons-material/RepeatRounded";
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
 */

const CONTENT_MAX_WIDTH = 800;
const WIDE_MAX_WIDTH = 1100;
const FULL_BLEED = { mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 } };

// ── Lifecycle stepper (Section 2) ────────────────────────────────────────────

const LIFECYCLE_STEPS: { Icon: SvgIconComponent; label: string; description: string; color: string }[] = [
  { Icon: AddCircleOutlineRoundedIcon, label: "Create", description: "Set the activity, time, location, and your preferences.", color: "#E65B13" },
  { Icon: MailOutlineRoundedIcon, label: "Invite", description: "Share a link, send invites, or let people discover your plan.", color: "#1565c0" },
  { Icon: ScheduleRoundedIcon, label: "Schedule", description: "Collect availability and find the time that works.", color: "#7c3aed" },
  { Icon: EventAvailableRoundedIcon, label: "Confirm", description: "Reminders go out. Attendees confirm they're coming.", color: "#059669" },
  { Icon: GroupsRoundedIcon, label: "Meet", description: "Everyone shows up with the same clear details.", color: "#0e7490" },
  { Icon: StarRoundedIcon, label: "Follow up", description: "Leave feedback and build your attendance reputation.", color: "#E65B13" },
];

// ── "Create and shape" hero feature (Section 3) ─────────────────────────────

const CREATE_FEATURES: { Icon: SvgIconComponent; label: string; detail: string }[] = [
  { Icon: TuneRoundedIcon, label: "Hobbies & interests", detail: "Tag multiple hobbies so the right people can find your plan. Create new hobbies on the fly." },
  { Icon: VisibilityRoundedIcon, label: "Location privacy", detail: "Show exact location to everyone, to confirmed attendees only, or just an approximate area." },
  { Icon: LockRoundedIcon, label: "Visibility controls", detail: "Public (anyone can find it), chums-only (your connections), or invite-only (specific people)." },
  { Icon: PersonAddRoundedIcon, label: "Require approval", detail: "New people request to join and you approve or decline before they're added." },
  { Icon: EventAvailableRoundedIcon, label: "Attendance confirmation", detail: "Enable automatic confirmation requests so you know who's actually coming." },
  { Icon: AccessTimeRoundedIcon, label: "Scheduling flexibility", detail: "Let attendees suggest alternate times, or request everyone's full availability with a deadline." },
];

const CREATE_EXTRA_FEATURES: string[] = [
  "In-person or online plans",
  "Seat limits & reservations",
  "Let attendees invite others",
  "Banner image upload",
  "Community association",
  "Preference overrides per plan",
];

// ── Zig-zag feature sections (Sections 4, 5, 6, 7) ─────────────────────────

type ZigZagSection = {
  id: string;
  sectionTitle: string;
  subtitle: string;
  imageSrc: string;
  placeholder: string;
  Icon: SvgIconComponent;
  accentColor: string;
  imageOnLeft: boolean;
  features: { label: string; detail: string }[];
};

const ZIGZAG_SECTIONS: ZigZagSection[] = [
  {
    id: "inviting",
    sectionTitle: "Invite people and manage attendance",
    subtitle: "Get the right people involved, whether they already have an account or not. Share a link, send a direct invite, or let people find you.",
    imageSrc: "/images/how-it-works/inviting.png",
    placeholder: "Screenshot, Invite and RSVP",
    Icon: LinkRoundedIcon,
    accentColor: "#1565c0",
    imageOnLeft: true,
    features: [
      { label: "Direct invites", detail: "Invite people by NewChums handle or email address. They get a notification and an email." },
      { label: "Share links", detail: "Generate a permanent shareable link for any plan. Send it anywhere, text, email, social media." },
      { label: "Guest RSVP without an account", detail: "Anyone with a link can RSVP using just their email and a quick verification code. No signup required." },
      { label: "Going, Maybe, or Can't Make It", detail: "Three clear RSVP options with optional personal notes. Update anytime before the plan starts." },
      { label: "Join requests", detail: "For plans that require approval, people request to join and the host reviews each request." },
      { label: "Custom invite messages", detail: "Add a personal note when sending invites so people know why you're reaching out." },
    ],
  },
  {
    id: "scheduling",
    sectionTitle: "Scheduling that actually works",
    subtitle: "Stop guessing when people are free. Let attendees suggest times or share their availability, and find the slot that works for the most people.",
    imageSrc: "/images/how-it-works/scheduling.png",
    placeholder: "Screenshot, Availability and scheduling",
    Icon: AccessTimeRoundedIcon,
    accentColor: "#7c3aed",
    imageOnLeft: false,
    features: [
      { label: "Suggest alternate times", detail: "Attendees can propose a different start time with an optional note explaining why it works better." },
      { label: "Request availability", detail: "Switch to availability mode and ask everyone to share their free windows, with an optional deadline." },
      { label: "See what overlaps", detail: "A visual breakdown shows which times work for the most people, so the best option is obvious." },
      { label: "Host picks the time", detail: "Review the suggestions, then promote the best one to become the official plan time with one click." },
    ],
  },
  {
    id: "attendance-assurance",
    sectionTitle: "Know who's actually coming",
    subtitle: "Automatic reminders and confirmation requests mean fewer empty tables and fewer wasted trips. Set your expectations and let the system handle the follow-up.",
    imageSrc: "/images/how-it-works/attendance-assurance.png",
    placeholder: "Screenshot, Attendance confirmation",
    Icon: VerifiedRoundedIcon,
    accentColor: "#059669",
    imageOnLeft: true,
    features: [
      { label: "Confirmation window", detail: "Automatic confirmation requests go out 24 hours before the plan. Attendees confirm or decline with one tap." },
      { label: "Timed reminders", detail: "Follow-up reminders at 12 hours and 3 hours before if someone hasn't responded yet." },
      { label: "Confirm from anywhere", detail: "One-click confirmation from the email reminder or directly on the plan page. No login required for email links." },
      { label: "Minimum attendees", detail: "Set a threshold, if not enough people confirm, fallback policies handle the rest." },
      { label: "Fallback policies", detail: "Choose what happens if the minimum isn't met: proceed anyway, notify the host, or auto-cancel the plan." },
      { label: "Real-time viability", detail: "The plan page shows a live confirmation tally so everyone can see whether it's on track to happen." },
    ],
  },
  {
    id: "plan-chat",
    sectionTitle: "Coordinate in one place",
    subtitle: "Every plan has its own built-in chat. Sort out last-minute details, share updates, or just say hello, without needing a separate group message thread.",
    imageSrc: "/images/how-it-works/plan-chat.png",
    placeholder: "Screenshot, Plan chat",
    Icon: ChatRoundedIcon,
    accentColor: "#0e7490",
    imageOnLeft: false,
    features: [
      { label: "Real-time messaging", detail: "Messages appear instantly for everyone in the plan. No refresh needed." },
      { label: "Unread indicators", detail: "See at a glance which of your plans have new messages you haven't read yet." },
      { label: "Daily catch-up emails", detail: "Missed something? A daily digest email summarizes unread messages so you stay in the loop." },
      { label: "Plan updates & changes", detail: "When the host updates the plan, changes are logged and attendees are notified automatically." },
    ],
  },
];

// ── Grid feature sections (Sections 8, 9) ───────────────────────────────────

type GridSection = {
  id: string;
  sectionTitle: string;
  subtitle: string;
  imageSrc: string;
  placeholder: string;
  Icon: SvgIconComponent;
  accentColor: string;
  features: { Icon: SvgIconComponent; label: string; detail: string }[];
};

const GRID_SECTIONS: GridSection[] = [
  {
    id: "discovery",
    sectionTitle: "Discover plans and communities",
    subtitle: "Find plans that match your interests and location without scrolling through everything. Join communities to see what people near you are organizing.",
    imageSrc: "/images/how-it-works/discovery.png",
    placeholder: "Screenshot, Explore feed",
    Icon: ExploreRoundedIcon,
    accentColor: "#1565c0",
    features: [
      { Icon: ExploreRoundedIcon, label: "Explore feed", detail: "Browse plans filtered by hobby, distance, time range, and sort order. Personalized to your interests." },
      { Icon: VisibilityRoundedIcon, label: "Browse without an account", detail: "Public plans are visible to anyone. No signup required just to see what's happening nearby." },
      { Icon: NotificationsActiveRoundedIcon, label: "Daily match digest", detail: "A daily email surfaces new plans that match your hobbies and travel distance. Delivered automatically." },
      { Icon: GroupsRoundedIcon, label: "Communities", detail: "Create or join public and private groups around shared interests. Community plans appear in a dedicated feed." },
      { Icon: PersonAddRoundedIcon, label: "Community join flows", detail: "Public communities are open to all. Private communities use approval-based join requests." },
      { Icon: TuneRoundedIcon, label: "Smart matching", detail: "Your chum preferences help filter which plans and people show up in your recommendations." },
    ],
  },
  {
    id: "trust",
    sectionTitle: "Trust and accountability",
    subtitle: "A lightweight reputation system that rewards people who show up and follow through, and helps everyone make better decisions about who to plan with.",
    imageSrc: "/images/how-it-works/trust.png",
    placeholder: "Screenshot, Profile and attendance record",
    Icon: ShieldRoundedIcon,
    accentColor: "#E65B13",
    features: [
      { Icon: StarRoundedIcon, label: "Attendance record", detail: "Every profile shows follow-through stats: shows up, confirms attendance, and host follow-through." },
      { Icon: ChatRoundedIcon, label: "Post-plan feedback", detail: "After a plan, leave quick private feedback on reliability, sociability, and hosting quality." },
      { Icon: VerifiedRoundedIcon, label: "Issue reporting", detail: "Flag no-shows, very late arrivals, and late cancellations. Reports are private and affect reliability scores." },
      { Icon: ShieldRoundedIcon, label: "Conduct and safety reporting", detail: "Report safety or conduct concerns directly from any plan. Reports go to the admin team immediately." },
      { Icon: TuneRoundedIcon, label: "Chum preference matching", detail: "Set per-metric thresholds for reliability, sociability, and more. Plans are filtered based on your preferences." },
      { Icon: LockRoundedIcon, label: "Profile privacy controls", detail: "Control what's visible on your public profile, age, chum list, search visibility, and more." },
    ],
  },
];

// ── Use cases (Section 10) ───────────────────────────────────────────────────

const USE_CASES: { Icon: SvgIconComponent; title: string; description: string }[] = [
  { Icon: CasinoRoundedIcon, title: "Board game nights", description: "Set a player cap, pick the game, share a link. No more 'who's in?' messages that nobody replies to." },
  { Icon: LocalCafeRoundedIcon, title: "Coffee walks & casual meetups", description: "Low-key, low-commitment. Post a time and a meeting point and see who shows up." },
  { Icon: MenuBookRoundedIcon, title: "Study groups & coworking", description: "Find people working on the same thing nearby. Use availability mode to pick the best time." },
  { Icon: CelebrationRoundedIcon, title: "Community events", description: "Associate your plan with a community. Members see it in their feed automatically." },
  { Icon: RepeatRoundedIcon, title: "Recurring plans", description: "Weekly run club, monthly potluck, regular crafting circle. Set it up and keep the momentum going." },
  { Icon: HikingRoundedIcon, title: "Outdoor adventures", description: "Hikes, bike rides, park hangs. Approximate location keeps the meeting point flexible until the last minute." },
];

// ── Group chat comparison (Section 11) ───────────────────────────────────────

const COMPARISON_POINTS: { problem: string; solution: string }[] = [
  { problem: "'Who's in?' messages that nobody replies to", solution: "Structured RSVPs, Going, Maybe, or Can't Make It, with optional notes." },
  { problem: "Nobody knows the final time or place", solution: "One source of truth for every detail, always up to date." },
  { problem: "Half the group says maybe and never confirms", solution: "Automatic 24-hour confirmation window with timed reminders." },
  { problem: "You show up and nobody else does", solution: "Minimum attendee thresholds with auto-cancel or host notification." },
  { problem: "Inviting new people means adding them to another chat", solution: "Share a link. Anyone can RSVP, even without an account." },
  { problem: "No memory of who flaked last time", solution: "Attendance records and post-plan feedback visible on every profile." },
];

// ── Shared CTA button ────────────────────────────────────────────────────────

function InlineCTA({ isLoggedIn, variant = "contained" }: { isLoggedIn: boolean; variant?: "contained" | "outlined" }) {
  return (
    <Button
      component={Link}
      href={isLoggedIn ? "/" : "/signup"}
      variant={variant}
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
        boxShadow: variant === "contained" ? "0 2px 12px rgba(230,91,19,0.2)" : "none",
        "&:hover": {
          boxShadow: variant === "contained" ? "0 4px 20px rgba(230,91,19,0.3)" : "none",
        },
      }}
    >
      {isLoggedIn ? "Explore NewChums" : "Get started free"}
    </Button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HowItWorksContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [activeStep, setActiveStep] = useState(0);

  function ScreenshotFrame({ imageSrc, placeholder, icon: Icon, accentColor = "#E65B13", overlap }: {
    imageSrc: string;
    placeholder: string;
    icon: SvgIconComponent;
    accentColor?: string;
    overlap?: boolean;
  }) {
    const hasError = imageErrors.has(imageSrc);
    return (
      <Box
        sx={{
          borderRadius: { xs: 3, md: 4 },
          overflow: "hidden",
          position: "relative",
          ...(hasError && { aspectRatio: "3 / 2" }),
          background: hasError
            ? `linear-gradient(135deg, ${accentColor}08 0%, #f9fafb 100%)`
            : "background.paper",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: (theme) =>
            theme.palette.mode === "light"
              ? "0 16px 48px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)"
              : "0 8px 32px rgba(0,0,0,0.3)",
          border: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "light" ? "rgba(0,0,0,0.06)" : "divider",
          transition: "transform 0.3s ease, box-shadow 0.3s ease",
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: (theme) =>
              theme.palette.mode === "light"
                ? "0 24px 64px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.08)"
                : "0 16px 48px rgba(0,0,0,0.4)",
          },
          ...(overlap && {
            mt: { xs: 0, md: -6 },
            mb: { xs: 0, md: -4 },
            position: { md: "relative" },
            zIndex: 2,
          }),
        }}
      >
        {!hasError ? (
          <Image
            src={imageSrc}
            alt={placeholder}
            width={1200}
            height={800}
            sizes="(max-width: 960px) 100vw, 60vw"
            style={{ width: "100%", height: "auto", display: "block" }}
            onError={() => setImageErrors((prev) => new Set(prev).add(imageSrc))}
          />
        ) : (
          <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.25, py: 6 }}>
            <Icon sx={{ fontSize: 48, color: accentColor }} />
            <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ fontSize: "0.8125rem" }}>
              {placeholder}
            </Typography>
          </Stack>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 }, overflow: "hidden" }}>

      {/* ═══════════════ Section 1: Hero ═══════════════ */}
      <Box component="section" sx={{ py: { xs: 5, sm: 8, md: 10 } }}>
        <Stack alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
          <Typography
            variant="overline"
            sx={{
              color: "primary.main",
              fontWeight: 700,
              letterSpacing: "0.12em",
              fontSize: "0.7rem",
              display: "block",
              mb: 2,
            }}
          >
            How this works
          </Typography>

          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: { xs: "2.5rem", sm: "3.25rem", md: "4rem" }, lineHeight: 1.15, mb: 3 }}
          >
            The best tool for making plans actually happen
          </Typography>

          <Box sx={{ width: 48, height: 3, bgcolor: "secondary.main", borderRadius: 1, mb: { xs: 3.5, sm: 4.5 } }} />

          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.25rem" }, mb: 2 }}
          >
            NewChums handles the entire lifecycle of a plan, from the first idea
            through inviting people, confirming attendance, coordinating details, and following up afterward.
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

      {/* ═══════════════ Section 2: Interactive lifecycle stepper ═══════════════ */}
      <Box
        component="section"
        sx={{
          py: { xs: 6, sm: 10, md: 12 },
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.100" : "grey.900",
          ...FULL_BLEED,
        }}
      >
        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}
            >
              From idea to gathering
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              Most tools cover one piece of the puzzle. NewChums covers the whole thing.
            </Typography>
          </Box>

          {/* Stepper tabs */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              gap: { xs: 0.5, sm: 1 },
              mb: { xs: 4, sm: 5 },
              flexWrap: "wrap",
            }}
          >
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
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: { xs: 1.5, sm: 2.5 },
                    py: { xs: 1, sm: 1.25 },
                    borderRadius: 3,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                    backgroundColor: isActive ? "background.paper" : "transparent",
                    boxShadow: isActive ? "0 4px 16px rgba(0,0,0,0.08)" : "none",
                    border: "1.5px solid",
                    borderColor: isActive ? color : "transparent",
                    "&:hover": {
                      backgroundColor: "background.paper",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                    },
                    userSelect: "none",
                  }}
                >
                  <Box
                    sx={{
                      width: { xs: 28, sm: 36 },
                      height: { xs: 28, sm: 36 },
                      borderRadius: "50%",
                      bgcolor: isActive ? `${color}14` : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    <Icon sx={{ fontSize: { xs: 16, sm: 20 }, color: isActive ? color : "text.secondary" }} />
                  </Box>
                  <Typography
                    variant="body2"
                    fontWeight={isActive ? 700 : 500}
                    sx={{
                      color: isActive ? color : "text.secondary",
                      fontSize: { xs: "0.75rem", sm: "0.875rem" },
                      display: { xs: "none", sm: "block" },
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {/* Active step content */}
          <Box
            sx={{
              backgroundColor: "background.paper",
              borderRadius: 4,
              p: { xs: 3, sm: 4, md: 5 },
              boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
              border: "1px solid",
              borderColor: "divider",
              textAlign: "center",
              maxWidth: 640,
              mx: "auto",
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: `${LIFECYCLE_STEPS[activeStep].color}12`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                mx: "auto",
                mb: 2.5,
              }}
            >
              {(() => { const StepIcon = LIFECYCLE_STEPS[activeStep].Icon; return <StepIcon sx={{ fontSize: 28, color: LIFECYCLE_STEPS[activeStep].color }} />; })()}
            </Box>
            <Typography variant="h5" fontWeight={700} sx={{ mb: 1, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}>
              {activeStep + 1}. {LIFECYCLE_STEPS[activeStep].label}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 440, mx: "auto" }}>
              {LIFECYCLE_STEPS[activeStep].description}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* ═══════════════ Section 3: Create and shape (hero feature, full-width splash) ═══════════════ */}
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
        {/* Warm background gradient */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: (theme) =>
              theme.palette.mode === "light"
                ? "linear-gradient(165deg, #FFF7ED 0%, #FFFFFF 40%, #FFF7ED 100%)"
                : "none",
            zIndex: 0,
          }}
        />

        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto" sx={{ position: "relative", zIndex: 1 }}>
          {/* Header */}
          <Box sx={{ textAlign: "center", mb: { xs: 5, sm: 7 } }}>
            <Typography
              variant="overline"
              sx={{ color: "primary.main", fontWeight: 700, letterSpacing: "0.12em", fontSize: "0.7rem", display: "block", mb: 1.5 }}
            >
              Host controls
            </Typography>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.75rem" }, lineHeight: 1.15, mb: 2 }}
            >
              Create and shape the plan
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 620, mx: "auto" }}>
              Every plan starts with the basics, a title, time, and place. Then customize exactly how it works. Control who can see it, who can join, and how attendance is handled.
            </Typography>
          </Box>

          {/* Screenshot, floated with overlap effect */}
          <Box sx={{ mb: { xs: 4, sm: 6 }, maxWidth: 800, mx: "auto" }}>
            <ScreenshotFrame
              imageSrc="/images/how-it-works/create-plan.png"
              placeholder="Screenshot, Create a plan"
              icon={TuneRoundedIcon}
              accentColor="#E65B13"
              overlap
            />
          </Box>

          {/* Feature grid */}
          <Grid container spacing={{ xs: 2.5, sm: 3 }} sx={{ mb: { xs: 3, sm: 4 } }}>
            {CREATE_FEATURES.map(({ Icon, label, detail }) => (
              <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderRadius: 3,
                    p: { xs: 2.5, sm: 3 },
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    border: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    flexDirection: { xs: "row", sm: "column" },
                    gap: { xs: 1.5, sm: 0 },
                    alignItems: { xs: "flex-start", sm: "flex-start" },
                    transition: "box-shadow 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      mb: { xs: 0, sm: 1.5 },
                    }}
                  >
                    <Icon sx={{ fontSize: 20, color: "primary.main" }} />
                  </Box>
                  <Box>
                    <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.3 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      {detail}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Additional capabilities, compact chips */}
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 1.5 }}>
              Plus:
            </Typography>
            <Stack direction="row" flexWrap="wrap" justifyContent="center" spacing={1} useFlexGap>
              {CREATE_EXTRA_FEATURES.map((f) => (
                <Box
                  key={f}
                  sx={{
                    px: 2,
                    py: 0.75,
                    borderRadius: 2,
                    bgcolor: "background.paper",
                    border: "1px solid",
                    borderColor: "divider",
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    color: "text.secondary",
                  }}
                >
                  {f}
                </Box>
              ))}
            </Stack>
          </Box>
        </Box>
      </Box>

      {/* Mid-page CTA */}
      <Box sx={{ textAlign: "center", py: { xs: 4, sm: 6 } }}>
        <InlineCTA isLoggedIn={isLoggedIn} />
      </Box>

      {/* ═══════════════ Sections 4-7: Zig-zag feature deep-dives ═══════════════ */}
      {ZIGZAG_SECTIONS.map((section, index) => {
        const bgColors = [undefined, "grey.100", undefined, "grey.100"];
        const bg = bgColors[index];
        const needsBleed = !!bg;
        return (
          <Box
            key={section.id}
            component="section"
            id={section.id}
            sx={{
              py: { xs: 7, sm: 10, md: 12 },
              ...(needsBleed && {
                backgroundColor: (theme) =>
                  theme.palette.mode === "light" ? bg : "grey.900",
                ...FULL_BLEED,
              }),
            }}
          >
            <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
              <Grid container spacing={{ xs: 4, sm: 5, md: 8 }} alignItems="center">
                {/* Text column */}
                <Grid
                  size={{ xs: 12, md: 5 }}
                  sx={{ order: { xs: 0, md: section.imageOnLeft ? 1 : 0 } }}
                >
                  <Box sx={{ mb: { xs: 0, md: 0 } }}>
                    <Typography
                      variant="overline"
                      sx={{ color: section.accentColor, fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.65rem", display: "block", mb: 1.5 }}
                    >
                      {section.id.replace(/-/g, " ")}
                    </Typography>
                    <Typography
                      component="h2"
                      variant="h3"
                      fontWeight={800}
                      sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2rem" }, lineHeight: 1.2, mb: 1.5 }}
                    >
                      {section.sectionTitle}
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, mb: 3 }}>
                      {section.subtitle}
                    </Typography>

                    <Stack spacing={2}>
                      {section.features.map(({ label, detail }) => (
                        <Box key={label} sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                          <Box
                            sx={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              bgcolor: section.accentColor,
                              flexShrink: 0,
                              mt: 1,
                            }}
                          />
                          <Box>
                            <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.4 }}>
                              {label}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                              {detail}
                            </Typography>
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Grid>

                {/* Image column */}
                <Grid
                  size={{ xs: 12, md: 7 }}
                  sx={{ order: { xs: 1, md: section.imageOnLeft ? 0 : 1 } }}
                >
                  <ScreenshotFrame
                    imageSrc={section.imageSrc}
                    placeholder={section.placeholder}
                    icon={section.Icon}
                    accentColor={section.accentColor}
                  />
                </Grid>
              </Grid>
            </Box>
          </Box>
        );
      })}

      {/* Mid-page CTA */}
      <Box sx={{ textAlign: "center", py: { xs: 4, sm: 6 } }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2.5, fontWeight: 500 }}>
          Sound useful? It only takes a minute to get started.
        </Typography>
        <InlineCTA isLoggedIn={isLoggedIn} />
      </Box>

      {/* ═══════════════ Sections 8-9: Grid feature sections ═══════════════ */}
      {GRID_SECTIONS.map((section, index) => {
        const bg = index === 0 ? "grey.100" : undefined;
        const needsBleed = !!bg;
        return (
          <Box
            key={section.id}
            component="section"
            id={section.id}
            sx={{
              py: { xs: 7, sm: 10, md: 12 },
              ...(needsBleed && {
                backgroundColor: (theme) =>
                  theme.palette.mode === "light" ? bg : "grey.900",
                ...FULL_BLEED,
              }),
            }}
          >
            <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
              {/* Section header + screenshot side by side on desktop */}
              <Grid container spacing={{ xs: 3, sm: 4, md: 6 }} sx={{ mb: { xs: 4, sm: 5 } }} alignItems="center">
                <Grid size={{ xs: 12, md: 5 }}>
                  <Typography
                    variant="overline"
                    sx={{ color: section.accentColor, fontWeight: 700, letterSpacing: "0.1em", fontSize: "0.65rem", display: "block", mb: 1.5 }}
                  >
                    {section.id}
                  </Typography>
                  <Typography
                    component="h2"
                    variant="h3"
                    fontWeight={800}
                    sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem", md: "2rem" }, lineHeight: 1.2, mb: 1.5 }}
                  >
                    {section.sectionTitle}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    {section.subtitle}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, md: 7 }}>
                  <ScreenshotFrame
                    imageSrc={section.imageSrc}
                    placeholder={section.placeholder}
                    icon={section.Icon}
                    accentColor={section.accentColor}
                  />
                </Grid>
              </Grid>

              {/* 3-column feature grid */}
              <Grid container spacing={{ xs: 2, sm: 2.5 }}>
                {section.features.map(({ Icon, label, detail }) => (
                  <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Box
                      sx={{
                        height: "100%",
                        p: { xs: 2.5, sm: 3 },
                        borderRadius: 3,
                        backgroundColor: needsBleed ? "background.paper" : (theme) =>
                          theme.palette.mode === "light" ? "grey.50" : "grey.900",
                        border: "1px solid",
                        borderColor: "divider",
                        transition: "box-shadow 0.2s ease, transform 0.2s ease",
                        "&:hover": {
                          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                          transform: "translateY(-2px)",
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          bgcolor: `${section.accentColor}10`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          mb: 1.5,
                        }}
                      >
                        <Icon sx={{ fontSize: 18, color: section.accentColor }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.3 }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, fontSize: "0.8125rem" }}>
                        {detail}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Box>
        );
      })}

      {/* ═══════════════ Section 10: Use cases ═══════════════ */}
      <Box
        component="section"
        id="use-cases"
        sx={{
          py: { xs: 7, sm: 10, md: 12 },
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "#FFF7ED" : "grey.900",
          ...FULL_BLEED,
        }}
      >
        <Box maxWidth={WIDE_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}
            >
              What people use NewChums for
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              The best plans are simple and specific. Here are some of the ways people are using the platform.
            </Typography>
          </Box>

          <Grid container spacing={{ xs: 2.5, sm: 3 }}>
            {USE_CASES.map(({ Icon, title, description }, i) => (
              <Grid key={title} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderRadius: 3,
                    p: { xs: 3, sm: 3.5 },
                    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
                    border: "1px solid",
                    borderColor: "divider",
                    transition: "box-shadow 0.2s ease, transform 0.2s ease",
                    "&:hover": {
                      boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
                      transform: "translateY(-3px)",
                    },
                  }}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      bgcolor: i % 2 === 0 ? "primary.light" : "#FFF7ED",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      mb: 2,
                    }}
                  >
                    <Icon sx={{ fontSize: 22, color: "primary.main" }} />
                  </Box>
                  <Typography variant="h6" component="h3" fontWeight={700} sx={{ mb: 0.75, fontSize: "1.0625rem", lineHeight: 1.35 }}>
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    {description}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ═══════════════ Section 11: Why not group chat? ═══════════════ */}
      <Box component="section" id="why-not-group-chat" sx={{ py: { xs: 7, sm: 10, md: 12 } }}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Box sx={{ textAlign: "center", mb: { xs: 4, sm: 6 } }}>
            <Typography
              component="h2"
              variant="h2"
              fontWeight={800}
              sx={{ fontSize: { xs: "1.75rem", sm: "2.25rem", md: "2.5rem" }, lineHeight: 1.15, mb: 2 }}
            >
              Why not just use a group chat?
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, maxWidth: 560, mx: "auto" }}>
              Group chats are great for chatting. They&apos;re not great for organizing.
              Plans get buried, nobody replies to the poll, and by the time you pin down the details
              half the group has moved on.
            </Typography>
          </Box>

          <Stack spacing={0} sx={{ mb: { xs: 4, sm: 5 } }}>
            {COMPARISON_POINTS.map(({ problem, solution }, i) => (
              <Box
                key={problem}
                sx={{
                  display: "flex",
                  gap: { xs: 2, sm: 3 },
                  py: { xs: 2.5, sm: 3 },
                  borderBottom: i < COMPARISON_POINTS.length - 1 ? "1px solid" : "none",
                  borderColor: "divider",
                  flexDirection: { xs: "column", sm: "row" },
                }}
              >
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <CancelRoundedIcon sx={{ fontSize: 18, color: "error.main", mt: 0.25, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ lineHeight: 1.5, color: "text.secondary" }}>
                      {problem}
                    </Typography>
                  </Stack>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main", mt: 0.25, flexShrink: 0 }} />
                    <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.5 }}>
                      {solution}
                    </Typography>
                  </Stack>
                </Box>
              </Box>
            ))}
          </Stack>

          <Box
            sx={{
              p: { xs: 3, sm: 4 },
              borderRadius: 3,
              bgcolor: (theme) =>
                theme.palette.mode === "light" ? "#FFF7ED" : "grey.900",
              border: "1px solid",
              borderColor: (theme) =>
                theme.palette.mode === "light" ? "#FDBA7420" : "divider",
              textAlign: "center",
            }}
          >
            <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75, mb: 2.5 }}>
              NewChums isn&apos;t another chat app. It&apos;s the thing that sits between the idea and the gathering,
              and makes sure the gathering actually happens.
            </Typography>
            <InlineCTA isLoggedIn={isLoggedIn} />
          </Box>
        </Box>
      </Box>

      {/* ═══════════════ Section 12: Final CTA ═══════════════ */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 8, sm: 12 },
          textAlign: "center",
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? theme.palette.primary.main : "grey.900",
          ...FULL_BLEED,
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
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Typography
            variant="overline"
            sx={{ display: "block", mb: 1.5, opacity: 0.65, letterSpacing: 2, fontSize: "0.6875rem", fontWeight: 600 }}
          >
            Ready to make plans that actually happen?
          </Typography>

          <Typography
            component="h2"
            variant="h4"
            fontWeight={700}
            sx={{ mb: 2, fontSize: { xs: "1.5rem", sm: "2rem" }, lineHeight: 1.25, color: "inherit" }}
          >
            Stop patching it together
          </Typography>

          <Typography
            variant="body1"
            sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.8, lineHeight: 1.75, maxWidth: 480, mx: "auto" }}
          >
            One place for the plan, the people, and the follow-through.
          </Typography>

          <Grid
            container
            spacing={{ xs: 4, sm: 3 }}
            justifyContent="center"
            sx={{ mb: { xs: 6, sm: 8 }, maxWidth: 680, mx: "auto" }}
          >
            {[
              isLoggedIn ? "Open your profile" : "Sign up in under a minute",
              "Create a plan or browse what's happening nearby",
              "Show up and enjoy",
            ].map((text, i) => (
              <Grid key={text} size={{ xs: 12, sm: 4 }}>
                <Stack alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      border: "2px solid",
                      borderColor: "#F7CE16",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#F7CE16",
                      fontWeight: 700,
                      fontSize: "1.1rem",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography variant="body1" fontWeight={500} sx={{ opacity: 0.9, lineHeight: 1.5, maxWidth: 180 }}>
                    {text}
                  </Typography>
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
              px: { xs: 5, sm: 6 },
              py: 1.75,
              fontSize: "1.0625rem",
              fontWeight: 600,
              textTransform: "none",
              borderRadius: 2.5,
              minWidth: { xs: "100%", sm: 220 },
              maxWidth: { xs: "none", sm: 300 },
              boxShadow: "0 2px 12px rgba(0,0,0,0.15)",
              "&:hover": { boxShadow: "0 4px 20px rgba(0,0,0,0.25)" },
            }}
          >
            {isLoggedIn ? "Explore NewChums" : "Get started"}
          </Button>
        </Box>
      </Box>

    </Box>
  );
}
