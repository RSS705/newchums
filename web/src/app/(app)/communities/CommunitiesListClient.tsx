"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import EditLocationRoundedIcon from "@mui/icons-material/EditLocationRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import DistanceSelect from "@/components/common/DistanceSelect";
import { apiFetch } from "@/lib/apiClient";
import { effectiveCategorySet } from "@/lib/interestUtils";
import CommunityListCard, { type CommunityListItem as Community } from "./CommunityListCard";

type HobbyOption = { slug: string; name: string };

type ProfileData = {
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_radius_km: number;
  interest_items?: { slug: string; name: string; category?: string | null }[];
};

const PAGE_SIZE = 20;

export default function CommunitiesListClient() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [view, setView] = useState<"all" | "mine">("all");
  const [radiusKm, setRadiusKm] = useState(200);
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [personalizeEnabled, setPersonalizeEnabled] = useState(true);

  const filtersRef = useRef({
    profile: null as ProfileData | null,
    searchText: "",
    view: "all" as "all" | "mine",
    radiusKm: 200,
    selectedHobby: null as HobbyOption | null,
    personalizeEnabled: true,
  });
  const readyRef = useRef(false);
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCommunities = useCallback(async (pageOffset: number, append: boolean) => {
    const f = filtersRef.current;

    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (f.view === "mine") {
      params.set("mine", "1");
    } else {
      // Discovery mode: apply distance filter for offline communities
      if (f.profile?.home_lat != null && f.profile?.home_lng != null) {
        params.set("lat", String(f.profile.home_lat));
        params.set("lng", String(f.profile.home_lng));
        params.set("radius_km", String(f.radiusKm));
      }
      if (!f.personalizeEnabled) params.set("personalize", "0");
    }
    if (f.selectedHobby) params.set("hobby", f.selectedHobby.slug);
    if (f.searchText.trim()) params.set("q", f.searchText.trim());
    params.set("offset", String(pageOffset));
    params.set("limit", String(PAGE_SIZE));

    try {
      const res = await apiFetch(`/communities?${params.toString()}`, { auth: true });
      if (res.ok) {
        const data = (await res.json()) as { communities: Community[]; hasMore: boolean };
        if (append) {
          setCommunities((prev) => [...prev, ...(data.communities ?? [])]);
        } else {
          setCommunities(data.communities ?? []);
        }
        setHasMore(data.hasMore ?? false);
      }
    } catch { /* ignore */ }

    if (append) setLoadingMore(false);
    else setLoading(false);
  }, []);

  // Load profile + interests, then fetch
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

      const rk = p?.travel_radius_km ?? 200;
      filtersRef.current = { profile: p, searchText: "", view: "all", radiusKm: rk, selectedHobby: null, personalizeEnabled: true };

      setProfile(p);
      setHobbyOptions(hobbies);
      setRadiusKm(rk);

      readyRef.current = true;
      await fetchCommunities(0, false);
    })();
    return () => { cancelled = true; };
  }, [fetchCommunities]);

  // Re-fetch on filter change
  useEffect(() => {
    if (!readyRef.current) return;
    filtersRef.current = { ...filtersRef.current, searchText, view, radiusKm, selectedHobby, personalizeEnabled };
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => { void fetchCommunities(0, false); }, 150);
    return () => { if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current); };
  }, [searchText, view, radiusKm, selectedHobby, personalizeEnabled, fetchCommunities]);

  const handleLoadMore = () => {
    filtersRef.current = { ...filtersRef.current, searchText, view, radiusKm, selectedHobby, personalizeEnabled };
    void fetchCommunities(communities.length, true);
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
    setSelectedHobby(null);
    setRadiusKm(defaultRadiusKm);
    setPersonalizeEnabled(true);
  };

  // Active-filter count for the labeled Filters button. Counts what sits
  // BEHIND the panel toggle (distance + hobby) so the pill reads as "you
  // have N filters hidden behind this button". Search and the All/Yours
  // toggle are surfaced inline on the main row; Personalize is a chip on
  // its own row, so they don't get double-counted here.
  const activeFilterCount =
    (selectedHobby ? 1 : 0) +
    (view === "all" && hasLocation && radiusKm !== defaultRadiusKm ? 1 : 0);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Warm-wash hero matching the Explore and Your Plans
          surfaces so the three primary logged-in pages read as one
          product. Eyebrow + large H1 mirror the discovery-header
          pattern in docs/UI_Patterns.md. The "Create a community" CTA
          on the right gets the warm-tinted shadow and reads as the
          page's primary action. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
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
                <GroupsRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
                Find your people
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
              Communities
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
              {hasLocation
                ? `Hobby clubs, game stores, and groups${locationLabel ? ` near ${locationLabel}` : ""}, hand-picked around the things you enjoy.`
                : "Hobby clubs, game stores, and groups around the things you enjoy. Find one or start your own."}
            </Typography>
          </Stack>
          <Button
            component={Link}
            href="/communities/create"
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
            Create a community
          </Button>
        </Stack>
      </Paper>

      {/* Filter bar. Bigger search, labeled Filters button with active
          count pill, and a single Personalized chip row that works at
          every breakpoint (the previous mobile/desktop dual-render path
          was redundant once the row below got its own breathing room).
          Matches the discovery filter shell pattern in
          docs/UI_Patterns.md. */}
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
          {/* Row 1: search field with primary presence. On xs it sits on
              its own row so it keeps a readable width; on sm+ it shares
              row 1 with the All/Yours scope toggle and the labeled
              Filters button. */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
            <TextField
              id="communities-search-input"
              placeholder="Search communities by name, hobby, or place..."
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
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              <ToggleButtonGroup
                value={view}
                exclusive
                onChange={(_, v) => { if (v) setView(v); }}
                size="small"
                sx={{
                  flexShrink: 0,
                  "& .MuiToggleButton-root": {
                    border: "1px solid",
                    borderColor: "grey.200",
                  },
                  "& .MuiToggleButton-root.Mui-selected": {
                    borderColor: "primary.main",
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    fontWeight: 700,
                    "&:hover": { bgcolor: "primary.light" },
                  },
                }}
              >
                <ToggleButton value="all" sx={{ textTransform: "none", px: 2, borderRadius: 2, py: 1 }}>All</ToggleButton>
                <ToggleButton value="mine" sx={{ textTransform: "none", px: 2, borderRadius: 2, py: 1 }}>Yours</ToggleButton>
              </ToggleButtonGroup>
              <Button
                onClick={() => setFiltersOpen((p) => !p)}
                aria-expanded={filtersOpen}
                aria-controls="communities-filters-panel"
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
                  px: { xs: 1.75, sm: 2 },
                  py: { xs: 1, sm: 1 },
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
          </Stack>

          {/* Personalized chip. Single render at every breakpoint, no
              longer split between an xs-only and sm-only branch. */}
          {hasHobbies && view === "all" && (
            <Stack direction="row" gap={0.75} alignItems="center">
              <Tooltip title={personalizeEnabled ? "Communities matching your hobbies are shown first. Click to turn off." : "Hobby personalization is off. Click to turn on."} arrow>
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
            </Stack>
          )}

          {/* Expanded filters */}
          {filtersOpen && (
            <Stack
              id="communities-filters-panel"
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "flex-end" }}
              sx={{
                pt: 1.75,
                borderTop: "1px solid",
                borderColor: "grey.100",
              }}
            >
              {view === "all" && (
                <DistanceSelect
                  value={radiusKm}
                  onChange={setRadiusKm}
                  helperText={null}
                  sx={{ flex: 1, minWidth: { sm: 160 } }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: { sm: 180 } }}>
                <Typography
                  component="label"
                  htmlFor="communities-hobby-filter"
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
                      id="communities-hobby-filter"
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

      {/* Location nudge. Warm-wash treatment matching Explore so the
          two surfaces feel like the same product. */}
      {profile !== null && !hasLocation && view === "all" && (
        <Paper
          variant="outlined"
          sx={{
            p: { xs: 2.5, sm: 3 },
            borderRadius: 3,
            borderColor: "primary.light",
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            gap: { xs: 1.5, sm: 2.5 },
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(230, 91, 19, 0.18)",
            }}
          >
            <EditLocationRoundedIcon sx={{ color: "primary.contrastText", fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25, fontSize: "1rem" }}>
              Set your location for better results
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              We&apos;ll prioritize communities near you and hide those that are too far away.
            </Typography>
          </Box>
          <Button
            component={Link}
            href="/profile?focus=location"
            variant="contained"
            sx={{
              flexShrink: 0,
              textTransform: "none",
              fontWeight: 600,
              whiteSpace: "nowrap",
              borderRadius: 2.5,
              boxShadow: "none",
              alignSelf: { xs: "stretch", sm: "auto" },
              "&:hover": { boxShadow: "none", opacity: 0.92 },
            }}
          >
            Update profile
          </Button>
        </Paper>
      )}

      {/* Community feed */}
      {loading && communities.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : communities.length > 0 ? (
        <>
          <Stack spacing={2}>
            {communities.map((c) => (
              <CommunityListCard
                key={c.id}
                community={c}
                viewerHobbyCategories={viewerHobbyCategories}
                showJoinedChip={view === "all"}
              />
            ))}
          </Stack>

          {/* Load more */}
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
        /* Empty state. Wrapped in an outlined Paper with a soft warm
           icon orb so the empty surface still feels like part of the
           page rather than orphaned helper text. */
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
                <PeopleRoundedIcon sx={{ fontSize: 36, color: "primary.main" }} />
              </Box>
            }
            title={
              view === "mine"
                ? "You haven't joined any communities yet"
                : isFiltered
                  ? "No communities matched your filters"
                  : "No communities found nearby"
            }
            description={
              view === "mine"
                ? "Browse what's available or start your own community."
                : isFiltered
                  ? "Try widening the distance, removing a hobby filter, or clearing filters to see more."
                  : hasLocation
                    ? "There aren't any communities in your area yet. Start one and bring people together."
                    : "Be the first to create a community and bring people together."
            }
            action={
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                {view === "mine" && (
                  <Button
                    variant="outlined"
                    onClick={() => setView("all")}
                    sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
                  >
                    Browse communities
                  </Button>
                )}
                {isFiltered && view !== "mine" && (
                  <Button
                    variant="outlined"
                    onClick={clearAllFilters}
                    sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
                  >
                    Clear all filters
                  </Button>
                )}
                <Button
                  component={Link}
                  href="/communities/create"
                  variant="contained"
                  startIcon={<AddCircleRoundedIcon />}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                >
                  Create a community
                </Button>
              </Stack>
            }
          />
        </Paper>
      )}
    </Stack>
  );
}
