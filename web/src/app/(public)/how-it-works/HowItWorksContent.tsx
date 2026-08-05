"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import type { SvgIconComponent } from "@mui/icons-material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import HeroPlanCard from "@/components/landing/HeroPlanCard";
import { createEventHref } from "@/config/nav";

/**
 * How it Works: the host's journey, told in four chapters, in the rebuilt
 * homepage's language (Aug 2026 host-first repositioning).
 *
 * The previous version ran ~900 lines with a dozen product screenshots that
 * aged with every release. Like the homepage, this page now shows the
 * product through live UI (the same hero plan card, linking to the
 * interactive sample plan) and otherwise trusts short text. No screenshots,
 * no illustration; the sample plans are the demo.
 */

const SAMPLE_PLAN_HREF = "/sample-plan/00000000-0000-4000-8000-000000000001";

type Chapter = {
  icon: SvgIconComponent;
  step: string;
  title: string;
  paragraphs: string[];
};

const CHAPTERS: Chapter[] = [
  {
    icon: CalendarMonthRoundedIcon,
    step: "Step 1",
    title: "Post the plan",
    paragraphs: [
      "A plan needs a title, a time, and a place. That takes about a minute, and everything else is optional with a sensible default: a description, a banner, seat limits, approval before joining, and how flexible you want to be about the start time.",
      "Not sure the time works for everyone? Let people suggest alternatives, or collect availability first and pick the slot that fits.",
    ],
  },
  {
    icon: CampaignRoundedIcon,
    step: "Step 2",
    title: "Share one link",
    paragraphs: [
      "Every plan lives at a single link. Drop it in the family thread, the group chat, an email, wherever your people already are. Anyone who opens it sees the details and can RSVP in seconds, with no app to download and no account needed to respond.",
      "You choose who can find the plan beyond your link: public, chums only, or invite only. And for in-person plans, you decide who sees the exact address versus just the general area.",
    ],
  },
  {
    icon: HowToRegRoundedIcon,
    step: "Step 3",
    title: "See who is in",
    paragraphs: [
      "RSVPs collect on the plan page, one list, always current. Want a light vetting step? Turn on approval and confirm each request. Each plan also gets its own chat, so coordination lives with the plan instead of scattering across threads.",
    ],
  },
  {
    icon: EventAvailableRoundedIcon,
    step: "Step 4",
    title: "The day before, everyone confirms",
    paragraphs: [
      "About 24 hours before the start, everyone marked Going is asked to confirm they are still coming, and the plan page updates as they answer. You see a real headcount, not a hopeful one, and if the numbers fall short you will know while there is still time to adjust, or let the plan cancel itself below a minimum you set.",
    ],
  },
];

const EXTRAS = [
  {
    icon: VisibilityRoundedIcon,
    title: "Privacy by default",
    body: "Exact addresses can be held back until someone joins, and every plan controls its own audience.",
  },
  {
    icon: ChatRoundedIcon,
    title: "A chat per plan",
    body: "Only the people on the plan see it, and it quiets down on its own a few days after the plan happens.",
  },
  {
    icon: TuneRoundedIcon,
    title: "Host controls that stay out of the way",
    body: "Approval, seat limits, attendee invites, reminders: every switch has a safe default, so a simple plan stays simple.",
  },
  {
    icon: ShieldRoundedIcon,
    title: "Safety, seriously",
    body: "Blocking works product-wide, reports get reviewed by a person, and the Safety Center explains it all in plain language.",
  },
];

const BTN_HOVER = {
  transition: "all 0.2s ease",
  "&:active": { transform: "scale(0.98)" },
};

export default function HowItWorksContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <Box sx={{ pt: { xs: 4, sm: 6 }, pb: { xs: 4, sm: 6 } }}>
      {/* ── Hero ── */}
      <Box component="section" sx={{ pb: { xs: 6, sm: 8 } }}>
        <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center">
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2.5}>
              <Typography
                sx={{
                  color: "primary.dark",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                }}
              >
                How it works
              </Typography>
              <Typography component="h1" variant="h1" sx={{ mt: "0 !important" }}>
                From &ldquo;we should do this&rdquo; to people at the door.
              </Typography>
              <Typography
                variant="h5"
                component="p"
                fontWeight={400}
                sx={{ color: "grey.800", lineHeight: 1.7, fontSize: "1.15rem" }}
              >
                Four steps, and the first one takes about a minute. Or skip the
                reading, the card on the right is a live sample plan.
              </Typography>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <HeroPlanCard />
          </Grid>
        </Grid>
      </Box>

      {/* ── The four chapters ── */}
      <Box
        component="section"
        id="the-steps"
        sx={{
          py: { xs: 5, sm: 7 },
          px: { xs: 2.5, sm: 4 },
          mx: { xs: -2, sm: -3 },
          borderRadius: { xs: 4, sm: 6 },
          bgcolor: "#fff7ed",
        }}
      >
        <Stack spacing={{ xs: 4, sm: 5 }} sx={{ maxWidth: 780, mx: "auto" }}>
          {CHAPTERS.map((ch) => (
            <Stack key={ch.title} direction="row" spacing={{ xs: 2, sm: 2.5 }} alignItems="flex-start">
              <Box
                sx={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  boxShadow: "0 4px 14px rgba(230,91,19,0.22)",
                }}
              >
                <ch.icon sx={{ fontSize: 23 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="overline"
                  sx={{ color: "primary.dark", fontWeight: 700, letterSpacing: 1, lineHeight: 1.6 }}
                >
                  {ch.step}
                </Typography>
                <Typography
                  component="h2"
                  variant="h5"
                  fontWeight={700}
                  sx={{ fontSize: { xs: "1.2rem", sm: "1.35rem" }, mb: 1 }}
                >
                  {ch.title}
                </Typography>
                <Stack spacing={1.25}>
                  {ch.paragraphs.map((p) => (
                    <Typography key={p.slice(0, 24)} variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                      {p}
                    </Typography>
                  ))}
                </Stack>
              </Box>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* ── What your guests see ── */}
      <Box component="section" id="for-guests" sx={{ py: { xs: 6, sm: 8 }, textAlign: "center" }}>
        <Typography
          component="h2"
          variant="h2"
          sx={{ mb: 1.5, fontSize: { xs: "1.6rem", sm: "1.875rem" } }}
        >
          What your guests see
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 560, mx: "auto", lineHeight: 1.75, mb: 3 }}
        >
          A clean page with the what, when, where, and who, and two taps to
          answer. That is the whole experience for them, which is exactly why
          it works. See it for yourself:
        </Typography>
        <Button
          component={Link}
          href={SAMPLE_PLAN_HREF}
          variant="outlined"
          color="primary"
          size="large"
          sx={{
            px: 4,
            py: 1.5,
            fontWeight: 600,
            borderRadius: 2.5,
            textTransform: "none",
            fontSize: "1.0625rem",
            ...BTN_HOVER,
          }}
        >
          Open a sample plan
        </Button>
      </Box>

      <Divider sx={{ maxWidth: 480, mx: "auto" }} />

      {/* ── The quiet extras ── */}
      <Box component="section" id="extras" sx={{ py: { xs: 6, sm: 8 } }}>
        <Typography
          component="h2"
          variant="h2"
          textAlign="center"
          sx={{ mb: { xs: 4, sm: 5 }, fontSize: { xs: "1.6rem", sm: "1.875rem" } }}
        >
          And the parts you will appreciate later
        </Typography>
        <Grid container spacing={{ xs: 2.5, sm: 3 }} sx={{ maxWidth: 1060, mx: "auto" }}>
          {EXTRAS.map((item) => (
            <Grid key={item.title} size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  p: { xs: 2.5, sm: 3 },
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: "grey.200",
                  bgcolor: "background.paper",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                }}
              >
                <Stack direction="row" spacing={1.75} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      bgcolor: "primary.light",
                      color: "primary.dark",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <item.icon sx={{ fontSize: 21 }} />
                  </Box>
                  <Box>
                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
                      {item.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      {item.body}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Closing CTA, same band as the homepage ── */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 7, sm: 10 },
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
        }}
      >
        <Box maxWidth={720} mx="auto">
          <Typography
            component="h2"
            variant="h4"
            fontWeight={700}
            sx={{ mb: 2, fontSize: { xs: "1.5rem", sm: "2rem" }, lineHeight: 1.25, color: "inherit" }}
          >
            Your next plan could be live in a minute.
          </Typography>
          <Typography
            variant="body1"
            sx={{ mb: { xs: 4, sm: 5 }, opacity: 0.85, lineHeight: 1.75, maxWidth: 520, mx: "auto" }}
          >
            Post the plan. Share the link. See who is in.
          </Typography>
          <Button
            component={Link}
            href={isLoggedIn ? createEventHref : "/signup"}
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
