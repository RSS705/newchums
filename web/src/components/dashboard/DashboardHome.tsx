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
  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [loading, setLoading] = useState(true);
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
          setHobbyOptions(data.interests ?? []);
        }
      } catch { /* ignore */ }
    };
    loadProfile();
    loadHobbies();
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!profileLoaded) return;
    setLoading(true);

    const params = new URLSearchParams();
    if (profile?.home_lat != null && profile?.home_lng != null) {
      params.set("lat", String(profile.home_lat));
      params.set("lng", String(profile.home_lng));
      params.set("radius_km", String(radiusKm));
    }
    if (selectedHobby) params.set("hobby", selectedHobby.slug);
    if (timeRange !== "all") params.set("time_range", timeRange);
    if (searchText.trim()) params.set("q", searchText.trim());

    try {
      const res = await apiFetch(`/events/explore?${params.toString()}`, { auth: true });
      if (res.ok) {
        const data = (await res.json()) as { events: PlanEvent[] };
        setEvents(data.events ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [profileLoaded, profile, radiusKm, selectedHobby, timeRange, searchText]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

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
          borderRadius: { xs: 2, sm: 2.5 },
          borderColor: "divider",
          bgcolor: "background.paper",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}
      >
        <Stack spacing={1.5}>
          {/* Search + toggle */}
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
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
              sx={{ pt: 0.5 }}
            >
              <DistanceSelect
                value={radiusKm}
                onChange={setRadiusKm}
                label={undefined}
                helperText={null}
                sx={{ flex: 1, minWidth: { sm: 160 } }}
              />
              <Autocomplete
                options={hobbyOptions}
                getOptionLabel={(o) => o.name}
                value={selectedHobby}
                onChange={(_, v) => setSelectedHobby(v)}
                isOptionEqualToValue={(a, b) => a.slug === b.slug}
                size="small"
                sx={{ flex: 1, minWidth: { sm: 180 } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Filter by hobby"
                    variant="outlined"
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                )}
              />
              {isFiltered && (
                <Button
                  size="small"
                  onClick={() => {
                    setSearchText("");
                    setTimeRange("all");
                    setSelectedHobby(null);
                    setRadiusKm(profile?.travel_radius_km ?? 25);
                  }}
                  sx={{ textTransform: "none", whiteSpace: "nowrap", alignSelf: { xs: "flex-start", sm: "center" } }}
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
            p: 2.5,
            borderRadius: 2,
            borderColor: "secondary.light",
            bgcolor: "rgba(244, 180, 0, 0.04)",
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            gap: 2,
          }}
        >
          <EditLocationRoundedIcon sx={{ color: "secondary.main", fontSize: 28 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.25 }}>
              Set your home location for better results
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Adding your location helps us show plans happening near you first.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/profile"
            variant="outlined"
            size="small"
            sx={{ textTransform: "none", fontWeight: 600, whiteSpace: "nowrap" }}
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
      ) : events.length > 0 ? (
        <Grid container spacing={2}>
          {events.map((event) => (
            <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <EventCard event={event} />
            </Grid>
          ))}
        </Grid>
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
            sx={{ fontSize: 56, color: "primary.light", mb: 2, opacity: 0.7 }}
          />
          <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
            {isFiltered ? "No plans match your filters" : "No upcoming plans nearby yet"}
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 3, maxWidth: 440, mx: "auto", lineHeight: 1.6 }}
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
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Start a plan
            </Button>
            {!hasLocation && (
              <Button
                component={Link}
                href="/profile"
                variant="outlined"
                startIcon={<EditLocationRoundedIcon />}
                sx={{ textTransform: "none", fontWeight: 600 }}
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
