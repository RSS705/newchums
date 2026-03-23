"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Link from "next/link";
import EventCard from "@/components/events/EventCard";
import type { PlanEvent } from "@/components/events/EventCard";
import { apiFetch } from "@/lib/apiClient";

const PAGE_SIZE = 12;

const TIME_CHIPS = [
  { label: "All upcoming", value: "all" },
  { label: "This week", value: "this_week" },
  { label: "This weekend", value: "this_weekend" },
  { label: "Next 30 days", value: "next_30" },
] as const;

export default function PublicExploreFeed() {
  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEvents = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      if (timeRange !== "all") params.set("time_range", timeRange);
      if (searchDebounced) params.set("q", searchDebounced);
      const res = await apiFetch(`/events/explore/public?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { events: PlanEvent[]; hasMore: boolean };
        setEvents((prev) => append ? [...prev, ...data.events] : data.events);
        setHasMore(data.hasMore);
      }
    } catch { /* silent */ }
    setLoading(false);
    setLoadingMore(false);
  }, [timeRange, searchDebounced]);

  useEffect(() => {
    fetchEvents(0, false);
  }, [fetchEvents]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) fetchEvents(events.length, true);
  };

  return (
    <Box component="section" sx={{ py: { xs: 5, sm: 7, md: 9 } }}>
      <Stack spacing={1} sx={{ mb: { xs: 3, sm: 4 } }}>
        <Typography
          variant="overline"
          sx={{
            color: "secondary.main",
            fontWeight: 700,
            letterSpacing: "0.12em",
            fontSize: "0.7rem",
          }}
        >
          Discover plans
        </Typography>
        <Typography component="h2" variant="h3" fontWeight={700}>
          See what people are organizing
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.7 }}>
          Browse real upcoming plans from the NewChums community. Sign up to RSVP, chat with attendees, and create your own.
        </Typography>
      </Stack>

      {/* Filter bar */}
      <Stack
        direction="row"
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        sx={{ gap: 1, mb: { xs: 3, sm: 3.5 } }}
      >
        <TextField
          size="small"
          placeholder="Search plans..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                </InputAdornment>
              ),
            },
          }}
          sx={{
            width: { xs: "100%", sm: 220 },
            "& .MuiOutlinedInput-root": { borderRadius: 2.5 },
          }}
        />
        {TIME_CHIPS.map((tc) => (
          <Chip
            key={tc.value}
            label={tc.label}
            size="small"
            variant={timeRange === tc.value ? "filled" : "outlined"}
            onClick={() => setTimeRange(tc.value)}
            sx={{
              fontWeight: 600,
              fontSize: "0.78rem",
              borderRadius: 2,
              ...(timeRange === tc.value
                ? { bgcolor: "primary.main", color: "primary.contrastText" }
                : {}),
            }}
          />
        ))}
      </Stack>

      {/* Event grid */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : events.length === 0 ? (
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography variant="h6" color="text.secondary" fontWeight={500}>
            {searchDebounced ? "No plans match your search" : "No public plans right now"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 400 }}>
            Plans appear here as people create them. Sign up to start your own or get notified when new plans match your interests.
          </Typography>
          <Button
            component={Link}
            href="/signup"
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, mt: 1 }}
          >
            Create an account
          </Button>
        </Stack>
      ) : (
        <>
          <Grid container spacing={{ xs: 2, sm: 2.5 }}>
            {events.map((ev) => (
              <Grid key={ev.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <EventCard event={ev} />
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" justifyContent="center" sx={{ mt: 4 }}>
            {hasMore ? (
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore}
                variant="outlined"
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 4 }}
              >
                {loadingMore ? "Loading..." : "Show more plans"}
              </Button>
            ) : events.length > 0 ? (
              <Stack spacing={1.5} alignItems="center">
                <Typography variant="body2" color="text.secondary">
                  Sign up to see more plans, get personalized recommendations, and create your own.
                </Typography>
                <Button
                  component={Link}
                  href="/signup"
                  variant="contained"
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5 }}
                >
                  Create an account
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </>
      )}
    </Box>
  );
}
