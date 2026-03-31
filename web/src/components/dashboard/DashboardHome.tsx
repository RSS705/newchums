"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
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
  { value: "all", label: "All upcoming" },
  { value: "this_week", label: "This week" },
  { value: "this_weekend", label: "This weekend" },
  { value: "next_30", label: "Next 30 days" },
];

type SortOption = { value: string; label: string };
const SORT_OPTIONS: SortOption[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "newest", label: "Newest added" },
];

const STORAGE_KEY = "nc_explore_state";

type SavedExploreState = {
  searchText?: string;
  timeRange?: string;
  radiusKm?: number;
  selectedHobbySlug?: string | null;
  sort?: string;
  personalize?: boolean;
};

function loadExploreState(): SavedExploreState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedExploreState;
  } catch {
    return null;
  }
}

function saveExploreState(state: SavedExploreState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota or SSR */ }
}

function clearExploreState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

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

  const [searchText, setSearchText] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [radiusKm, setRadiusKm] = useState(200);
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("upcoming");
  const [personalizeEnabled, setPersonalizeEnabled] = useState(true);

  const filtersRef = useRef({
    profile: null as ProfileData | null,
    searchText: "",
    timeRange: "all",
    radiusKm: 200,
    selectedHobby: null as HobbyOption | null,
    sort: "upcoming",
    personalizeEnabled: true,
  });
  const readyRef = useRef(false);
  const initializedRef = useRef(false);
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable fetch, reads filter values from ref so its identity never changes.
  const fetchEvents = useCallback(async (pageOffset: number, append: boolean) => {
    const PAGE_SIZE = 12;
    const f = filtersRef.current;

    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (f.profile?.home_lat != null && f.profile?.home_lng != null) {
      params.set("lat", String(f.profile.home_lat));
      params.set("lng", String(f.profile.home_lng));
      params.set("radius_km", String(f.radiusKm));
    }
    if (f.selectedHobby) params.set("hobby", f.selectedHobby.slug);
    if (f.timeRange !== "all") params.set("time_range", f.timeRange);
    if (f.searchText.trim()) params.set("q", f.searchText.trim());
    if (f.sort !== "upcoming") params.set("sort", f.sort);
    if (!f.personalizeEnabled) params.set("personalize", "0");
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
  }, []);

  // Load profile + interests in parallel, restore all saved state, then fetch once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [profileRes, interestsRes] = await Promise.allSettled([
        apiFetch("/profile", { auth: true }),
        apiFetch("/interests"),
      ]);
      if (cancelled) return;

      let p: ProfileData | null = null;
      let hobbies: HobbyOption[] = [];

      if (profileRes.status === "fulfilled" && profileRes.value.ok) {
        const d = (await profileRes.value.json()) as { profile: ProfileData };
        p = d.profile;
      }
      if (interestsRes.status === "fulfilled" && interestsRes.value.ok) {
        const d = (await interestsRes.value.json()) as { interests: HobbyOption[] };
        hobbies = (d.interests ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
      }
      if (cancelled) return;

      const saved = loadExploreState();
      const st = saved?.searchText ?? "";
      const tr = saved?.timeRange ?? "all";
      const rk = saved?.radiusKm ?? p?.travel_radius_km ?? 200;
      const s = saved?.sort ?? "upcoming";
      const pe = saved?.personalize !== false;
      const sh = saved?.selectedHobbySlug
        ? (hobbies.find((h) => h.slug === saved.selectedHobbySlug) ?? null)
        : null;

      filtersRef.current = { profile: p, searchText: st, timeRange: tr, radiusKm: rk, selectedHobby: sh, sort: s, personalizeEnabled: pe };

      setProfile(p);
      setHobbyOptions(hobbies);
      setSearchText(st);
      setTimeRange(tr);
      setRadiusKm(rk);
      setSelectedHobby(sh);
      setSort(s);
      setPersonalizeEnabled(pe);

      readyRef.current = true;
      initializedRef.current = true;

      await fetchEvents(0, false);
    })();
    return () => { cancelled = true; };
  }, [fetchEvents]);

  // Re-fetch when the user changes filters (skipped during init).
  useEffect(() => {
    if (!readyRef.current) return;
    filtersRef.current = { ...filtersRef.current, searchText, timeRange, radiusKm, selectedHobby, sort, personalizeEnabled };
    saveExploreState({
      searchText: searchText || undefined,
      timeRange,
      radiusKm,
      selectedHobbySlug: selectedHobby?.slug ?? null,
      sort,
      personalize: personalizeEnabled,
    });
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => { void fetchEvents(0, false); }, 150);
    return () => { if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current); };
  }, [searchText, timeRange, radiusKm, selectedHobby, sort, personalizeEnabled, fetchEvents]);

  const handleLoadMore = () => {
    filtersRef.current = { ...filtersRef.current, searchText, timeRange, radiusKm, selectedHobby, sort, personalizeEnabled };
    void fetchEvents(allEvents.length, true);
  };

  const hasLocation = profile?.home_lat != null && profile?.home_lng != null;
  const hasHobbies = (profile?.interest_items?.length ?? 0) > 0;

  const viewerHobbySlugs = useMemo(() => {
    const items = profile?.interest_items;
    if (!items?.length) return undefined;
    return new Set(items.map((i) => i.slug));
  }, [profile?.interest_items]);

  const defaultRadiusKm = profile?.travel_radius_km ?? 200;
  const isFiltered =
    searchText.trim() !== "" ||
    selectedHobby != null ||
    timeRange !== "all" ||
    sort !== "upcoming" ||
    !personalizeEnabled ||
    (hasLocation && radiusKm !== defaultRadiusKm);

  const locationLabel = useMemo(() => {
    if (!profile?.home_city) return null;
    const parts = profile.home_city.split(",");
    return parts.length > 1 ? parts.slice(0, 2).join(",").trim() : parts[0].trim();
  }, [profile?.home_city]);

  const clearAllFilters = () => {
    setSearchText("");
    setTimeRange("all");
    setSelectedHobby(null);
    setRadiusKm(defaultRadiusKm);
    setSort("upcoming");
    setPersonalizeEnabled(true);
    clearExploreState();
  };

  return (
    <Stack spacing={{ xs: 2.5, sm: 3.5 }}>
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
          {/* Search + sort + filter toggle */}
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

          {/* Time + sort chips */}
          <Stack direction="row" flexWrap="wrap" gap={0.75} alignItems="center">
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
            <Box sx={{ borderLeft: "1px solid", borderColor: "divider", height: 20, mx: 0.5 }} />
            {SORT_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                size="small"
                variant={sort === opt.value ? "filled" : "outlined"}
                onClick={() => setSort(opt.value)}
                sx={{
                  borderRadius: 2,
                  fontWeight: 500,
                  fontSize: "0.8125rem",
                  ...(sort === opt.value
                    ? { bgcolor: "secondary.light", color: "secondary.dark", borderColor: "secondary.light" }
                    : { borderColor: "divider", color: "text.secondary" }),
                  "&:hover": { bgcolor: sort === opt.value ? "secondary.light" : "action.hover" },
                }}
              />
            ))}
            {hasHobbies && (
              <>
                <Box sx={{ borderLeft: "1px solid", borderColor: "divider", height: 20, mx: 0.5 }} />
                <Tooltip title={personalizeEnabled ? "Hobby-matched plans are prioritized. Click to turn off." : "Hobby personalization is off. Click to turn on."} arrow>
                  <Chip
                    icon={<AutoAwesomeRoundedIcon sx={{ fontSize: "0.9375rem !important" }} />}
                    label="Personalized"
                    size="small"
                    variant={personalizeEnabled ? "filled" : "outlined"}
                    onClick={() => setPersonalizeEnabled((v) => !v)}
                    sx={{
                      borderRadius: 2,
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                      ...(personalizeEnabled
                        ? { bgcolor: "primary.light", color: "primary.dark", borderColor: "primary.light", "& .MuiChip-icon": { color: "primary.main" } }
                        : { borderColor: "divider", color: "text.secondary", "& .MuiChip-icon": { color: "text.secondary" } }),
                      "&:hover": { bgcolor: personalizeEnabled ? "primary.light" : "action.hover" },
                    }}
                  />
                </Tooltip>
              </>
            )}
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
                  onClick={clearAllFilters}
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
      {profile !== null && !hasLocation && (
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
      {loading && allEvents.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : allEvents.length > 0 ? (
        <>
          <Grid container spacing={2}>
            {allEvents.map((event) => (
              <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                <EventCard event={event} viewerHobbySlugs={viewerHobbySlugs} />
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
                onClick={clearAllFilters}
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
