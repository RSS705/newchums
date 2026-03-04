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
const SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } };
const CONTENT_MAX_WIDTH = 800;

export type FriendshipEngineHover = "proximity" | "repetition" | "disclosure" | null;

export default function ScienceOfFriendshipContent() {
  const [hoveredItem, setHoveredItem] = useState<FriendshipEngineHover>(null);

  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 } }}>
      {/* Section 1, Hero: centered layout */}
      <Box component="section" sx={{ ...SECTION_SPACING, mb: { xs: 4, sm: 6 } }}>
        <Stack spacing={{ xs: 2, sm: 3 }} alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: { xs: "2rem", sm: "2.5rem", md: "2.75rem" }, lineHeight: 1.2 }}
          >
            The Science of Friendship
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.65, fontSize: { xs: "1.0625rem", sm: "1.25rem" } }}
          >
            Friendship isn&apos;t just luck.
            <br />
            <br />
            It&apos;s a set of conditions that help people connect,
            conditions that modern life quietly makes harder.
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.65, fontSize: { xs: "1.0625rem", sm: "1.25rem" } }}
          >
            NewChums was built around a simple idea: If we recreate those conditions, friendship
            becomes much more likely.
          </Typography>
        </Stack>
        <Box
          sx={{
            mt: { xs: 4, sm: 6 },
            display: "flex",
            justifyContent: "center",
            px: { xs: 1, sm: 0 },
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: CONTENT_MAX_WIDTH,
              minHeight: { xs: 180, sm: 220, md: 280 },
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
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader title="A quiet problem many adults recognize" emphasis="primary" accentColor="secondary" />
          <Stack spacing={2}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              You move to a new city. Or your work gets busy. Or your old routines change.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Suddenly the people you used to see all the time… disappear from your weekly life.
              You still have acquaintances. You still see people online.
            </Typography>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              But the easy rhythm of friendship, running into the same people, talking without
              effort, building familiarity, slowly fades.
            </Typography>
            <Typography
              variant="body1"
              fontWeight={700}
              sx={{ lineHeight: 1.75, fontSize: "1.0625rem" }}
            >
              It&apos;s not that people stopped wanting friendship.
              <br />
              It&apos;s that the structure that created it quietly vanished.
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
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 2, sm: 0 }}>
          <SectionHeader title="The Friendship Engine" emphasis="primary" accentColor="secondary" />
          <Typography
            variant="body1"
            sx={{ mb: 2, lineHeight: 1.75, textAlign: { xs: "center", sm: "left" } }}
          >
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

          <Box
            sx={{
              mt: { xs: 3, sm: 4 },
              px: { xs: 2, sm: 2.5 },
              py: { xs: 1.5, sm: 2 },
              borderRadius: 1.5,
              bgcolor: (theme) =>
                theme.palette.mode === "light" ? "grey.100" : "grey.800",
              border: "1px solid",
              borderColor: (theme) =>
                theme.palette.mode === "light" ? "grey.200" : "grey.700",
            }}
          >
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              In school these conditions happen automatically. In adult life, we often have to create
              them intentionally.
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 1 }}
            >
              Zajonc, R. (1968). Attitudinal effects of mere exposure. Altman & Taylor (1973). Social
              penetration theory.
            </Typography>
          </Box>
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
          <Grid container spacing={{ xs: 4, md: 6 }}>
            <Grid size={{ xs: 12, md: 6 }} sx={{ textAlign: { xs: "center", sm: "left" } }}>
              <SectionHeader title="Why friendship feels harder in adulthood" emphasis="primary" accentColor="secondary" />
              <Stack spacing={1.5}>
                {[
                  "Busy schedules leave less room for the repeated, spontaneous interactions where friendships usually begin.",
                  "Work demands and relocation often disrupt existing social circles.",
                  "Many modern routines are isolated, we move between home, work, and errands without naturally seeing the same people.",
                  "Many social experiences today are one-off events instead of recurring spaces where relationships can grow.",
                ].map((text) => (
                  <Stack key={text} direction="row" spacing={1.5} alignItems="center" justifyContent={{ xs: "center", sm: "flex-start" }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0, display: { xs: "none", sm: "block" } }} />
                    <Typography variant="body1" sx={{ lineHeight: 1.75 }}>{text}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Putnam, R. (2000). Bowling Alone.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }} id="why-friendship-matters" sx={{ textAlign: { xs: "center", sm: "left" } }}>
              <SectionHeader title="Why this matters more than we realize" emphasis="primary" accentColor="secondary" />
              <Stack spacing={1.5}>
                {[
                  "Strong friendships are one of the biggest predictors of life satisfaction and happiness.",
                  "Reliable social support helps buffer the effects of daily stress.",
                  "Feeling socially connected strengthens emotional resilience and mental health.",
                ].map((text) => (
                  <Stack key={text} direction="row" spacing={1.5} alignItems="center" justifyContent={{ xs: "center", sm: "flex-start" }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "secondary.main", flexShrink: 0, display: { xs: "none", sm: "block" } }} />
                    <Typography variant="body1" sx={{ lineHeight: 1.75 }}>{text}</Typography>
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

      {/* Section 5, Rebuilding the Conditions: three columns */}
      <Box component="section" id="how-newchums-helps" sx={SECTION_SPACING}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 2, sm: 0 }} sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader title="Rebuilding the conditions for friendship" emphasis="primary" accentColor="secondary" />
          <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.75 }}>
            NewChums isn&apos;t a dating app or a networking site. It&apos;s a platform designed to
            recreate the simple conditions where friendships naturally grow.
          </Typography>

          <Grid container spacing={{ xs: 3, sm: 4, md: 6 }} sx={{ mb: { xs: 3, sm: 4 } }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                variant="h5"
                component="h3"
                fontWeight={700}
                color="text.primary"
                sx={{ mb: 2, fontSize: { xs: "1.15rem", md: "1.25rem" } }}
              >
                Hobbies create shared context
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1 }}>
                When people meet around something they genuinely enjoy, conversation happens naturally.
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                Instead of &quot;meeting for the sake of meeting,&quot; people are already doing
                something together.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                variant="h5"
                component="h3"
                fontWeight={700}
                color="text.primary"
                sx={{ mb: 2, fontSize: { xs: "1.15rem", md: "1.25rem" } }}
              >
                Local events create proximity
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1 }}>
                Friendships grow when people see each other regularly.
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                Local events make it easier to show up often without the barrier of long travel or
                complicated plans.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                variant="h5"
                component="h3"
                fontWeight={700}
                color="text.primary"
                sx={{ mb: 2, fontSize: { xs: "1.15rem", md: "1.25rem" } }}
              >
                Low-pressure meetups
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1 }}>
                Good friendships develop gradually.
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                Our format encourages relaxed, low-pressure gatherings where conversations can deepen
                naturally over time.
              </Typography>
            </Grid>
          </Grid>

          <Box sx={{ mt: { xs: 4, sm: 6 }, display: "flex", justifyContent: "center" }}>
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

      {/* Section 6, Persuasion: bridge to CTA */}
      <Box
        component="section"
        id="friendship-by-design"
        sx={{
          ...SECTION_SPACING,
          borderTop: "1px solid",
          borderColor: (theme) =>
            theme.palette.mode === "light" ? "grey.200" : "grey.800",
          backgroundColor: (theme) =>
            theme.palette.mode === "light" ? "grey.50" : "grey.900",
        }}
      >
        <Box maxWidth={900} mx="auto" px={{ xs: 2, sm: 3 }}>
          <SectionHeader
            title="Friendship doesn&apos;t happen by accident anymore"
            emphasis="primary"
            accentColor="secondary"
          />
          <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ maxWidth: 720, mx: { xs: "auto", sm: 0 } }}>
            <Stack spacing={2} sx={{ textAlign: { xs: "center", sm: "left" } }}>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                For most of human history, friendships formed automatically. You saw the same people
                in the same places every day.
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  lineHeight: 1.75,
                  color: "text.secondary",
                  fontStyle: "italic",
                  borderLeft: { xs: "none", sm: "2px solid" },
                  borderColor: "secondary.main",
                  pl: { xs: 0, sm: 2 },
                  textAlign: { xs: "center", sm: "left" },
                }}
              >
                School. Neighborhoods. Shared routines.
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                Modern life quietly removed many of those structures. But the desire for connection
                never went away.
              </Typography>
            </Stack>

            <Box sx={{ pt: 1 }}>
              <Typography
                variant="body1"
                fontWeight={600}
                sx={{ lineHeight: 1.75, mb: 1.5, textAlign: { xs: "center", sm: "left" } }}
              >
                The good news is that the ingredients for friendship haven&apos;t changed.
              </Typography>
              <Typography
                variant="body1"
                sx={{ lineHeight: 1.75, mb: 2, textAlign: { xs: "center", sm: "left" } }}
              >
                People still connect when they:
              </Typography>
              <Box sx={{ textAlign: "left", maxWidth: { xs: 360, sm: "none" }, mx: { xs: "auto", sm: 0 } }}>
                <Stack spacing={1.5}>
                  {[
                    "See each other regularly",
                    "Share meaningful activities",
                    "Have space for conversations to grow naturally",
                  ].map((text) => (
                    <Stack key={text} direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: "secondary.main",
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                        {text}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Box>

            <Stack spacing={2} sx={{ pt: 1, textAlign: { xs: "center", sm: "left" } }}>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                NewChums simply helps recreate those conditions.
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                You choose what you enjoy. We help you discover when people nearby are doing it.
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                From there, friendship can take care of the rest.
              </Typography>
            </Stack>
          </Stack>
        </Box>
      </Box>

      {/* Section 7, CTA */}
      <Box
        component="section"
        id="cta"
        sx={{
          py: { xs: 6, sm: 10 },
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
            sx={{ mb: 3, fontSize: { xs: "1.2rem", sm: "1.5rem" } }}
          >
            Start meeting people who enjoy the same things you do
          </Typography>

          <Stack spacing={{ xs: 2, sm: 3 }} alignItems="center" sx={{ mb: { xs: 4, sm: 5 } }}>
            <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
              Friendship doesn&apos;t have to be left to chance.
            </Typography>

            <Box sx={{ width: "100%", maxWidth: 400 }}>
              <Typography
                variant="body1"
                fontWeight={600}
                sx={{ lineHeight: 1.75, mb: 2, textAlign: { xs: "center", sm: "left" } }}
              >
                Getting started takes less than a minute:
              </Typography>
              <Box
                sx={{
                  px: 2.5,
                  py: 2,
                  borderRadius: 1.5,
                  bgcolor: (theme) =>
                    theme.palette.mode === "light" ? "background.paper" : "grey.800",
                  border: "1px solid",
                  borderColor: (theme) =>
                    theme.palette.mode === "light" ? "grey.200" : "grey.700",
                  textAlign: "left",
                  maxWidth: { xs: 360, sm: "none" },
                  mx: { xs: "auto", sm: 0 },
                }}
              >
                <Stack spacing={1.5} alignItems="flex-start">
                  {[
                    "Sign up",
                    "Add a few hobbies you enjoy",
                    "Get notified when people nearby plan events",
                  ].map((text) => (
                    <Stack key={text} direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          bgcolor: "secondary.main",
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                        {text}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
            </Box>
          </Stack>

          <Box sx={{ display: "flex", justifyContent: "center", width: { xs: "100%", sm: "auto" } }}>
            <Button
              component={Link}
              href="/signup"
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              sx={{
                px: 3,
                py: 1.5,
                textTransform: "capitalize",
                maxWidth: { xs: "none", sm: 200 },
              }}
            >
              Get Started
            </Button>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
