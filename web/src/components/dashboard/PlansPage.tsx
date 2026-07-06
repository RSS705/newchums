"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Collapse from "@mui/material/Collapse";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import Divider from "@mui/material/Divider";
import EventCardSkeleton from "@/components/ui/EventCardSkeleton";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import Link from "next/link";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import { EmptyState, SectionHeader } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

export default function PlansPage() {
  const [tab, setTab] = useState(0);
  const [upcoming, setUpcoming] = useState<PlanEvent[]>([]);
  const [past, setPast] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [canceledOpen, setCanceledOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [upRes, pastRes] = await Promise.all([
          apiFetch("/events/mine?filter=upcoming", { auth: true }),
          apiFetch("/events/mine?filter=past", { auth: true }),
        ]);
        if (upRes.ok) {
          const d = (await upRes.json()) as { events: PlanEvent[] };
          setUpcoming(d.events ?? []);
        }
        if (pastRes.ok) {
          const d = (await pastRes.json()) as { events: PlanEvent[] };
          setPast(d.events ?? []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, []);

  const isPast = tab === 1;
  // Active (non-canceled) events for the current tab
  const activeList = (isPast ? past : upcoming).filter((e) => e.status !== "canceled");
  // Canceled events live in their own collapsed section on each tab
  const canceledList = (isPast ? past : upcoming).filter((e) => e.status === "canceled");
  const hosted = activeList.filter((e) => e.isHost);
  const joined = activeList.filter((e) => !e.isHost);
  // Tab counters reflect only active plans; canceled plans have their own
  // collapsed section and shouldn't inflate the Upcoming / Past tab counts.
  const upcomingActiveCount = upcoming.filter((e) => e.status !== "canceled").length;
  const pastActiveCount = past.filter((e) => e.status !== "canceled").length;

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Warm-wash hero matching the Explore page so the two
          primary logged-in surfaces read as one product. Eyebrow +
          large H1 mirror the discovery-header pattern in
          docs/UI_Patterns.md. The "Start a plan" CTA on the right is
          the page's primary action and gets the warm-tinted shadow. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          position: "relative",
          overflow: "hidden",
          // Soft corner radial for depth; decorative only (see the discovery
          // page header pattern in docs/UI_Patterns.md).
          "&::after": {
            content: '""',
            position: "absolute",
            width: 280,
            height: 280,
            top: -120,
            right: -80,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(230,91,19,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
          },
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 3 }}
          alignItems={{ xs: "stretch", sm: "flex-end" }}
          justifyContent="space-between"
        >
          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
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
                <CalendarMonthRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
                Your schedule
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
              Your Plans
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
              Plans you&apos;re hosting or taking part in, all in one place.
            </Typography>
          </Stack>
          <Button
            component={Link}
            href="/events/create"
            variant="contained"
            startIcon={<AddCircleRoundedIcon />}
            sx={{
              flexShrink: 0,
              alignSelf: { xs: "stretch", sm: "flex-end" },
              textTransform: "none",
              fontWeight: 700,
              borderRadius: 2.5,
              px: 3,
              py: 1.125,
              fontSize: "0.9375rem",
              boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
              "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
            }}
          >
            Start a plan
          </Button>
        </Stack>
      </Paper>

      {/* Tabs. Custom 3px primary indicator, font-size 0.9375rem, color
          shifts from text.secondary inactive to primary.main bold active.
          Matches the styled tabs on the community detail page. */}
      <Tabs
        value={tab}
        onChange={(_, v) => { setTab(v); setCanceledOpen(false); }}
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: 52,
          "& .MuiTabs-indicator": {
            height: 3,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
            backgroundColor: "primary.main",
          },
        }}
      >
        <Tab
          label={`Upcoming${upcomingActiveCount > 0 ? ` (${upcomingActiveCount})` : ""}`}
          sx={{
            textTransform: "none",
            minHeight: 52,
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "text.secondary",
            "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            transition: "color 0.15s ease, background-color 0.15s ease",
          }}
        />
        <Tab
          label={`Past${pastActiveCount > 0 ? ` (${pastActiveCount})` : ""}`}
          sx={{
            textTransform: "none",
            minHeight: 52,
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "text.secondary",
            "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            transition: "color 0.15s ease, background-color 0.15s ease",
          }}
        />
      </Tabs>

      {/* Loading */}
      {loading && (
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {[0, 1, 2].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
              <EventCardSkeleton />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Content */}
      {!loading && (
        <Stack spacing={{ xs: 4, sm: 5 }}>
          {/* Hosted section */}
          {hosted.length > 0 && (
            <Box>
              <SectionHeader
                title={isPast ? "Plans you hosted" : "Plans you're hosting"}
                emphasis="primary"
              />
              <Grid container spacing={2}>
                {hosted.map((event) => (
                  <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                    <EventCard event={event} isPast={isPast} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Joined / invited section */}
          {joined.length > 0 && (
            <Box>
              <SectionHeader
                title={isPast ? "Plans you attended" : "Plans you're attending"}
                emphasis={hosted.length > 0 ? "secondary" : "primary"}
              />
              <Grid container spacing={2}>
                {joined.map((event) => (
                  <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                    <EventCard event={event} isPast={isPast} />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Empty state. Wrapped in an outlined Paper with a soft warm
              icon orb so the empty surface still feels like part of the
              page rather than orphaned helper text. */}
          {hosted.length === 0 && joined.length === 0 && (
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 3,
                borderColor: "grey.200",
                bgcolor: "background.paper",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <EmptyState
                icon={
                  <Box
                    sx={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CalendarMonthRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
                  </Box>
                }
                title={isPast ? "No past plans yet" : "No upcoming plans"}
                description={
                  isPast
                    ? "Once you attend or host a gathering, it'll show up here so you can look back on the good times."
                    : "Start a plan around something you enjoy, or keep an eye out for an invite from someone you know."
                }
                action={
                  !isPast ? (
                    <Button
                      component={Link}
                      href="/events/create"
                      variant="contained"
                      startIcon={<AddCircleRoundedIcon />}
                      sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                    >
                      Start a plan
                    </Button>
                  ) : undefined
                }
              />
            </Paper>
          )}

          {/* Canceled plans, collapsed by default, shown on both tabs */}
          {canceledList.length > 0 && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <Box
                component="button"
                onClick={() => setCanceledOpen((v) => !v)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  p: 0,
                  mb: canceledOpen ? 2 : 0,
                  color: "text.disabled",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  fontFamily: "inherit",
                  letterSpacing: "0.01em",
                  transition: "color 0.15s",
                  "&:hover": { color: "text.secondary" },
                }}
              >
                Canceled plans ({canceledList.length})
                {canceledOpen
                  ? <ExpandLessRoundedIcon sx={{ fontSize: 16 }} />
                  : <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />}
              </Box>
              <Collapse in={canceledOpen} unmountOnExit>
                <Grid container spacing={2}>
                  {canceledList.map((event) => (
                    <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                      <EventCard event={event} isPast={isPast} />
                    </Grid>
                  ))}
                </Grid>
              </Collapse>
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
