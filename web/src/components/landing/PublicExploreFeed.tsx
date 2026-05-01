"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import Link from "next/link";
import EventCard from "@/components/events/EventCard";
import type { PlanEvent } from "@/components/events/EventCard";
import { apiFetch } from "@/lib/apiClient";
import { getSamplePublicExplorePlans } from "@/lib/publicExploreSamplePlans";

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
  const [filtering, setFiltering] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const initialLoadDone = useRef(false);
  const [hasMore, setHasMore] = useState(false);
  /** null until first fetch completes; true = HTTP 200 with parsed body */
  const [fetchSucceeded, setFetchSucceeded] = useState<boolean | null>(null);
  const [timeRange, setTimeRange] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");

  useEffect(() => {
    const trimmed = search.trim();
    const t = setTimeout(() => {
      setSearchDebounced((prev) => {
        if (prev === trimmed) return prev;
        if (initialLoadDone.current) setFiltering(true);
        return trimmed;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchEvents = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) {
      if (!initialLoadDone.current) setLoading(true);
    } else {
      setLoadingMore(true);
    }
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
        setFetchSucceeded(true);
      } else {
        setFetchSucceeded(false);
      }
    } catch {
      setFetchSucceeded(false);
    }
    initialLoadDone.current = true;
    setLoading(false);
    setFiltering(false);
    setLoadingMore(false);
  }, [timeRange, searchDebounced]);

  useEffect(() => {
    fetchEvents(0, false);
  }, [fetchEvents]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) fetchEvents(events.length, true);
  };

  /** Curated examples only when the default feed is empty and the request succeeded (not on search/filter or API error). */
  const showSampleFallback =
    fetchSucceeded === true &&
    events.length === 0 &&
    !searchDebounced &&
    timeRange === "all" &&
    !filtering;

  const displayEvents = showSampleFallback ? getSamplePublicExplorePlans() : events;

  return (
    <Box component="section" sx={{ py: { xs: 5, sm: 7, md: 9 } }}>
      <Stack spacing={1} sx={{ mb: { xs: 3, sm: 4 } }}>
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
            <ExploreRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
          </Box>
          <Typography
            sx={{
              color: "primary.dark",
              fontWeight: 700,
              letterSpacing: "0.12em",
              fontSize: "0.7rem",
              textTransform: "uppercase",
            }}
          >
            Discover plans
          </Typography>
        </Stack>
        <Typography component="h2" variant="h3" fontWeight={700}>
          See what people are organizing
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 560, lineHeight: 1.7 }}>
          {showSampleFallback ? (
            <>
              Here are examples of the kinds of plans people run on NewChums. When real public plans are live,
              they&apos;ll show here. Sign up to RSVP, join the chat, and host your own.
            </>
          ) : (
            <>
              Browse real upcoming plans from the NewChums community. Sign up to RSVP, chat with attendees, and create your own.
            </>
          )}
        </Typography>
        {showSampleFallback && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", maxWidth: 520, lineHeight: 1.65, letterSpacing: "0.01em" }}
          >
            Sample plans for illustration, hosts and times are fictional.
          </Typography>
        )}
      </Stack>

      {/* Filter bar, hidden while showing sample fallback so filters don’t imply the examples respond to search */}
      {!showSampleFallback && (
        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ gap: 1, mb: { xs: 3, sm: 3.5 } }}
        >
          <TextField
            id="explore-search"
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
              onClick={() => { setTimeRange(tc.value); if (initialLoadDone.current) setFiltering(true); }}
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
      )}

      {/* Event grid */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : fetchSucceeded === false ? (
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography variant="h6" color="text.secondary" fontWeight={500}>
            Couldn&apos;t load plans right now
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 400 }}>
            Refresh the page in a moment, or sign up to explore from your account.
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
      ) : events.length === 0 && !showSampleFallback ? (
        /* Empty state: no plans for current search/filter state. */
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography variant="h6" color="text.secondary" fontWeight={500}>
            {searchDebounced ? "Nothing matched this time" : "No public plans right now"}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
            {searchDebounced
              ? "Try a different search to find what you're looking for."
              : "Plans appear here as people create them. Sign up to start your own or get notified when new plans match your hobbies."}
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
          <Grid
            container
            spacing={{ xs: 2, sm: 2.5 }}
            sx={{
              opacity: filtering ? 0.5 : 1,
              transition: "opacity 0.15s ease",
              pointerEvents: filtering ? "none" : "auto",
            }}
          >
            {displayEvents.map((ev) => (
              <Grid key={ev.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <EventCard event={ev} isExample={showSampleFallback} hideRsvp />
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" justifyContent="center" sx={{ mt: 4 }}>
            {showSampleFallback ? (
              <Stack spacing={1.5} alignItems="center">
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", maxWidth: 440 }}>
                  Create a free account to host or join real plans, get hobby-based recommendations, and use plan chat.
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
            ) : hasMore ? (
              <Button
                onClick={handleLoadMore}
                disabled={loadingMore}
                variant="outlined"
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 4 }}
              >
                {loadingMore ? "Loading..." : "Show more plans"}
              </Button>
            ) : null /* End-of-feed signup CTA moved to a single closing CTA
                       below the Recently-happened section in
                       LandingPageContent so the page tells one story:
                       upcoming -> recently happened -> sign up. */}
          </Stack>
        </>
      )}
    </Box>
  );
}
