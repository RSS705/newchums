"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EmojiPeopleRoundedIcon from "@mui/icons-material/EmojiPeopleRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import HeroPlanCard from "@/components/landing/HeroPlanCard";
import PublicExploreFeed from "@/components/landing/PublicExploreFeed";
import RecentlyHappenedSection from "@/components/events/RecentlyHappenedSection";
import { trackEvent } from "@/lib/analytics";
import { createEventHref } from "@/config/nav";

/**
 * Public homepage for logged-out visitors (logged-in users see hero CTAs
 * swapped, nothing else differs).
 *
 * Rebuilt Aug 2026 for the host-first repositioning ahead of the paid ad
 * test. Principles, agreed with Rob:
 *
 *   - The product demonstrates itself. Every product visual is live UI
 *     (the hero is a real mini plan card linking to an interactive sample
 *     plan; the plans section renders real cards), never a screenshot and
 *     never illustration. Screenshots go stale; the AI artwork read as a
 *     hobby-store toy and is gone.
 *   - Short. The old page ran ~965 visible words across 8 sections; this
 *     one targets ~350 across 5. One idea per section, one CTA per
 *     section (AGENTS.md marketing rules).
 *   - Audience breadth lives in the copy and the plan cards (family
 *     potlucks and MTG cube nights are both just cards), not in the
 *     photography. The one photo slot wants warmth, not category.
 *   - Warm wash tints instead of flat colour slabs; orange stays an
 *     accent, not a paint bucket.
 *
 * The photo band renders `/images/home/home-gathering.jpg` when the file
 * exists and falls back to a designed warm panel until then, so the page
 * ships complete before the photo arrives and picks it up with no code
 * change.
 */

// ── Reveal-on-scroll ───────────────────────────────────────────────────────

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
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, visible };
}

const REVEAL_SX = (visible: boolean, delay = 0) => ({
  opacity: visible ? 1 : 0,
  transform: visible ? "translateY(0)" : "translateY(24px)",
  transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
});

const BTN_HOVER = {
  transition: "all 0.2s ease",
  "&:active": { transform: "scale(0.98)" },
};

// ── Copy data ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: CalendarMonthRoundedIcon,
    title: "Post the plan",
    body: "Title, time, place. About a minute, start to finish.",
  },
  {
    icon: CampaignRoundedIcon,
    title: "Share one link",
    body: "Drop it wherever your group already talks. Nobody needs an account to see it or RSVP.",
  },
  {
    icon: HowToRegRoundedIcon,
    title: "See who is in",
    body: "RSVPs land on the plan page, not scattered through a chat thread.",
  },
];

const OUTCOMES = [
  {
    icon: EventAvailableRoundedIcon,
    title: "Everyone confirms the day before",
    body: "About 24 hours out, everyone marked Going is asked to confirm they are still coming. You get a solid headcount, not a hopeful one.",
  },
  {
    icon: LinkRoundedIcon,
    title: "One link, one source of truth",
    body: "The time, the place, updates, and RSVPs stay on one page. Nobody scrolls back through a thread to find the address.",
  },
  {
    icon: EmojiPeopleRoundedIcon,
    title: "Easy for your guests",
    body: "They open your link, see the details, and RSVP in seconds. No app to download, no new group chat to join.",
  },
];

export default function LandingPageContent({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const heroReveal = useReveal(0.05);
  const stepsReveal = useReveal();
  const outcomesReveal = useReveal();
  const photoReveal = useReveal();
  const ctaReveal = useReveal(0.2);

  // Photo band: renders the real photo the moment the file exists on disk,
  // warm designed panel until then.
  const [photoMissing, setPhotoMissing] = useState(false);

  return (
    <Box sx={{ pt: { xs: 4, sm: 6, md: 8 }, pb: { xs: 4, sm: 6 } }}>
      {/* ── 1. Hero ── */}
      <Box
        component="section"
        ref={heroReveal.ref}
        sx={{
          pb: { xs: 6, sm: 8, md: 10 },
          position: "relative",
          ...REVEAL_SX(heroReveal.visible),
          // Soft warm ambience behind the hero; purely decorative.
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(ellipse 60% 55% at 78% 42%, rgba(252,236,195,0.45) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 8% 8%, rgba(230,91,19,0.05) 0%, transparent 70%)",
          },
        }}
      >
        <Grid container spacing={{ xs: 5, md: 8 }} alignItems="center" sx={{ position: "relative" }}>
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
                sx={{ color: "grey.800", lineHeight: 1.7, fontSize: "1.2rem" }}
              >
                Post the plan,{" "}
                <Box component="span" sx={{ fontWeight: 700 }}>
                  share one link,
                </Box>{" "}
                and see who is really coming. No &ldquo;who&rsquo;s in??&rdquo; thread, no
                chasing RSVPs.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 0.5 }}>
                {isLoggedIn ? (
                  <>
                    <Button
                      component={Link}
                      href={createEventHref}
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

              {/* Quiet reassurance row. Every claim is true today: no
                  billing exists, the product is a web app, and public plans
                  are viewable without an account. */}
              {!isLoggedIn && (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ pt: 0.5 }}>
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
                        <CheckRoundedIcon sx={{ fontSize: 14, color: "success.dark" }} />
                        <Typography
                          sx={{ fontSize: "0.8rem", fontWeight: 600, color: "success.dark" }}
                        >
                          {claim}
                        </Typography>
                      </Stack>
                    ),
                  )}
                </Stack>
              )}
            </Stack>
          </Grid>

          {/* Right: the product, not a picture of it */}
          <Grid size={{ xs: 12, md: 6 }}>
            <HeroPlanCard />
          </Grid>
        </Grid>
      </Box>

      {/* ── 2. Three steps ── */}
      <Box
        component="section"
        id="how-it-works"
        ref={stepsReveal.ref}
        sx={{
          py: { xs: 5, sm: 7 },
          px: { xs: 2.5, sm: 4 },
          mx: { xs: -2, sm: -3 },
          borderRadius: { xs: 4, sm: 6 },
          bgcolor: "#fff7ed",
          ...REVEAL_SX(stepsReveal.visible),
        }}
      >
        <Typography
          component="h2"
          variant="h2"
          textAlign="center"
          sx={{ mb: { xs: 4, sm: 5 }, fontSize: { xs: "1.6rem", sm: "1.875rem" } }}
        >
          How it works
        </Typography>
        <Grid container spacing={{ xs: 3, sm: 4 }} sx={{ maxWidth: 1000, mx: "auto" }}>
          {STEPS.map((step, i) => (
            <Grid key={step.title} size={{ xs: 12, sm: 4 }}>
              <Stack spacing={1.25} alignItems={{ xs: "flex-start", sm: "center" }}>
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
                    boxShadow: "0 4px 14px rgba(230,91,19,0.22)",
                  }}
                >
                  <step.icon sx={{ fontSize: 23 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
                  {i + 1}. {step.title}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.65, textAlign: { xs: "left", sm: "center" }, maxWidth: 280 }}
                >
                  {step.body}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── 3. Real plans: live product data. Sample cards open the
             interactive sample plans, which is the page's real demo. ── */}
      {!isLoggedIn && <PublicExploreFeed />}
      {!isLoggedIn && (
        <Box sx={{ mt: { xs: -2, sm: -3 } }}>
          <RecentlyHappenedSection variant="public_explore" />
        </Box>
      )}

      {/* ── 4. Outcomes ── */}
      <Box
        component="section"
        ref={outcomesReveal.ref}
        sx={{ py: { xs: 5, sm: 8 }, ...REVEAL_SX(outcomesReveal.visible) }}
      >
        <Typography
          component="h2"
          variant="h2"
          textAlign="center"
          sx={{ mb: 1.5, fontSize: { xs: "1.6rem", sm: "1.875rem" } }}
        >
          Built for the person who makes the plan
        </Typography>
        <Typography
          variant="body1"
          textAlign="center"
          color="text.secondary"
          sx={{ mb: { xs: 4, sm: 5 }, maxWidth: 560, mx: "auto", lineHeight: 1.7 }}
        >
          Organizing is work. These are the three things NewChums takes off your
          plate.
        </Typography>
        <Grid container spacing={{ xs: 2.5, sm: 3 }} sx={{ maxWidth: 1060, mx: "auto" }}>
          {OUTCOMES.map((item) => (
            <Grid key={item.title} size={{ xs: 12, md: 4 }}>
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
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "50%",
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    mb: 1.75,
                  }}
                >
                  <item.icon sx={{ fontSize: 22 }} />
                </Box>
                <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.75 }}>
                  {item.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
                  {item.body}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── 5. Made for real life (photo band) ── */}
      <Box
        component="section"
        ref={photoReveal.ref}
        sx={{ py: { xs: 4, sm: 6 }, ...REVEAL_SX(photoReveal.visible) }}
      >
        <Grid
          container
          spacing={{ xs: 3, md: 6 }}
          alignItems="center"
          sx={{ maxWidth: 1060, mx: "auto" }}
        >
          <Grid size={{ xs: 12, md: 6 }}>
            {/* Real photo when the asset exists; designed warm panel until
                then. Same 3:2 box either way, so the layout never shifts. */}
            <Box
              sx={{
                width: "100%",
                aspectRatio: "3 / 2",
                borderRadius: 4,
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(230,91,19,0.10)",
              }}
            >
              {photoMissing ? (
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
                    background:
                      "radial-gradient(ellipse 80% 80% at 30% 20%, rgba(252,236,195,0.9) 0%, transparent 70%), linear-gradient(135deg, #fff7ed 0%, #ffe8d1 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <GroupsRoundedIcon sx={{ fontSize: 72, color: "primary.main", opacity: 0.45 }} />
                </Box>
              ) : (
                <Box
                  component="img"
                  src="/images/home/home-gathering.jpg"
                  alt="Friends gathered around a table"
                  onError={() => setPhotoMissing(true)}
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              )}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={1.5}>
              <Typography
                component="h2"
                variant="h3"
                sx={{ fontSize: { xs: "1.4rem", sm: "1.6rem" } }}
              >
                Made for real life
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.75 }}>
                Family potlucks, board game nights, pottery meetups, pickup
                games. If you are the one who gets people together, this is
                your tool.
              </Typography>
            </Stack>
          </Grid>
        </Grid>
      </Box>

      {/* ── 6. Closing CTA ── */}
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
            Post the plan. Share the link. See who is in.
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
          {/* Single closing ask, per the one-CTA-per-section rule. */}
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
