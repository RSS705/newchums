"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import EditLocationRoundedIcon from "@mui/icons-material/EditLocationRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Link from "next/link";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import DistanceSelect from "@/components/common/DistanceSelect";
import { apiFetch } from "@/lib/apiClient";

type HobbyOption = { slug: string; name: string };

type TimeChip = { value: string; label: string };
const TIME_CHIPS: TimeChip[] = [
  { value: "this_week", label: "This week" },
  { value: "this_weekend", label: "This weekend" },
  { value: "next_30", label: "Next 30 days" },
  { value: "all", label: "All upcoming" },
];

type ProfileData = {
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_radius_km: number;
  interest_items?: { slug: string; name: string }[];
};

type DashboardHomeProps = {
  greetingName: string;
};

export default function DashboardHome({ greetingName }: DashboardHomeProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [allEvents, setAllEvents] = useState<PlanEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [radiusKm, setRadiusKm] = useState(25);
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (res.ok) {
          const data = (await res.json()) as { profile: ProfileData };
          setProfile(data.profile);
          if (data.profile.travel_radius_km) setRadiusKm(data.profile.travel_radius_km);
        }
      } catch { /* ignore */ }
      setProfileLoaded(true);
    };
    const loadHobbies = async () => {
      try {
        const res = await apiFetch("/interests");
        if (res.ok) {
          const data = (await res.json()) as { interests: HobbyOption[] };
          const sorted = (data.interests ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
          setHobbyOptions(sorted);
        }
      } catch { /* ignore */ }
    };
    loadProfile();
    loadHobbies();
  }, []);

  const fetchEvents = useCallback(async (pageOffset: number, append: boolean) => {
    const PAGE_SIZE = 12;
    if (!profileLoaded) return;
    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (profile?.home_lat != null && profile?.home_lng != null) {
      params.set("lat", String(profile.home_lat));
      params.set("lng", String(profile.home_lng));
      params.set("radius_km", String(radiusKm));
    }
    if (selectedHobby) params.set("hobby", selectedHobby.slug);
    if (timeRange !== "all") params.set("time_range", timeRange);
    if (searchText.trim()) params.set("q", searchText.trim());
    params.set("offset", String(pageOffset));
    params.set("limit", String(PAGE_SIZE));

    try {
      const res = await apiFetch(`/events/explore?${params.toString()}`, { auth: true });
      if (res.ok) {
        const data = (await res.json()) as { events: PlanEvent[]; hasMore: boolean };
        if (append) {
          setAllEvents((prev) => [...prev, ...(data.events ?? [])]);
        } else {
          setAllEvents(data.events ?? []);
        }
        setHasMore(data.hasMore ?? false);
      }
    } catch { /* ignore */ }
    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [profileLoaded, profile, radiusKm, selectedHobby, timeRange, searchText]);

  useEffect(() => { fetchEvents(0, false); }, [fetchEvents]);

  const handleLoadMore = () => { fetchEvents(allEvents.length, true); };

  const hasLocation = profile?.home_lat != null && profile?.home_lng != null;
  const hasHobbies = (profile?.interest_items?.length ?? 0) > 0;
  const isFiltered = searchText.trim() || selectedHobby || timeRange !== "all" || (hasLocation && radiusKm < 200);

  const locationLabel = useMemo(() => {
    if (!profile?.home_city) return null;
    const parts = profile.home_city.split(",");
    return parts.length > 1 ? parts.slice(0, 2).join(",").trim() : parts[0].trim();
  }, [profile?.home_city]);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* ── Header ──────────────────────────────────────────────────── */}
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
          Explore
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
          {hasLocation
            ? `Discover plans and gatherings${locationLabel ? ` near ${locationLabel}` : ""}`
            : "Find plans around the hobbies you enjoy"}
        </Typography>
      </Box>

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 3,
          borderColor: "grey.200",
          bgcolor: "background.paper",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <Stack spacing={1.5}>
          {/* Search + toggle */}
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              id="explore-search-input"
              placeholder="Search plans…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              size="small"
              fullWidth
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            />
            <IconButton
              onClick={() => setFiltersOpen((p) => !p)}
              sx={{
                border: "1px solid",
                borderColor: filtersOpen ? "primary.main" : "divider",
                borderRadius: 2,
                color: filtersOpen ? "primary.main" : "text.secondary",
                bgcolor: filtersOpen ? "primary.light" : "transparent",
              }}
            >
              <TuneRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Time chips */}
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {TIME_CHIPS.map((chip) => (
              <Chip
                key={chip.value}
                label={chip.label}
                size="small"
                variant={timeRange === chip.value ? "filled" : "outlined"}
                onClick={() => setTimeRange(chip.value)}
                sx={{
                  borderRadius: 2,
                  fontWeight: 500,
                  fontSize: "0.8125rem",
                  ...(timeRange === chip.value
                    ? { bgcolor: "primary.light", color: "primary.dark", borderColor: "primary.light" }
                    : { borderColor: "divider", color: "text.secondary" }),
                  "&:hover": { bgcolor: timeRange === chip.value ? "primary.light" : "action.hover" },
                }}
              />
            ))}
          </Stack>

          {/* Expanded filters */}
          {filtersOpen && (
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "flex-end" }}
              sx={{ pt: 0.5 }}
            >
              <DistanceSelect
                value={radiusKm}
                onChange={setRadiusKm}
                helperText={null}
                sx={{ flex: 1, minWidth: { sm: 160 } }}
              />
              <Box sx={{ flex: 1, minWidth: { sm: 180 } }}>
                <Typography
                  component="label"
                  htmlFor="explore-hobby-filter"
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.625, cursor: "text" }}
                >
                  Hobby
                </Typography>
                <Autocomplete
                  fullWidth
                  options={hobbyOptions}
                  getOptionLabel={(o) => o.name}
                  value={selectedHobby}
                  onChange={(_, v) => setSelectedHobby(v)}
                  isOptionEqualToValue={(a, b) => a.slug === b.slug}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      id="explore-hobby-filter"
                      placeholder="Any hobby"
                      variant="outlined"
                      label={undefined}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  )}
                />
              </Box>
              {isFiltered && (
                <Button
                  size="medium"
                  onClick={() => {
                    setSearchText("");
                    setTimeRange("all");
                    setSelectedHobby(null);
                    setRadiusKm(profile?.travel_radius_km ?? 25);
                  }}
                  sx={{ textTransform: "none", whiteSpace: "nowrap", flexShrink: 0, mb: "1px" }}
                >
                  Clear filters
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* ── Location nudge ──────────────────────────────────────────── */}
      {profileLoaded && !hasLocation && (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            borderColor: "secondary.light",
            bgcolor: "rgba(244, 180, 0, 0.035)",
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 2,
          }}
        >
          <Box sx={{ width: 44, height: 44, borderRadius: "50%", bgcolor: "secondary.light", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <EditLocationRoundedIcon sx={{ color: "secondary.dark", fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.25 }}>
              Add your location for better results
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              We&apos;ll prioritize plans and gatherings near you. You can also set how far you&apos;re willing to travel.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/profile"
            variant="outlined"
            size="small"
            sx={{ textTransform: "none", fontWeight: 600, whiteSpace: "nowrap", borderRadius: 2.5 }}
          >
            Update profile
          </Button>
        </Paper>
      )}

      {/* ── Event feed ──────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : allEvents.length > 0 ? (
        <>
          <Grid container spacing={2}>
            {allEvents.map((event) => (
              <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                <EventCard event={event} />
              </Grid>
            ))}
          </Grid>

          {/* ── Load more ─────────────────────────────────────────── */}
          {hasMore && (
            <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
              {loadingMore ? (
                <CircularProgress size={28} />
              ) : (
                <Button
                  variant="outlined"
                  onClick={handleLoadMore}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 4 }}
                >
                  Load more
                </Button>
              )}
            </Box>
          )}
        </>
      ) : (
        /* ── Empty states ──────────────────────────────────────────── */
        <Box
          sx={{
            textAlign: "center",
            py: { xs: 6, sm: 10 },
            px: 3,
          }}
        >
          <ExploreRoundedIcon
            sx={{ fontSize: 52, color: "secondary.main", mb: 2, opacity: 0.6 }}
          />
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            {isFiltered ? "No plans match your filters" : "No upcoming plans nearby yet"}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 440, mx: "auto", lineHeight: 1.7 }}
          >
            {isFiltered
              ? "Try broadening your search, changing the time window, or clearing filters to see more."
              : hasLocation
                ? "There aren\u2019t any public plans in your area right now. Be the first to organize one, or check back soon."
                : !hasHobbies
                  ? "Add a few hobbies to your profile so we can show you relevant gatherings."
                  : "Plans are just getting started in your area. Start one and invite people around a hobby you already enjoy."}
          </Typography>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            justifyContent="center"
          >
            {isFiltered && (
              <Button
                variant="outlined"
                onClick={() => {
                  setSearchText("");
                  setTimeRange("all");
                  setSelectedHobby(null);
                  setRadiusKm(200);
                }}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Clear all filters
              </Button>
            )}
            <Button
              component={Link}
              href="/events/create"
              variant="contained"
              startIcon={<AddCircleRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
            >
              Start a plan
            </Button>
            {!hasLocation && (
              <Button
                component={Link}
                href="/profile"
                variant="outlined"
                startIcon={<EditLocationRoundedIcon />}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
              >
                Set your location
              </Button>
            )}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
