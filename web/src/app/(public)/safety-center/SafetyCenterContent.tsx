"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import SectionHeader from "@/components/ui/SectionHeader";
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import LocationOnRoundedIcon from "@mui/icons-material/LocationOnRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";

/**
 * Marketing page content. Layout provides Container, this component uses maxWidth
 * via a wrapping Box for consistent horizontal bounds with other marketing pages.
 */
const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };
const CONTENT_MAX_WIDTH = 800;

const CONFIDENCE_ITEMS = [
  {
    Icon: LocationOnRoundedIcon,
    label: "Meet in public places",
    description: "Familiar, busy spots make first meetups easy and comfortable.",
  },
  {
    Icon: PeopleRoundedIcon,
    label: "Let someone know your plans",
    description: "A quick message to a friend or family member keeps everyone at ease.",
  },
  {
    Icon: FavoriteRoundedIcon,
    label: "Respect boundaries",
    description: "Good gatherings start with people feeling welcome and comfortable.",
  },
  {
    Icon: LightbulbRoundedIcon,
    label: "Trust your instincts",
    description: "If something feels off, it is okay to leave or change plans.",
  },
  {
    Icon: ChatRoundedIcon,
    label: "Keep communication clear",
    description: "Clear plans and honest check-ins make gatherings more enjoyable for everyone.",
  },
];

const GATHERING_TIPS = [
  {
    num: "01",
    title: "Choose familiar, public spots",
    paragraphs: [
      "A coffee shop, community centre, or local park is a great backdrop for a first gathering.",
      "Public settings are comfortable for everyone and make it easy to show up with confidence.",
    ],
  },
  {
    num: "02",
    title: "Keep the plan clear and easy to follow",
    paragraphs: [
      "Share the time, location, and a rough idea of what people can expect.",
      "When people know what to anticipate, they are far more likely to show up relaxed and ready to enjoy themselves.",
    ],
  },
  {
    num: "03",
    title: "Start small and low-pressure",
    paragraphs: [
      "You don\u2019t need a big event to build a connection.",
      "A short, casual meetup around something you already enjoy is often the best first step.",
    ],
  },
  {
    num: "04",
    title: "Arrive prepared",
    paragraphs: [
      "Charge your phone before you head out and make sure you have a way to get home.",
      "Small practical steps like these let you focus on the gathering instead of logistics.",
    ],
  },
  {
    num: "05",
    title: "If you're hosting, set clear expectations",
    paragraphs: [
      "A brief description of the activity, where to meet, and how long it typically runs helps guests feel prepared.",
      "Good gatherings are easier when the plan is easy to follow from the start.",
    ],
  },
  {
    num: "06",
    title: "Give people an easy way to reach you",
    paragraphs: [
      "Keep communication open through the platform before the event.",
      "If plans change, a quick heads-up goes a long way.",
    ],
  },
];

const RESPECT_CARDS = [
  {
    accentColor: "secondary.main" as const,
    title: "Respect people\u2019s time",
    text: "If something comes up, let the organiser or other attendees know as early as possible. Reliable show-ups and honest cancellations both matter.",
  },
  {
    accentColor: "primary.main" as const,
    title: "Honour comfort levels",
    text: "Not everyone moves at the same pace socially. Follow someone\u2019s lead and avoid applying pressure to extend plans beyond what was agreed.",
  },
  {
    accentColor: "primary.main" as const,
    title: "Communicate if plans change",
    text: "A quick message if you are running late or need to cancel is a small effort that makes a big difference to how gatherings feel.",
  },
  {
    accentColor: "secondary.main" as const,
    title: "Kindness sets the tone",
    text: "Being considerate, patient, and genuinely interested in others makes gatherings better for everyone. It\u2019s what keeps people coming back.",
  },
];

export default function SafetyCenterContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 } }}>

      {/* ── Section 1: Hero ── */}
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
            Community guidance
          </Typography>

          {/* Heading */}
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: "4rem", lineHeight: 1.2, mb: 3 }}
          >
            Simple habits for better, safer gatherings
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
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.25rem" }, mb: 2.5 }}
          >
            NewChums is built around shared interests and comfortable, low-pressure gatherings.
            A few simple habits make every meetup more enjoyable, for you and everyone else.
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.secondary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.125rem" }, mb: { xs: 4, sm: 5 } }}
          >
            This page gathers practical guidance to help you organise and attend gatherings with confidence.
          </Typography>

          {/* CTAs */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            sx={{ width: "100%", maxWidth: 400 }}
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
              href="#gathering-tips"
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
              Read the tips
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
            <PeopleRoundedIcon sx={{ fontSize: 56, color: "primary.main" }} />
            <Typography variant="body2" color="text.secondary" fontWeight={500}>
              Image placeholder, a welcoming outdoor gathering
            </Typography>
          </Stack>
        </Box>
      </Box>

      {/* ── Section 2: Quick confidence checklist ── */}
      <Box
        component="section"
        id="safety-habits"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="Five habits that make gatherings easier" emphasis="primary" accentColor="secondary" />
          <Typography
            variant="body1"
            sx={{ mb: { xs: 4, sm: 5 }, lineHeight: 1.75, textAlign: { xs: "center", sm: "left" } }}
          >
            These are small, practical habits, nothing complicated. Keeping them in mind helps every
            gathering feel smooth and comfortable from the start.
          </Typography>

          <Grid container spacing={{ xs: 2.5, sm: 3 }}>
            {CONFIDENCE_ITEMS.map(({ Icon, label, description }) => (
              <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                <Box
                  sx={{
                    height: "100%",
                    backgroundColor: "background.paper",
                    borderRadius: 2,
                    p: { xs: 2.5, sm: 3 },
                    boxShadow: (theme) =>
                      theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
                    display: "flex",
                    flexDirection: { xs: "row", sm: "column" },
                    alignItems: { xs: "flex-start", sm: "flex-start" },
                    gap: { xs: 2, sm: 1.5 },
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
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 20, color: "primary.main" }} />
                  </Box>
                  <Box>
                    <Typography variant="body1" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.4 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                      {description}
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Section 3: Practical gathering tips ── */}
      <Box
        component="section"
        id="gathering-tips"
        sx={SECTION_SPACING}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader title="Practical tips for attendees and hosts" emphasis="primary" accentColor="secondary" />
          <Typography variant="body1" sx={{ mb: { xs: 4, sm: 5 }, lineHeight: 1.75 }}>
            Whether you are joining your first event or organising one, a little preparation goes a long way.
            These are simple things that help gatherings run smoothly and feel welcoming.
          </Typography>

          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {GATHERING_TIPS.map(({ num, title, paragraphs }) => (
              <Grid key={num} size={{ xs: 12, sm: 6 }}>
                <Stack spacing={1.5} direction="row" alignItems="flex-start">
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      bgcolor: "secondary.main",
                      color: (theme) => theme.palette.primary.dark,
                      fontWeight: 800,
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      mt: 0.25,
                    }}
                  >
                    {num}
                  </Box>
                  <Stack spacing={0.75}>
                    <Typography
                      variant="h6"
                      component="h3"
                      fontWeight={700}
                      sx={{ fontSize: { xs: "1rem", sm: "1.0625rem" }, lineHeight: 1.35, textAlign: "left" }}
                    >
                      {title}
                    </Typography>
                    {paragraphs.map((text, i) => (
                      <Typography
                        key={i}
                        variant="body2"
                        color="text.secondary"
                        sx={{ lineHeight: 1.7, textAlign: "left" }}
                      >
                        {text}
                      </Typography>
                    ))}
                  </Stack>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Section 4: Respect and comfort ── */}
      <Box
        component="section"
        id="respect-and-comfort"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.50" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="Respect and comfort in every gathering" emphasis="primary" accentColor="secondary" />
          <Typography
            variant="body1"
            sx={{ mb: { xs: 4, sm: 5 }, lineHeight: 1.75, textAlign: { xs: "center", sm: "left" } }}
          >
            Good communities are built on consideration. The people who make gatherings great are the ones
            who are thoughtful, patient, and genuinely interested in others.
          </Typography>

          <Grid container spacing={{ xs: 3, sm: 4 }}>
            {RESPECT_CARDS.map(({ accentColor, title, text }) => (
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
                      theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
                  }}
                >
                  <Typography
                    variant="h6"
                    component="h3"
                    fontWeight={700}
                    sx={{ mb: 1.25, fontSize: { xs: "1rem", sm: "1.0625rem" }, lineHeight: 1.35 }}
                  >
                    {title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                    {text}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>
      </Box>

      {/* ── Section 5: If something feels off ── */}
      <Box component="section" id="trust-your-instincts" sx={SECTION_SPACING}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="If something feels off" emphasis="primary" accentColor="secondary" />

          <Stack spacing={2.5} sx={{ textAlign: { xs: "center", sm: "left" }, mb: { xs: 3, sm: 4 } }}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Your comfort matters. You are never obligated to stay somewhere that does not feel right,
              and you do not owe anyone your time or attention.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              If a gathering starts to feel uncomfortable, trust that feeling. It is always okay to step away,
              shorten your plans, or simply not go.
            </Typography>
          </Stack>

          {/* Callout block */}
          <Box
            sx={{
              pl: { xs: 0, sm: 3 },
              pt: { xs: 3, sm: 1 },
              pb: { xs: 0.5, sm: 1 },
              borderLeft: { xs: "none", sm: "3px solid" },
              borderTop: { xs: "2px solid", sm: "none" },
              borderColor: "secondary.main",
              textAlign: { xs: "center", sm: "left" },
              mb: { xs: 3, sm: 4 },
            }}
          >
            <Stack spacing={1.25}>
              {[
                "You can leave at any time.",
                "You do not need to explain yourself.",
                "Prioritising your comfort is always the right call.",
              ].map((line) => (
                <Typography key={line} variant="body1" fontWeight={600} sx={{ lineHeight: 1.7 }}>
                  {line}
                </Typography>
              ))}
            </Stack>
          </Box>

          <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75, textAlign: { xs: "center", sm: "left" } }}>
            If you experience something concerning from another member, you can let us know. We take
            community conduct seriously and handle concerns respectfully.
          </Typography>
        </Box>
      </Box>

      {/* ── Section 6: Reporting ── */}
      <Box
        component="section"
        id="report-a-concern"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "center", sm: "center" },
              justifyContent: "space-between",
              gap: { xs: 3, sm: 4 },
              textAlign: { xs: "center", sm: "left" },
            }}
          >
            <Stack spacing={1.5} sx={{ flex: 1, maxWidth: { sm: 560 } }}>
              <Typography
                variant="h5"
                component="h2"
                fontWeight={700}
                sx={{ fontSize: { xs: "1.2rem", sm: "1.35rem" }, lineHeight: 1.3 }}
              >
                Need to report a concern?
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                If something happened that you think we should know about, please reach out.
                We will handle your message with care and respond as soon as we can.
              </Typography>
            </Stack>
            <Box sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              <Button
                component={Link}
                href="/contact"
                variant="outlined"
                color="primary"
                size="large"
                sx={{
                  px: { xs: 4, sm: 4 },
                  py: 1.5,
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  textTransform: "none",
                  width: { xs: "100%", sm: "auto" },
                  minWidth: { sm: 180 },
                }}
              >
                Contact us
              </Button>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Section 7: CTA ── */}
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
            Better gatherings start here
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
            Plan around things you already enjoy
          </Typography>

          {/* Subtext */}
          <Typography
            variant="body1"
            sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.8, lineHeight: 1.75, maxWidth: 480, mx: "auto" }}
          >
            Great gatherings come from shared interests and clear plans.
            NewChums makes both easy.
          </Typography>

          {/* Steps */}
          <Grid
            container
            spacing={{ xs: 4, sm: 3 }}
            justifyContent="center"
            sx={{ mb: { xs: 6, sm: 8 }, maxWidth: 680, mx: "auto" }}
          >
            {[
              isLoggedIn ? "Open your profile" : "Sign up in under a minute",
              "Add the hobbies you enjoy",
              "Discover local gatherings around your interests",
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

          <Divider sx={{ borderColor: "rgba(255,255,255,0.12)", mb: { xs: 6, sm: 8 }, maxWidth: 480, mx: "auto" }} />

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
