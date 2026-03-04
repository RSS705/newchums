"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import SectionHeader from "@/components/ui/SectionHeader";
import FriendshipEngineDiagram from "@/components/marketing/FriendshipEngineDiagram";
import FriendshipEngineCards from "@/components/marketing/FriendshipEngineCards";
import TimelineVisualization from "@/components/marketing/TimelineVisualization";

/**
 * Marketing page content. Layout provides Container, this component uses maxWidth
 * via a wrapping Box for consistent horizontal bounds with other marketing pages.
 */
const SECTION_SPACING = { py: { xs: 8, sm: 10 } }; // ~80px
const CONTENT_MAX_WIDTH = 800;

export type FriendshipEngineHover = "proximity" | "repetition" | "disclosure" | null;

export default function ScienceOfFriendshipContent() {
  const [hoveredItem, setHoveredItem] = useState<FriendshipEngineHover>(null);

  return (
    <Box sx={{ pt: 10, pb: { xs: 4, sm: 6 } }}>
      {/* Section 1, Hero: centered layout */}
      <Box component="section" sx={{ ...SECTION_SPACING, mb: { xs: 4, sm: 6 } }}>
        <Stack spacing={3} alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: { xs: "2rem", sm: "2.5rem", md: "2.75rem" }, lineHeight: 1.2 }}
          >
            The Science of Friendship
          </Typography>
          <Typography variant="h5" fontWeight={400} color="text.secondary" sx={{ lineHeight: 1.65 }}>
            Friendship isn&apos;t just luck. It&apos;s a set of conditions that help people connect,
            conditions that modern life quietly makes harder.
          </Typography>
          <Typography variant="body1" sx={{ lineHeight: 1.7 }}>
            NewChums was built around a simple idea: If we recreate those conditions, friendship
            becomes much more likely.
          </Typography>
        </Stack>
        <Box
          sx={{
            mt: 6,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: CONTENT_MAX_WIDTH,
              minHeight: { xs: 220, md: 280 },
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "primary.light",
              boxShadow: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* IMAGE PLACEHOLDER
            Description: two adults meeting at a small hobby meetup table
            Purpose: show welcoming, casual social environment
            */}
            <Box sx={{ width: "100%", height: "100%", opacity: 0.4 }} />
          </Box>
        </Box>
      </Box>

      {/* Section 2, Story: centered narrow readable block */}
      <Box
        component="section"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="A quiet problem many adults recognize" emphasis="primary" accentColor="secondary" />
          <Stack spacing={2}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              You move to a new city. Or your work gets busy. Or your old routines change.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Suddenly the people you used to see all the time… disappear from your weekly life.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              You still have acquaintances. You still see people online. But the easy rhythm of
              friendship, running into the same people, talking without effort, building familiarity,
              slowly fades.
            </Typography>
            <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75 }}>
              It&apos;s not that people stopped wanting friendship. It&apos;s that the structure that
              created it quietly vanished.
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            component="p"
            color="text.secondary"
            sx={{ mt: 3, fontStyle: "italic", lineHeight: 1.6 }}
          >
            Research on modern social life shows many adults report shrinking social circles and
            fewer close friendships compared with previous generations. Survey Center on American Life (2021). The State of American Friendship.
          </Typography>
        </Box>
      </Box>

      {/* Section 3, The Friendship Engine */}
      <Box component="section" id="friendship-engine" sx={SECTION_SPACING}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="The Friendship Engine" emphasis="primary" accentColor="secondary" />
          <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
            Researchers studying relationships have noticed that most friendships grow from the same
            three ingredients. When these conditions exist, connection becomes much easier.
          </Typography>

          <FriendshipEngineDiagram
            hoveredItem={hoveredItem}
            onHoverChange={setHoveredItem}
          />
          <FriendshipEngineCards
            hoveredItem={hoveredItem}
            onHoverChange={setHoveredItem}
          />

          <Typography variant="body1" color="text.secondary" sx={{ mt: 4, mb: 2, lineHeight: 1.7 }}>
            In school these conditions happen automatically. In adult life, we often have to create
            them intentionally.
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            Zajonc, R. (1968). Attitudinal effects of mere exposure. Altman & Taylor (1973). Social
            penetration theory.
          </Typography>
        </Box>
      </Box>

      {/* Normalize the Pace, Timeline Visualization */}
      <TimelineVisualization />

      {/* Section 4, Why Harder / Why Matters: two-column layout */}
      <Box
        component="section"
        id="why-friendship-hard"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Grid container spacing={6}>
            <Grid size={{ xs: 12, md: 6 }}>
              <SectionHeader title="Why friendship feels harder in adulthood" emphasis="primary" accentColor="secondary" />
              <Stack spacing={1.5}>
                {["Busy schedules reduce repeated interaction", "Work and relocation disrupt social circles", "Remote work weakens casual social contact", "Many social spaces are temporary instead of recurring"].map((text) => (
                  <Stack key={text} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0 }} />
                    <Typography variant="body1" sx={{ lineHeight: 1.7 }}>{text}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="body1" sx={{ mt: 2, lineHeight: 1.7 }}>
                None of these changes mean people value friendship less. They simply mean the natural
                environments that used to create it are less common.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Putnam, R. (2000). Bowling Alone.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} id="why-friendship-matters">
              <SectionHeader title="Why this matters more than we realize" emphasis="primary" accentColor="secondary" />
              <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.7 }}>
                Friendship isn&apos;t only about companionship. Reliable social connections help
                people manage stress, navigate life challenges, and experience greater life satisfaction.
              </Typography>
              <Stack spacing={1.5}>
                {["Friendship increases overall life satisfaction", "Social support helps buffer stress", "Feeling socially connected strengthens resilience"].map((text) => (
                  <Stack key={text} direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0 }} />
                    <Typography variant="body1" sx={{ lineHeight: 1.7 }}>{text}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                Demir & Davidson (2013). Friendship and happiness. Cohen & Wills (1985). Stress buffering hypothesis.
              </Typography>
            </Grid>
          </Grid>
        </Box>
      </Box>

      {/* Section 5, Rebuilding the Conditions: lighter typography, three columns */}
      <Box component="section" id="how-newchums-helps" sx={SECTION_SPACING}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <SectionHeader title="Rebuilding the conditions for friendship" emphasis="primary" accentColor="secondary" />
          <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.7 }}>
            NewChums was designed around the simple mechanics that help friendships form.
          </Typography>

          <Grid container spacing={4} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom color="primary.main">
                Hobbies create shared context
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                It&apos;s easier to talk when people are doing something they already enjoy.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom color="primary.main">
                Local events create proximity
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                Meet people nearby who enjoy the same things. Seeing the same faces builds familiarity.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom color="primary.main">
                Low-pressure meetups
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                Friendship grows gradually through repeated interaction, not forced networking.
              </Typography>
            </Grid>
          </Grid>

          <Typography variant="body1" fontWeight={500} sx={{ lineHeight: 1.7 }}>
            Instead of hoping friendship happens by chance, NewChums helps create the conditions
            where it can grow.
          </Typography>

          <Box sx={{ mt: 6, display: "flex", justifyContent: "center" }}>
            {/* IMAGE PLACEHOLDER
            Description: diverse group at casual hobby meetup (games, crafts, sports, etc.)
            Purpose: illustrate NewChums-style gatherings
            */}
            <Box
              sx={{
                width: "100%",
                maxWidth: CONTENT_MAX_WIDTH,
                height: 200,
                borderRadius: 2,
                bgcolor: "primary.light",
                opacity: 0.5,
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* Section 7, CTA */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 8, sm: 10 },
          textAlign: "center",
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.100" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Typography
            component="h2"
            variant="h5"
            fontWeight={700}
            sx={{ mb: 2 }}
          >
            Start meeting people who enjoy the same things you do
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 4, lineHeight: 1.7 }}
          >
            Friendship doesn&apos;t have to be left to chance. Find people nearby who share your
            interests, and start showing up to the same spaces together.
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            justifyContent="center"
            flexWrap="wrap"
          >
            <Button
              component={Link}
              href="/events"
              variant="contained"
              color="primary"
              size="large"
              sx={{ px: 3, py: 1.5, textTransform: "capitalize" }}
            >
              Explore Events
            </Button>
            <Button
              component={Link}
              href="/events/create"
              variant="outlined"
              color="primary"
              size="large"
              sx={{ px: 3, py: 1.5, textTransform: "capitalize" }}
            >
              Create an Event
            </Button>
            <Button
              component={Link}
              href="/signup"
              variant="outlined"
              color="primary"
              size="large"
              sx={{ px: 3, py: 1.5, textTransform: "capitalize" }}
            >
              Sign Up
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
