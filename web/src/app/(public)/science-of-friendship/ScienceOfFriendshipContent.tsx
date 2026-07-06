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

export default function ScienceOfFriendshipContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [hoveredItem, setHoveredItem] = useState<FriendshipEngineHover>(null);

  return (
    <Box sx={{ pt: { xs: 6, sm: 8, md: 10 }, pb: { xs: 4, sm: 6 } }}>
      {/* Section 1, Hero */}
      <Box component="section" sx={{ ...SECTION_SPACING, mb: { xs: 2, sm: 4 } }}>
        <Stack alignItems="center" textAlign="center" maxWidth={CONTENT_MAX_WIDTH} mx="auto" px={{ xs: 1, sm: 0 }}>
          {/* Eyebrow */}
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
            What the research tells us
          </Typography>

          {/* Heading */}
          <Typography
            component="h1"
            variant="h1"
            fontWeight={800}
            sx={{ fontSize: { xs: "2.25rem", sm: "3rem", md: "4rem" }, lineHeight: 1.2, mb: 3 }}
          >
            The Science of Friendship
          </Typography>

          {/* Gold accent bar */}
          <Box
            sx={{
              width: 48,
              height: 3,
              bgcolor: "primary.main",
              borderRadius: 1,
              mb: { xs: 3.5, sm: 4.5 },
            }}
          />

          {/* Intro text */}
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.25rem" }, mb: 2.5 }}
          >
            Friendship isn&apos;t just luck. It&apos;s a set of conditions that help people
            connect, conditions that modern life quietly makes harder.
          </Typography>
          <Typography
            variant="h5"
            fontWeight={400}
            color="text.primary"
            sx={{ lineHeight: 1.7, fontSize: { xs: "1.0625rem", sm: "1.25rem" } }}
          >
            The same conditions also help communities show up consistently. NewChums was built around a simple idea: if we recreate those conditions, both individual friendships and the local communities they grow inside become much more likely.
          </Typography>
        </Stack>

        <Box
          sx={{
            mt: { xs: 5, sm: 7 },
            mx: "auto",
            maxWidth: CONTENT_MAX_WIDTH,
            borderRadius: 2,
            overflow: "hidden",
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
          }}
        >
          <Image
            src="/images/science-of-friendship/Pottery.jpg"
            alt="Two adults enjoying a pottery class together"
            fill
            style={{ objectFit: "cover" }}
            sizes="(max-width: 600px) 100vw, 860px"
          />
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
            <Box
              sx={{
                pl: { xs: 0, sm: 3 },
                pt: { xs: 2.5, sm: 0.5 },
                pb: { xs: 0.5, sm: 0.5 },
                borderLeft: { xs: "none", sm: "3px solid #E65B13" },
                borderTop: { xs: "2px solid #E65B13", sm: "none" },
                textAlign: { xs: "center", sm: "left" },
              }}
            >
              <Typography
                variant="body1"
                fontWeight={700}
                sx={{ lineHeight: 1.75, fontSize: "1.0625rem" }}
              >
                It&apos;s not that people stopped wanting friendship.
                <br />
                It&apos;s that the structure that created it quietly vanished.
              </Typography>
            </Box>
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
              pl: { xs: 0, sm: 3 },
              pt: { xs: 2.5, sm: 0.5 },
              pb: { xs: 0.5, sm: 0.5 },
              borderLeft: { xs: "none", sm: "3px solid #E65B13" },
              borderTop: { xs: "2px solid #E65B13", sm: "none" },
              textAlign: { xs: "center", sm: "left" },
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
              Zajonc, R. (1968). Attitudinal effects of mere exposure. Altman &amp; Taylor (1973). Social
              penetration theory.
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Normalize the Pace, Timeline Visualization */}
      <TimelineVisualization />

      {/* Section 4, Why Harder / Why Matters: two-column card layout */}
      <Box
        component="section"
        id="why-friendship-hard"
        sx={{
          ...SECTION_SPACING,
          backgroundColor: (theme) => theme.palette.mode === "light" ? "grey.50" : "grey.900",
          mx: { xs: -2, sm: -3 },
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto">
          <Grid container spacing={{ xs: 3, sm: 4 }}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Box
                sx={{
                  height: "100%",
                  backgroundColor: "background.paper",
                  borderTop: "3px solid",
                  borderColor: "primary.main",
                  borderRadius: 2,
                  p: { xs: 3, sm: 4 },
                  boxShadow: (theme) =>
                    theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
                }}
              >
                <SectionHeader title="Why friendship feels harder in adulthood" emphasis="primary" accentColor="secondary" />
                <Stack divider={<Divider />} spacing={0}>
                  {[
                    "Busy schedules leave less room for the repeated, spontaneous interactions where friendships usually begin.",
                    "Work demands and relocation often disrupt existing social circles.",
                    "Many modern routines are isolated, we move between home, work, and errands without naturally seeing the same people.",
                    "Many social experiences today are one-off events instead of recurring spaces where relationships can grow.",
                  ].map((text) => (
                    <Box key={text} sx={{ py: 1.75, textAlign: { xs: "center", sm: "left" } }}>
                      <Typography variant="body1" sx={{ lineHeight: 1.75 }}>{text}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                  Putnam, R. (2000). Bowling Alone.
                </Typography>
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }} id="why-friendship-matters">
              <Box
                sx={{
                  height: "100%",
                  backgroundColor: "background.paper",
                  borderTop: "3px solid",
                  borderColor: "primary.main",
                  borderRadius: 2,
                  p: { xs: 3, sm: 4 },
                  boxShadow: (theme) =>
                    theme.palette.mode === "light" ? "0 1px 6px rgba(0,0,0,0.07)" : "none",
                }}
              >
                <SectionHeader title="Why this matters more than we realize" emphasis="primary" accentColor="secondary" />
                <Stack divider={<Divider />} spacing={0}>
                  {[
                    "Strong friendships are one of the biggest predictors of life satisfaction and happiness.",
                    "Reliable social support helps buffer the effects of daily stress.",
                    "Feeling socially connected strengthens emotional resilience and mental health.",
                  ].map((text) => (
                    <Box key={text} sx={{ py: 1.75, textAlign: { xs: "center", sm: "left" } }}>
                      <Typography variant="body1" sx={{ lineHeight: 1.75 }}>{text}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
                  Demir &amp; Davidson (2013). Friendship and happiness. Cohen &amp; Wills (1985). Stress buffering hypothesis.
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Box>
      </Box>

      {/* Section 5, Rebuilding the Conditions: three columns */}
      <Box component="section" id="how-newchums-helps" sx={SECTION_SPACING}>
        <Box maxWidth={CONTENT_MAX_WIDTH} mx="auto" sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <SectionHeader title="Rebuilding the conditions for friendship" emphasis="primary" accentColor="secondary" />
          <Typography variant="body1" sx={{ mb: 4, lineHeight: 1.75 }}>
            NewChums isn&apos;t a dating app or a networking site. It&apos;s a platform designed to
            recreate the simple conditions where friendships naturally grow.
          </Typography>

          <Grid container spacing={{ xs: 4, sm: 5, md: 6 }} sx={{ mb: { xs: 4, sm: 6 } }}>
            {[
              {
                num: "01",
                title: "Hobbies create shared context",
                paragraphs: [
                  "When people meet around something they genuinely enjoy, conversation happens naturally.",
                  'Instead of "meeting for the sake of meeting," people are already doing something together.',
                ],
              },
              {
                num: "02",
                title: "Local events create proximity",
                paragraphs: [
                  "Friendships grow when people see each other regularly.",
                  "Local events make it easier to show up often without the barrier of long travel or complicated plans.",
                ],
              },
              {
                num: "03",
                title: "Low-pressure meetups",
                paragraphs: [
                  "Good friendships develop gradually.",
                  "Our format encourages relaxed, low-pressure gatherings where conversations can deepen naturally over time.",
                ],
              },
            ].map(({ num, title, paragraphs }, index) => (
              <Grid
                key={num}
                size={{ xs: 12, sm: 6, md: 4 }}
                offset={{ xs: 0, sm: index === 2 ? 3 : 0, md: 0 }}
              >
                <Stack spacing={1.5}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: "50%",
                      bgcolor: "secondary.main",
                      color: "#F7CE16",
                      fontWeight: 800,
                      fontSize: "0.8rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      alignSelf: { xs: "center", sm: "flex-start" },
                      flexShrink: 0,
                    }}
                  >
                    {num}
                  </Box>
                  <Typography
                    variant="h5"
                    component="h3"
                    fontWeight={700}
                    color="text.primary"
                    sx={{ fontSize: { xs: "1.1rem", md: "1.2rem" }, textAlign: { xs: "center", sm: "left" } }}
                  >
                    {title}
                  </Typography>
                  {paragraphs.map((text, i) => (
                    <Typography
                      key={i}
                      variant="body1"
                      color="text.secondary"
                      sx={{ lineHeight: 1.7, textAlign: { xs: "center", sm: "left" } }}
                    >
                      {text}
                    </Typography>
                  ))}
                </Stack>
              </Grid>
            ))}
          </Grid>

          <Box
            sx={{
              borderRadius: 2,
              overflow: "hidden",
              position: "relative",
              width: "100%",
              aspectRatio: "16 / 9",
            }}
          >
            <Image
              src="/images/science-of-friendship/Majong.jpg"
              alt="A group of adults enjoying a mahjong game together"
              fill
              style={{ objectFit: "cover", objectPosition: "right center" }}
              sizes="(max-width: 600px) 100vw, 860px"
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
        <Box maxWidth={900} mx="auto">
          <SectionHeader
            title="Friendship doesn't happen by accident anymore"
            emphasis="primary"
            accentColor="secondary"
          />
          <Stack spacing={{ xs: 3, sm: 4 }} sx={{ maxWidth: 720, mx: { xs: "auto", sm: 0 } }}>

            {/* Opening narrative */}
            <Stack spacing={2} sx={{ textAlign: { xs: "center", sm: "left" } }}>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                For most of human history, friendships formed automatically. You saw the same people
                in the same places every day.
              </Typography>

              {/* "School. Neighborhoods." callout, visible on mobile too */}
              <Box
                sx={{
                  pl: { xs: 0, sm: 3 },
                  pt: { xs: 2.5, sm: 0.5 },
                  pb: { xs: 0.5, sm: 0.5 },
                  borderLeft: { xs: "none", sm: "2px solid #E65B13" },
                  borderTop: { xs: "2px solid #E65B13", sm: "none" },
                  textAlign: { xs: "center", sm: "left" },
                }}
              >
                <Typography
                  variant="body1"
                  sx={{ lineHeight: 1.75, color: "text.secondary", fontStyle: "italic" }}
                >
                  School. Neighborhoods. Shared routines.
                </Typography>
              </Box>

              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                Modern life quietly removed many of those structures. But the desire for connection
                never went away.
              </Typography>
            </Stack>

            {/* "The good news is..." callout */}
            <Box
              sx={{
                pl: { xs: 0, sm: 3 },
                pt: { xs: 2.5, sm: 0.5 },
                pb: { xs: 0.5, sm: 0.5 },
                borderLeft: { xs: "none", sm: "3px solid #E65B13" },
                borderTop: { xs: "2px solid #E65B13", sm: "none" },
                textAlign: { xs: "center", sm: "left" },
              }}
            >
              <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75 }}>
                The good news is that the ingredients for friendship haven&apos;t changed.
              </Typography>
            </Box>

            {/* "People still connect when they:" + Divider list */}
            <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
              <Typography variant="body1" sx={{ lineHeight: 1.75, mb: 2 }}>
                People still connect when they:
              </Typography>
              <Stack
                divider={<Divider />}
                spacing={0}
                sx={{ maxWidth: { xs: 360, sm: "none" }, mx: { xs: "auto", sm: 0 } }}
              >
                {[
                  "See each other regularly",
                  "Share meaningful activities",
                  "Have space for conversations to grow naturally",
                ].map((text) => (
                  <Box key={text} sx={{ py: 1.5, textAlign: { xs: "center", sm: "left" } }}>
                    <Typography variant="body1" sx={{ lineHeight: 1.75 }}>{text}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>

            {/* Closing, bridge to CTA */}
            <Stack spacing={2} sx={{ pt: 1, textAlign: { xs: "center", sm: "left" } }}>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                NewChums simply helps recreate those conditions.
              </Typography>
              <Typography variant="body1" sx={{ lineHeight: 1.75 }}>
                You choose what you enjoy. We help you discover when people nearby are doing it.
              </Typography>
              <Typography variant="body1" fontWeight={600} sx={{ lineHeight: 1.75 }}>
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
            Getting started takes less than a minute
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
            Start meeting people who enjoy the same things you do
          </Typography>

          {/* Subtext */}
          <Typography
            variant="body1"
            sx={{ mb: { xs: 6, sm: 8 }, opacity: 0.8, lineHeight: 1.75, maxWidth: 460, mx: "auto" }}
          >
            Friendship doesn&apos;t have to be left to chance.
          </Typography>

          {/* Steps */}
          <Grid
            container
            spacing={{ xs: 4, sm: 3 }}
            justifyContent="center"
            sx={{ mb: { xs: 6, sm: 8 }, maxWidth: 680, mx: "auto" }}
          >
            {[
              isLoggedIn ? "Open your profile" : "Sign up",
              "Add a few hobbies you enjoy",
              "Get notified when people nearby plan gatherings",
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

          <Divider sx={{ borderColor: "rgba(247,206,22,0.7)", mb: { xs: 6, sm: 8 }, maxWidth: 480, mx: "auto" }} />

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
              maxWidth: { xs: "none", sm: 280 },
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
