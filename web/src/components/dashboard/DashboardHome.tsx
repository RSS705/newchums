"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import EditLocationRoundedIcon from "@mui/icons-material/EditLocationRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Link from "next/link";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import RecentlyHappenedSection from "@/components/events/RecentlyHappenedSection";
import EventCardSkeleton from "@/components/ui/EventCardSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import DistanceSelect from "@/components/common/DistanceSelect";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import { apiFetch } from "@/lib/apiClient";
import { effectiveCategorySet } from "@/lib/interestUtils";
import { createEventHref } from "@/config/nav";

type HobbyOption = { slug: string; name: string };
type LocalSignal = { hobbyName: string; count: number };

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
  interest_items?: { slug: string; name: string; category?: string | null }[];
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
  // One-shot flag flipped to true once the initial /profile + /interests
  // calls have resolved (regardless of whether the events fetch has come
  // back yet). Used to gate the subtitle and filter-bar skeletons so they
  // only show on first load, not on every subsequent filter-triggered
  // re-fetch. Without this, clicking a filter chip would briefly swap the
  // subtitle Typography for a Skeleton of a different height, shifting
  // the page even though the resulting subtitle text is identical.
  const [initialReady, setInitialReady] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timeRange, setTimeRange] = useState("all");
  const [radiusKm, setRadiusKm] = useState(200);
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState("upcoming");
  const [personalizeEnabled, setPersonalizeEnabled] = useState(true);
  const [localSignal, setLocalSignal] = useState<LocalSignal | null>(null);

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
      setSearchInputValue(st);
      setTimeRange(tr);
      setRadiusKm(rk);
      setSelectedHobby(sh);
      setSort(s);
      setPersonalizeEnabled(pe);
      setInitialReady(true);

      readyRef.current = true;
      initializedRef.current = true;

      await fetchEvents(0, false);

      // Fetch the local-signal in parallel (fire-and-forget, degrades silently)
      const sigParams = new URLSearchParams();
      if (sh) sigParams.set("hobby", sh.slug);
      apiFetch(`/explore/local-signal?${sigParams.toString()}`, { auth: true })
        .then((r) => r.json())
        .then((d: unknown) => {
          if (cancelled) return;
          const data = d as { ok: boolean; signal: LocalSignal | null };
          if (data.ok) setLocalSignal(data.signal);
        })
        .catch(() => {});
    })();
    return () => { cancelled = true; };
  }, [fetchEvents]);

  // Refresh profile + events when the user updates their profile on another
  // page (e.g. setting home location) and returns via Next.js router cache,
  // which would otherwise leave this component's `profile` state stale.
  useEffect(() => {
    const onProfileChanged = async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (!res.ok) return;
        const d = (await res.json()) as { profile: ProfileData };
        const p = d.profile;
        setProfile(p);
        filtersRef.current = { ...filtersRef.current, profile: p };
        if (readyRef.current) void fetchEvents(0, false);
      } catch { /* ignore */ }
    };
    window.addEventListener("nc:profile-changed", onProfileChanged);
    return () => window.removeEventListener("nc:profile-changed", onProfileChanged);
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

  // Fetch the local-signal whenever the hobby filter or profile changes.
  useEffect(() => {
    if (!readyRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (selectedHobby) params.set("hobby", selectedHobby.slug);
        const res = await apiFetch(`/explore/local-signal?${params.toString()}`, { auth: true });
        if (cancelled) return;
        const data = (await res.json()) as { ok: boolean; signal: LocalSignal | null };
        if (data.ok) setLocalSignal(data.signal);
      } catch { /* degrade silently */ }
    })();
    return () => { cancelled = true; };
  }, [selectedHobby]);

  const handleLoadMore = () => {
    filtersRef.current = { ...filtersRef.current, searchText, timeRange, radiusKm, selectedHobby, sort, personalizeEnabled };
    void fetchEvents(allEvents.length, true);
  };

  const hasLocation = profile?.home_lat != null && profile?.home_lng != null;
  const hasHobbies = (profile?.interest_items?.length ?? 0) > 0;

  const viewerHobbyCategories = useMemo(() => {
    const items = profile?.interest_items;
    if (!items?.length) return undefined;
    return effectiveCategorySet(items);
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
    setSearchInputValue("");
    setTimeRange("all");
    setSelectedHobby(null);
    setRadiusKm(defaultRadiusKm);
    setSort("upcoming");
    setPersonalizeEnabled(true);
    clearExploreState();
  };

  // Active-filter count for the labeled Filters button. Only counts what
  // sits BEHIND the panel toggle (distance + hobby) so the pill reads as
  // "you have N filters hidden behind this button". Time/sort/personalize
  // are surfaced inline on the chip row below and don't need to be
  // double-counted here.
  const activeFilterCount =
    (selectedHobby ? 1 : 0) +
    (hasLocation && radiusKm !== defaultRadiusKm ? 1 : 0);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* ── Header. Lifted from a plain title block to an outlined hero
          card with a soft warm wash so the page reads as a curated
          discovery surface rather than a database listing. Eyebrow +
          large H1 mirror the discovery-header pattern in
          docs/UI_Patterns.md. The "Start a plan" CTA on the right gives
          the page a clear primary action even when the feed is dense. */}
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
                <ExploreRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
                Discover
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
              {greetingName ? `Welcome back, ${greetingName}` : "Explore"}
            </Typography>
            {!initialReady ? (
              // Hold the subtitle until /profile resolves so `hasLocation`
              // and `locationLabel` have settled. After the initial load
              // we keep showing the real subtitle through subsequent
              // filter-triggered re-fetches, since the subtitle text only
              // depends on profile (which doesn't change) and not on the
              // events fetch. Gating on `!initialReady` instead of
              // `loading` prevents a layout-shifting Skeleton swap on
              // every filter chip click.
              <Skeleton
                variant="text"
                width={300}
                sx={{ fontSize: { xs: "0.9375rem", sm: "1rem" }, maxWidth: "100%" }}
              />
            ) : (
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{
                  fontSize: { xs: "0.9375rem", sm: "1rem" },
                  lineHeight: 1.6,
                  maxWidth: 560,
                }}
              >
                {hasLocation
                  ? `Plans and gatherings${locationLabel ? ` near ${locationLabel}` : ""}, hand-picked around the hobbies you enjoy.`
                  : "Find plans and gatherings around the hobbies you enjoy."}
              </Typography>
            )}
          </Stack>
          <Button
            component={Link}
            href={createEventHref}
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

      {/* ── Location nudge ──────────────────────────────────────────
          Above the filter bar on purpose: it shapes what the feed shows,
          so it belongs with the controls rather than wedged between them
          and the results. The whole row is the link: one short line, one
          tap target, and the label can be text.primary (12:1) instead of
          brand-on-tint, which could not clear AA at this size. */}
      {profile !== null && !hasLocation && (
        <Paper
          component={Link}
          href="/profile?focus=location"
          variant="outlined"
          sx={{
            px: { xs: 1.75, sm: 2.25 },
            py: { xs: 1.25, sm: 1.5 },
            borderRadius: 3,
            borderColor: "primary.light",
            bgcolor: "#fff7ed",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: { xs: 1.25, sm: 1.75 },
            textDecoration: "none",
            transition: "background-color 0.15s ease",
            "&:hover": { bgcolor: "#ffeedd" },
          }}
        >
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <EditLocationRoundedIcon sx={{ color: "primary.contrastText", fontSize: 20 }} />
          </Box>
          <Typography
            variant="body2"
            sx={{ flex: 1, minWidth: 0, fontWeight: 600, lineHeight: 1.45, color: "text.primary" }}
          >
            Add your location to see plans near you
          </Typography>
          <ChevronRightRoundedIcon sx={{ color: "primary.dark", fontSize: 22, flexShrink: 0 }} />
        </Paper>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      {!initialReady ? (
        // Skeleton that matches the real filter row's outer frame and rough
        // chip layout so the page doesn't visibly shift when loading ends.
        // Prevents the "personalize chip pops in once profile loads" and
        // "hobby Autocomplete populates" micro-pops from compounding with
        // the subtitle-and-cards transition. Gated on `!initialReady`
        // (one-shot init flag) rather than `loading` so subsequent
        // filter-triggered re-fetches don't replace the real filter bar
        // with a skeleton on every chip click.
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 1.75, sm: 2.25 },
            borderRadius: 3,
            borderColor: "grey.200",
            bgcolor: "background.paper",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <Stack spacing={1.75}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
              <Skeleton variant="rounded" height={48} sx={{ flex: 1, borderRadius: 2.5 }} />
              <Skeleton variant="rounded" width={120} height={48} sx={{ borderRadius: 2.5, flexShrink: 0 }} />
            </Stack>
            <Stack direction="row" gap={0.75} alignItems="center" sx={{ flexWrap: { xs: "nowrap", sm: "wrap" } }}>
              {[72, 88, 96, 88, 112, 56, 88, 104].map((w, i) => (
                <Skeleton key={i} variant="rounded" width={w} height={24} sx={{ borderRadius: 2, flexShrink: 0 }} />
              ))}
            </Stack>
          </Stack>
        </Paper>
      ) : (
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 1.75, sm: 2.25 },
          borderRadius: 3,
          borderColor: "grey.200",
          bgcolor: "background.paper",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <Stack spacing={1.75}>
          {/* Search + Filters toggle. Bigger search field with primary
              presence; labeled Filters button (not a bare icon) with an
              active-count pill so the viewer can tell at a glance whether
              the panel hides any committed filters. Matches the discovery
              filter shell pattern in docs/UI_Patterns.md. */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
            <TextField
              id="explore-search-input"
              placeholder="Search plans by title, hobby, or place..."
              value={searchInputValue}
              onChange={(e) => {
                const v = e.target.value;
                setSearchInputValue(v);
                if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                searchDebounceRef.current = setTimeout(() => setSearchText(v), 200);
              }}
              fullWidth
              variant="outlined"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon sx={{ fontSize: 22, color: "text.secondary" }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2.5,
                  fontSize: "1rem",
                  bgcolor: "background.default",
                  "& fieldset": { borderColor: "grey.200" },
                  "&:hover fieldset": { borderColor: "grey.300" },
                },
                "& .MuiOutlinedInput-input": {
                  py: { xs: 1.25, sm: 1.5 },
                },
              }}
            />
            <Button
              onClick={() => setFiltersOpen((p) => !p)}
              aria-expanded={filtersOpen}
              aria-controls="explore-filters-panel"
              startIcon={<TuneRoundedIcon />}
              sx={{
                flexShrink: 0,
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: filtersOpen || activeFilterCount > 0 ? "primary.main" : "grey.200",
                color: filtersOpen || activeFilterCount > 0 ? "primary.main" : "text.secondary",
                bgcolor: filtersOpen ? "primary.light" : "transparent",
                px: { xs: 2, sm: 2.25 },
                py: { xs: 1, sm: 1.25 },
                justifyContent: { xs: "center", sm: "flex-start" },
                "&:hover": {
                  bgcolor: filtersOpen ? "primary.light" : "grey.50",
                  borderColor: "primary.main",
                },
              }}
            >
              <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                Filters
                {activeFilterCount > 0 && (
                  <Box
                    component="span"
                    sx={{
                      minWidth: 18,
                      height: 18,
                      px: 0.625,
                      borderRadius: "999px",
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      fontSize: "0.6875rem",
                      fontWeight: 700,
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {activeFilterCount}
                  </Box>
                )}
              </Box>
            </Button>
          </Stack>

          {/* Time + sort chips */}
          <Stack
            direction="row"
            gap={0.75}
            alignItems="center"
            sx={{
              flexWrap: { xs: "nowrap", sm: "wrap" },
              overflowX: { xs: "auto", sm: "visible" },
              scrollbarWidth: "none",
              "&::-webkit-scrollbar": { display: "none" },
              WebkitOverflowScrolling: "touch",
              pb: { xs: 0.5, sm: 0 },
            }}
          >
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
              id="explore-filters-panel"
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "flex-end" }}
              sx={{
                pt: 1.75,
                borderTop: "1px solid",
                borderColor: "grey.100",
              }}
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
      )}

      {/* ── Event feed ──────────────────────────────────────────────── */}
      {loading && allEvents.length === 0 ? (
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
              <EventCardSkeleton />
            </Grid>
          ))}
        </Grid>
      ) : allEvents.length > 0 ? (
        <>
          <Grid container spacing={2}>
            {allEvents.map((event) => (
              <Grid key={event.id} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: "flex" }}>
                <EventCard event={event} viewerHobbyCategories={viewerHobbyCategories} />
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
        /* ── Empty state. Wrapped in an outlined Paper with a soft warm
              icon orb so the empty surface still feels like part of the
              page rather than orphaned helper text. ─────────────────── */
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
                <ExploreRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
              </Box>
            }
            title={isFiltered ? "Nothing matched this time" : "No plans yet"}
            description={
              isFiltered
                ? "Try widening the time window, removing a hobby filter, or clearing filters to see more plans."
                : !hasHobbies
                  ? "Post one and share the link with your group, or add a few hobbies to your profile so we can show you relevant plans nearby."
                  : "Post one and share the link with your group."
            }
            action={
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {isFiltered && (
                  <Button
                    variant="outlined"
                    onClick={clearAllFilters}
                    sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
                  >
                    Clear all filters
                  </Button>
                )}
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
                <Button
                  component={Link}
                  href={createEventHref}
                  variant="contained"
                  startIcon={<AddCircleRoundedIcon />}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                >
                  Start a plan
                </Button>
              </Stack>
            }
          />
        </Paper>
      )}

      {/* ── Recently happened (social proof, secondary section) ──────
          Renders below the primary upcoming feed. Always shows public-only
          past plans regardless of the viewer's community memberships, this
          surface is intended as a "real gatherings happened recently"
          signal, not a personal history view. Hidden entirely when there
          are no qualifying past plans so an empty block doesn't intrude
          on the upcoming-plans-first experience. */}
      {!loading && initialReady && (
        <RecentlyHappenedSection
          variant="logged_in_explore"
          viewerHobbyCategories={viewerHobbyCategories}
        />
      )}

      {/* ── Local interest signal ──────────────────────────────────── */}
      {localSignal && !loading && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            pt: 2,
            pb: 1,
          }}
        >
          <PeopleRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
          >
            {localSignal.count} active {localSignal.count === 1 ? "person" : "people"} near you{" "}
            {localSignal.count === 1 ? "is" : "are"} into {localSignal.hobbyName}
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
