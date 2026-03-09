"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import Link from "next/link";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import { SectionHeader } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

export default function PlansPage() {
  const [tab, setTab] = useState(0);
  const [upcoming, setUpcoming] = useState<PlanEvent[]>([]);
  const [past, setPast] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);

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

  const hosted = (tab === 0 ? upcoming : past).filter((e) => e.isHost);
  const joined = (tab === 0 ? upcoming : past).filter((e) => !e.isHost);
  const isPast = tab === 1;

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box>
          <Typography
            component="h1"
            sx={{
              mb: 0.5,
              lineHeight: 1.25,
              fontSize: { xs: "1.75rem", sm: "2rem" },
              letterSpacing: "-0.02em",
              fontWeight: 700,
            }}
          >
            Your Plans
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
            Gatherings you&apos;re hosting, attending, or have been invited to.
          </Typography>
        </Box>
        <Button
          component={Link}
          href="/events/create"
          variant="contained"
          color="primary"
          startIcon={<AddCircleRoundedIcon />}
          sx={{ px: 3, py: 1.25, fontWeight: 600, textTransform: "none", whiteSpace: "nowrap", borderRadius: 2.5 }}
        >
          Start a plan
        </Button>
      </Stack>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          textColor="primary"
          indicatorColor="primary"
        >
          <Tab label={`Upcoming${upcoming.length > 0 ? ` (${upcoming.length})` : ""}`} />
          <Tab label={`Past${past.length > 0 ? ` (${past.length})` : ""}`} />
        </Tabs>
      </Box>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Content */}
      {!loading && (
        <Stack spacing={{ xs: 4, sm: 5 }}>
          {/* Hosted section */}
          {hosted.length > 0 && (
            <Box>
              <SectionHeader
                title={isPast ? "Plans you hosted" : "Plans you\u2019re hosting"}
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
                title={isPast ? "Plans you attended" : "Plans you\u2019ve joined or been invited to"}
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

          {/* Empty state */}
          {hosted.length === 0 && joined.length === 0 && (
            <Box
              sx={{
                textAlign: "center",
                py: { xs: 8, sm: 12 },
                px: 3,
              }}
            >
              <CalendarMonthRoundedIcon
                sx={{ fontSize: 52, color: "secondary.main", mb: 2, opacity: 0.7 }}
              />
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                {isPast ? "No past plans yet" : "No upcoming plans"}
              </Typography>
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 3, maxWidth: 400, mx: "auto", lineHeight: 1.7 }}
              >
                {isPast
                  ? "Once you attend or host a gathering, it\u2019ll show up here so you can look back on the good times."
                  : "Start a plan around something you enjoy, or keep an eye out for an invite from someone you know."}
              </Typography>
              {!isPast && (
                <Button
                  component={Link}
                  href="/events/create"
                  variant="contained"
                  color="primary"
                  startIcon={<AddCircleRoundedIcon />}
                  sx={{ px: 4, py: 1.25, fontWeight: 600, borderRadius: 2.5, textTransform: "none" }}
                >
                  Start a plan
                </Button>
              )}
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}
