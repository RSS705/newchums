"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

/**
 * Plan keys mirror the backend's `subscription_plan` column exactly.
 * `free | super_host | community_pro`, see `api/src/lib/subscriptionAccess.ts`.
 */
type PlanKey = "free" | "super_host" | "community_pro";

function isPlanKey(value: unknown): value is PlanKey {
  return value === "free" || value === "super_host" || value === "community_pro";
}

type PlanInfo = {
  key: PlanKey;
  name: string;
  /** Short, parallel-structure summary used in both the current-plan hero
   *  and the per-tier comparison card. "Builds on X..." framing signals
   *  that tiers are additive without pricing-page energy. */
  summary: string;
  /** Decorative icon shown only on the current-plan hero. Scales quietly
   *  from a generic profile glyph up to a premium ribbon, signalling that
   *  tiers are additive without selling them. */
  icon: React.ComponentType<SvgIconProps>;
  /** Bullets listed in the plan's card. Every bullet reflects real,
   *  implemented behavior in the codebase today; no speculative roadmap
   *  promises. Tier-inheritance bullets (e.g. "Everything in Free") are
   *  listed first. */
  features: string[];
  /** Optional subdued footer line used when a tier currently has few
   *  dedicated bullets. Lets the card fill its share of height without
   *  inventing speculative features. */
  trailingNote?: string;
};

const PLANS: PlanInfo[] = [
  {
    key: "free",
    name: "Free",
    summary: "The everyday tools for organizing and joining plans on NewChums.",
    icon: PersonRoundedIcon,
    features: [
      "Host plans with RSVPs, invites, and public, Chums only, or invite-only visibility",
      "Join and RSVP to plans on Explore, personalized to your hobbies and area",
      "Real-time plan chat with the people attending",
      "Suggest alternate times or collect availability before a plan is scheduled",
      "24-hour attendance check so everyone knows who's confirmed",
      "Daily digest of new plans that match your interests",
      "Create and own up to 5 communities with hobbies, operating hours, and an avatar",
      "Build a Chum List and surface attendance reliability on your profile",
    ],
  },
  {
    key: "super_host",
    name: "Super Host",
    summary: "Builds on Free with advanced tools for people who host often.",
    icon: AutoAwesomeRoundedIcon,
    features: ["Everything in Free"],
    // The `hasSuperHostAccess` helper is wired into the access layer but
    // no production feature is gated to this tier alone today. Surfaced
    // as a trailing line so the card still feels intentional, not thin.
    trailingNote: "More advanced host tools will appear here as they launch.",
  },
  {
    key: "community_pro",
    name: "Community Pro",
    summary: "Builds on Super Host with advanced features for communities you own.",
    icon: WorkspacePremiumRoundedIcon,
    features: [
      "Everything in Super Host",
      "Custom community banner on owned communities",
    ],
  },
];

function getPlan(key: PlanKey): PlanInfo {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

export default function YourPlanClient() {
  // Always start as `null` so the hero renders a Skeleton until /profile
  // resolves. A prior version hydrated from a localStorage cache to paint
  // the "last known plan" immediately, but that produced a visible flash
  // whenever the cached value and the authoritative plan disagreed (e.g.
  // the user was upgraded / downgraded between visits), which surfaced as
  // "the page loads with a plan selected, then switches to the actual
  // plan." Skipping the cache costs ~200ms of skeleton but avoids the
  // mid-paint swap and matches the "unified load" behavior elsewhere.
  const [currentPlan, setCurrentPlan] = useState<PlanKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data.ok) return;
        const raw = data.profile?.subscription_plan;
        if (isPlanKey(raw)) {
          setCurrentPlan(raw);
        }
      } catch { /* noop; hero stays in the loading skeleton state */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const resolvedPlan = currentPlan;
  const current = resolvedPlan ? getPlan(resolvedPlan) : null;
  const CurrentIcon = current?.icon ?? PersonRoundedIcon;

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Warm-wash hero matching the rest of the logged-in
          surfaces (Explore, Your Plans, Communities, Your Chums,
          Profile, Settings, Roadmap, plan/event detail). Eyebrow row
          uses WorkspacePremiumRoundedIcon to signal "membership /
          tier" without being upsell-y. No right-side CTA, plans are
          currently assigned by the NewChums team and there is no
          checkout to point at. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
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
              <WorkspacePremiumRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
            </Box>
            <Typography
              sx={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "primary.dark",
              }}
            >
              Membership
            </Typography>
          </Stack>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "1.875rem", sm: "2.375rem" },
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              color: "text.primary",
            }}
          >
            Your Plan
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.9375rem", sm: "1rem" },
              lineHeight: 1.6,
              maxWidth: 560,
            }}
          >
            See what&rsquo;s included in your plan and how access works on NewChums.
          </Typography>
        </Stack>
      </Paper>

      {/* Current-plan card. Toned down from the previous warm-wash
          treatment so we don't have two stacked warm sections (the
          page hero already carries that), but still keeps a
          primary.light border + thin lift so the user's current tier
          reads as the page's primary content. The 60x60 tier icon on
          the left is the visual anchor. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          borderColor: "primary.light",
          bgcolor: "background.paper",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 2.5 }}
          alignItems={{ xs: "flex-start", sm: "center" }}
        >
          <Box
            sx={{
              width: 60,
              height: 60,
              borderRadius: "50%",
              bgcolor: "primary.light",
              color: "primary.dark",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          >
            <CurrentIcon sx={{ fontSize: 30 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
            <Typography
              variant="caption"
              sx={{
                color: "primary.dark",
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                fontSize: "0.6875rem",
                display: "block",
                lineHeight: 1.35,
              }}
            >
              Your current plan
            </Typography>
            {current ? (
              <>
                <Typography
                  component="h2"
                  sx={{
                    fontSize: { xs: "1.5rem", sm: "1.75rem" },
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    lineHeight: 1.2,
                    mt: 0.5,
                    color: "text.primary",
                  }}
                >
                  {current.name}
                </Typography>
                <Typography
                  variant="body1"
                  sx={{
                    lineHeight: 1.55,
                    mt: 0.5,
                    fontSize: { xs: "0.9375rem", sm: "1rem" },
                    color: "text.secondary",
                  }}
                >
                  {current.summary}
                </Typography>
              </>
            ) : (
              <>
                <Skeleton variant="text" width={180} height={38} sx={{ mt: 0.5 }} />
                <Skeleton variant="text" width="85%" height={22} sx={{ mt: 0.5 }} />
              </>
            )}
          </Box>
        </Stack>
      </Paper>

      {/* All plans overview. Compact intro + three balanced cards. */}
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            bgcolor: "primary.light",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AutoAwesomeRoundedIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
          >
            All plans
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
          >
            Every NewChums account includes the core tools. Higher plans add advanced features as they become available.
          </Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="stretch">
        {PLANS.map((p) => {
          const isCurrent = resolvedPlan !== null && p.key === resolvedPlan;
          return (
            <AppCard
              key={p.key}
              sx={{
                flex: 1,
                display: "flex",
                // Smooth transition on the highlight so when the /profile
                // fetch resolves and the card becomes the current plan,
                // the border and shadow fade in rather than pop.
                transition:
                  "border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease",
                borderColor: isCurrent ? "primary.main" : undefined,
                borderWidth: isCurrent ? 1 : undefined,
                borderStyle: isCurrent ? "solid" : undefined,
                boxShadow: isCurrent
                  ? "0 0 0 1px rgba(63, 81, 181, 0.12), 0 4px 16px -4px rgba(63, 81, 181, 0.15)"
                  : undefined,
                "&:hover": {
                  transform: "translateY(-1px)",
                  boxShadow: isCurrent
                    ? "0 0 0 1px rgba(63, 81, 181, 0.16), 0 8px 22px -6px rgba(63, 81, 181, 0.22)"
                    : "0 4px 14px -6px rgba(0, 0, 0, 0.12)",
                },
              }}
            >
              <Stack spacing={1.5} sx={{ width: "100%", height: "100%" }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ fontSize: "1.0625rem", lineHeight: 1.3 }}
                  >
                    {p.name}
                  </Typography>
                  {isCurrent && (
                    <Chip
                      label="Your plan"
                      size="small"
                      color="primary"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.6875rem",
                        height: 22,
                        borderRadius: 1.5,
                      }}
                    />
                  )}
                </Stack>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.55 }}
                >
                  {p.summary}
                </Typography>
                <Divider sx={{ opacity: 0.6 }} />
                <Stack component="ul" spacing={0.875} sx={{ m: 0, p: 0, listStyle: "none" }}>
                  {p.features.map((f) => (
                    <Stack
                      component="li"
                      direction="row"
                      spacing={1}
                      alignItems="flex-start"
                      key={f}
                    >
                      <CheckRoundedIcon
                        sx={{ fontSize: 16, color: "primary.main", mt: "3px", flexShrink: 0 }}
                      />
                      <Typography variant="body2" sx={{ lineHeight: 1.55 }}>
                        {f}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
                {/* Trailing note, pushed to the bottom so thinner tiers
                    (currently Super Host) fill their share of the card
                    height with a deliberate forward-looking line rather
                    than looking underfilled against their neighbors. */}
                {p.trailingNote && <Box sx={{ flexGrow: 1 }} />}
                {p.trailingNote && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ lineHeight: 1.55, pt: 0.5 }}
                  >
                    {p.trailingNote}
                  </Typography>
                )}
              </Stack>
            </AppCard>
          );
        })}
      </Stack>

      {/* Rollout footer. One confident sentence about how access works
          today and why the page will keep evolving, nothing about
          pricing, checkout, or upgrade. */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textAlign: { xs: "center", sm: "left" }, lineHeight: 1.6 }}
      >
        Plans are currently assigned by the NewChums team. This page will expand as more organizer features become available.
      </Typography>
    </Stack>
  );
}
