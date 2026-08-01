"use client";

import * as React from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import type { PlanEvent } from "@/components/events/EventCard";

/**
 * Read-only demo of a plan page, reached by clicking a sample card in the
 * logged-out Explore feed.
 *
 * Those cards used to link straight to /signup, so clicking a plan produced
 * a signup form and no sense of what a plan actually looks like. This shows
 * the real thing instead: the header, who's coming, the plan chat, and the
 * 24-hour attendance check, all clearly labelled as a sample.
 *
 * Deliberately NOT interactive. Every control is disabled and explained;
 * a working RSVP demo was explicitly out of scope, and a demo that half
 * works is worse than one that is honestly inert. All content is generated
 * from the curated sample data, so nothing here is a real person or plan.
 */

const DEMO_ATTENDEES = [
  { name: "Priya", initial: "P", status: "going" as const, confirmed: true },
  { name: "Marcus", initial: "M", status: "going" as const, confirmed: true },
  { name: "Dani", initial: "D", status: "going" as const, confirmed: false },
  { name: "Sam", initial: "S", status: "maybe" as const, confirmed: false },
];

const DEMO_CHAT = [
  { who: "Priya", text: "Bringing snacks, anyone need a lift?" },
  { who: "Marcus", text: "I can pick two people up from downtown." },
  { who: "Dani", text: "Perfect, see you all there." },
];

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

function Avatar({ initial }: { initial: string }) {
  return (
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        bgcolor: "primary.light",
        color: "primary.dark",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "0.875rem",
        flexShrink: 0,
      }}
    >
      {initial}
    </Box>
  );
}

export default function SamplePlanClient({ plan }: { plan: PlanEvent }) {
  const when = plan.startsAt ? formatWhen(plan.startsAt) : "";
  const goingCount = DEMO_ATTENDEES.filter((a) => a.status === "going").length;
  const maybeCount = DEMO_ATTENDEES.filter((a) => a.status === "maybe").length;

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 760, mx: "auto", py: { xs: 2, sm: 3 } }}>
      {/* Sample banner. First thing on the page so nobody mistakes this for
          a real plan they can join. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.25 },
          borderRadius: 3,
          borderColor: "primary.light",
          bgcolor: (t) => (t.palette.mode === "light" ? "#FFF7ED" : "rgba(230,91,19,0.08)"),
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <VisibilityRoundedIcon sx={{ color: "primary.main", fontSize: 22, mt: "2px" }} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "0.9375rem" }}>
              This is a sample plan
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.6 }}>
              A read-only example so you can see what a real plan looks like
              before you make one. Nothing here is live, and the people are
              made up.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Plan header */}
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        {plan.bannerUrl && (
          <Box
            component="img"
            src={plan.bannerUrl}
            alt=""
            sx={{ display: "block", width: "100%", height: { xs: 140, sm: 200 }, objectFit: "cover" }}
          />
        )}
        <Box sx={{ p: { xs: 2, sm: 2.75 } }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }} useFlexGap flexWrap="wrap">
            <Chip label="Public" size="small" variant="outlined" />
            {plan.hobby && <Chip label={plan.hobby} size="small" color="primary" variant="outlined" />}
          </Stack>
          <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.5rem", sm: "1.875rem" }, lineHeight: 1.2, mb: 1.5 }}>
            {plan.title}
          </Typography>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <CalendarMonthRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
              <Typography variant="body2">{when}</Typography>
            </Stack>
            {plan.locationDisplay && (
              <Stack direction="row" spacing={1.25} alignItems="center">
                <PlaceRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
                <Typography variant="body2">{plan.locationDisplay}</Typography>
              </Stack>
            )}
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              Hosted by {plan.hostName ?? "a NewChums host"}
            </Typography>
          </Stack>

          {/* Disabled RSVP row: shows what an attendee would see, without
              pretending to work. */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>
            Are you going?
          </Typography>
          <Tooltip title="RSVP is disabled on sample plans" arrow>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {["Going", "Maybe", "Can't make it"].map((label) => (
                <Button
                  key={label}
                  disabled
                  variant={label === "Going" ? "contained" : "outlined"}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5 }}
                >
                  {label}
                </Button>
              ))}
            </Stack>
          </Tooltip>
        </Box>
      </Paper>

      {/* Who's coming */}
      <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.75 } }}>
        <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", mb: 0.5 }}>
          Who&rsquo;s in
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
          {goingCount} going, {maybeCount} maybe
        </Typography>
        <Stack spacing={1.25}>
          {DEMO_ATTENDEES.map((a) => (
            <Stack key={a.name} direction="row" spacing={1.5} alignItems="center">
              <Avatar initial={a.initial} />
              <Typography sx={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: "0.9375rem" }}>
                {a.name}
              </Typography>
              {a.status === "going" ? (
                a.confirmed ? (
                  <Chip
                    icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                    label="Going & Confirmed"
                    size="small"
                    color="success"
                    sx={{ fontWeight: 600 }}
                  />
                ) : (
                  <Chip
                    icon={<AccessTimeRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                    label="Going - Unconfirmed"
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ fontWeight: 600 }}
                  />
                )
              ) : (
                <Chip label="Maybe" size="small" color="warning" variant="outlined" sx={{ fontWeight: 600 }} />
              )}
            </Stack>
          ))}
        </Stack>
      </Paper>

      {/* The 24-hour attendance check, explained */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 3,
          p: { xs: 2, sm: 2.75 },
          borderColor: (t) => (t.palette.mode === "light" ? "rgba(5,150,105,0.25)" : "rgba(16,185,129,0.3)"),
          bgcolor: (t) => (t.palette.mode === "light" ? "#ecfdf5" : "rgba(16,185,129,0.08)"),
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <AccessTimeRoundedIcon sx={{ color: "success.main", fontSize: 24, mt: "2px" }} />
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1rem", mb: 0.5 }}>
              The 24-hour attendance check
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.65 }}>
              Hosts can turn this on. The day before the plan, everyone who
              said they were going gets asked to confirm, and the badges above
              update as they answer. That is how a host knows whether five
              people are really coming, instead of hoping.
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Plan chat preview */}
      <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 2, sm: 2.75 } }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <ForumRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
          <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem" }}>Plan chat</Typography>
        </Stack>
        <Stack spacing={1.25}>
          {DEMO_CHAT.map((m, i) => (
            <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
              <Avatar initial={m.who[0]} />
              <Box
                sx={{
                  bgcolor: "background.default",
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2.5,
                  px: 1.75,
                  py: 1.25,
                }}
              >
                <Typography variant="caption" sx={{ fontWeight: 700, display: "block", color: "text.secondary" }}>
                  {m.who}
                </Typography>
                <Typography variant="body2">{m.text}</Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
        <Typography variant="caption" sx={{ color: "text.disabled", display: "block", mt: 1.5 }}>
          Every plan has its own chat. Only people on the plan can see it.
        </Typography>
      </Paper>

      {/* The one call to action */}
      <Paper
        variant="outlined"
        sx={{
          borderRadius: 3,
          p: { xs: 2.5, sm: 3 },
          textAlign: "center",
          borderColor: "primary.light",
          background: (t) =>
            t.palette.mode === "light"
              ? "linear-gradient(180deg, #FFF7ED 0%, #FFFFFF 80%)"
              : "linear-gradient(180deg, rgba(230,91,19,0.10) 0%, rgba(0,0,0,0) 80%)",
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: "1.125rem", mb: 0.5 }}>
          Make one of your own
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 2, maxWidth: 420, mx: "auto", lineHeight: 1.6 }}>
          Post a plan, share one link, and see who is really coming. Your
          friends don&rsquo;t need an account to RSVP.
        </Typography>
        <Button
          component={Link}
          href="/signup"
          variant="contained"
          size="large"
          sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, px: 4, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.94 } }}
        >
          Create your first plan
        </Button>
      </Paper>
    </Stack>
  );
}
