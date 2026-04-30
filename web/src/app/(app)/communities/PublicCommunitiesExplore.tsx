"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import Link from "next/link";
import { AppCard, EmptyState } from "@/components/ui";
import DistanceSelect from "@/components/common/DistanceSelect";
import PlacesAutocompleteInput, { formatPlaceDisplay, type PlaceResult } from "@/components/common/PlacesAutocompleteInput";
import { apiFetch } from "@/lib/apiClient";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import CommunityListCard, { type CommunityListItem } from "./CommunityListCard";

type HobbyOption = { slug: string; name: string };

const PAGE_SIZE = 20;
const DEFAULT_RADIUS_KM = 200;

/**
 * Public (logged-out) Communities discovery feed.
 *
 *  Mirrors `CommunitiesListClient` visually but with a much narrower filter
 *  set: text search + manual location + hobby + distance. No "Yours" toggle,
 *  no personalization, no "Create a community" primary action, no profile
 *  prefill (there's no viewer). The whole surface is calm-CTA by design:
 *  click-through to the community detail page works directly (public detail
 *  already serves restricted previews for private comms, and this list only
 *  shows public comms anyway); anything that would require an account (join,
 *  start a plan) is handled by the detail page via `/login?next=...`.
 *
 *  Data comes from `GET /public/communities`, which enforces the privacy
 *  contract server-side:
 *    - only `visibility = 'public'` communities
 *    - only `status = 'active'` communities
 *    - no viewer-scoped fields
 *
 *  Location input uses the Google Places autocomplete (city / address) the
 *  same way the authenticated profile flow does, per the requirement that
 *  there be no browser geolocation prompt. Online communities always pass
 *  through the distance filter regardless of what the viewer enters.
 */
export default function PublicCommunitiesExplore() {
  const [communities, setCommunities] = useState<CommunityListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search state + debounce (300ms matches the authenticated feed pattern).
  const [searchText, setSearchText] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual location picker state. `locationInput` is the text shown in the
  // Places input; `pickedLocation` is the last result the user committed
  // (non-null → we have coordinates). Clearing the input clears the pick.
  const [locationInput, setLocationInput] = useState("");
  const [pickedLocation, setPickedLocation] = useState<PlaceResult | null>(null);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);

  // Hobby filter (single-select, matches the authenticated "Hobby" filter).
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtersRef = useRef({
    searchText: "",
    picked: null as PlaceResult | null,
    radiusKm: DEFAULT_RADIUS_KM,
    selectedHobby: null as HobbyOption | null,
  });
  const readyRef = useRef(false);
  const filterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCommunities = useCallback(async (pageOffset: number, append: boolean) => {
    const f = filtersRef.current;

    if (append) setLoadingMore(true);
    else setLoading(true);

    const params = new URLSearchParams();
    if (f.picked) {
      params.set("lat", String(f.picked.lat));
      params.set("lng", String(f.picked.lng));
      params.set("radius_km", String(f.radiusKm));
    }
    if (f.selectedHobby) params.set("hobby", f.selectedHobby.slug);
    if (f.searchText.trim()) params.set("q", f.searchText.trim());
    params.set("offset", String(pageOffset));
    params.set("limit", String(PAGE_SIZE));

    try {
      const res = await apiFetch(`/public/communities?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { communities: CommunityListItem[]; hasMore: boolean };
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

  // Load hobby options + kick off the initial fetch. `/interests` is a
  // public endpoint (populates the auth signup flow), safe to call without
  // a session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/interests");
        if (!cancelled && res.ok) {
          const d = (await res.json()) as { interests?: HobbyOption[] };
          const sorted = (d.interests ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
          setHobbyOptions(sorted);
        }
      } catch { /* non-fatal */ }

      readyRef.current = true;
      await fetchCommunities(0, false);
    })();
    return () => { cancelled = true; };
  }, [fetchCommunities]);

  // Lazy-load Google Places so the autocomplete works when the user opens
  // the filters. Non-fatal if the script fails (viewer can still use text
  // search / hobby filter).
  useEffect(() => {
    loadGooglePlacesScript().catch(() => { /* surface nothing to the user */ });
  }, []);

  // Debounced re-fetch on filter change.
  useEffect(() => {
    if (!readyRef.current) return;
    filtersRef.current = {
      searchText,
      picked: pickedLocation,
      radiusKm,
      selectedHobby,
    };
    if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current);
    filterDebounceRef.current = setTimeout(() => { void fetchCommunities(0, false); }, 150);
    return () => { if (filterDebounceRef.current) clearTimeout(filterDebounceRef.current); };
  }, [searchText, pickedLocation, radiusKm, selectedHobby, fetchCommunities]);

  const handleLoadMore = () => {
    filtersRef.current = {
      searchText,
      picked: pickedLocation,
      radiusKm,
      selectedHobby,
    };
    void fetchCommunities(communities.length, true);
  };

  const isFiltered =
    searchText.trim() !== "" ||
    selectedHobby != null ||
    pickedLocation != null ||
    radiusKm !== DEFAULT_RADIUS_KM;

  const clearAllFilters = () => {
    setSearchText("");
    setSearchInputValue("");
    setSelectedHobby(null);
    setLocationInput("");
    setPickedLocation(null);
    setRadiusKm(DEFAULT_RADIUS_KM);
  };

  // Active-filter count drives the small dot/badge on the Filters button so
  // the viewer can tell at a glance whether collapsing the panel hides any
  // committed filters. Search lives on the main row and the Near input
  // lives inside the panel, so anything that would change the result set
  // is counted here.
  const activeFilterCount =
    (selectedHobby ? 1 : 0) +
    (pickedLocation ? 1 : 0) +
    (radiusKm !== DEFAULT_RADIUS_KM ? 1 : 0);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Lifted from a plain title block to an outlined hero card
          with a soft warm wash so the page reads as a curated directory
          rather than a database listing. The gradient + eyebrow + larger
          H1 mirror the participant hero card pattern in UI_Patterns.md
          (warm gradient as a presence cue, not a brand recolor). */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 4 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        }}
      >
        <Stack spacing={1.25}>
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
              fontSize: { xs: "2rem", sm: "2.5rem" },
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              color: "text.primary",
            }}
          >
            Local communities on NewChums
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.9375rem", sm: "1rem" },
              lineHeight: 1.6,
              maxWidth: 640,
            }}
          >
            Browse hobby clubs, game stores, and groups in your area. Tap a community to see what it&apos;s about and the plans it has coming up, or sign up to join one.
          </Typography>
        </Stack>
      </Paper>

      {/* Discovery controls. Reads as a primary tool rather than a plain
          input row: a more present search field, a clearly-labeled
          Filters button with an active-filter dot, and a panel that
          opens beneath. Functional shape of the controls (debounced
          search, manual location, hobby, distance, clear) is unchanged
          from the previous implementation. */}
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
            <TextField
              id="public-communities-search-input"
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
            <Button
              onClick={() => setFiltersOpen((p) => !p)}
              aria-expanded={filtersOpen}
              aria-controls="public-communities-filters-panel"
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

          {filtersOpen && (
            <Stack
              id="public-communities-filters-panel"
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "flex-end" }}
              sx={{
                pt: 1.75,
                borderTop: "1px solid",
                borderColor: "grey.100",
              }}
            >
              {/* Manual location entry. Typing without committing a Places
                  suggestion resets the pick (and the distance filter)
                  because we need the coordinates to do distance math.
                  There is deliberately no "use my location" button here,
                  per the spec. */}
              <Box sx={{ flex: 1, minWidth: { sm: 220 } }}>
                <PlacesAutocompleteInput
                  value={locationInput}
                  onChange={(v) => {
                    setLocationInput(v);
                    if (!v.trim()) {
                      setPickedLocation(null);
                    }
                  }}
                  onPlaceSelect={(result) => {
                    setLocationInput(formatPlaceDisplay(result));
                    setPickedLocation(result);
                  }}
                  label="Near"
                  placeholder="City or address (optional)"
                  placeTypes={[]}
                  inputId="public-communities-location-input"
                />
              </Box>
              {pickedLocation && (
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
                  htmlFor="public-communities-hobby-filter"
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
                      id="public-communities-hobby-filter"
                      placeholder="Any hobby"
                      variant="outlined"
                      label={undefined}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  )}
                />
              </Box>
            </Stack>
          )}
        </Stack>
      </Paper>

      {/* Community feed */}
      {loading && communities.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : communities.length > 0 ? (
        <>
          {/* When filters are active, surface a discreet Clear filters
              link above the grid so the viewer has a one-click reset
              without reopening the panel. */}
          {isFiltered && (
            <Stack direction="row" justifyContent="flex-end" sx={{ px: 0.5 }}>
              <Button
                size="small"
                onClick={clearAllFilters}
                sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary" }}
              >
                Clear filters
              </Button>
            </Stack>
          )}

          {/* Responsive 1/2-column grid. Goes 2-up at md so desktop reads
              as a browseable discovery board rather than a long single-
              column scroll; drops to 1-up below md so narrow phones keep
              full-width cards. `alignItems="stretch"` is the default and
              is what makes the grid-mode cards line up across a row with
              matching heights. */}
          <Grid container spacing={{ xs: 2, md: 2.5 }}>
            {communities.map((c) => (
              <Grid key={c.id} size={{ xs: 12, md: 6 }}>
                <CommunityListCard community={c} layout="grid" />
              </Grid>
            ))}
          </Grid>

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

          {/* Calm, one-line sign-up nudge. Intentionally not a sales banner,
              the CTA to join any specific community lives on the detail
              page where the user already has context. The warm-wash
              gradient ties the footer back to the page header so the
              page reads as one curated directory shell from top to
              bottom rather than a list with a banner pinned underneath. */}
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2.75, sm: 3.25 },
              borderRadius: 3,
              borderColor: "primary.light",
              background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "flex-start", sm: "center" },
              gap: { xs: 1.5, sm: 2.5 },
              mt: { xs: 1.5, sm: 2.5 },
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
              <ForumRoundedIcon sx={{ color: "primary.contrastText", fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25, fontSize: "1rem" }}>
                Want to join or start one?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Sign up to join a community, RSVP to plans, or set one up for your own group.
              </Typography>
            </Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
            >
              <Button
                component={Link}
                href="/signup"
                variant="contained"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  boxShadow: "none",
                  flex: { xs: 1, sm: "0 0 auto" },
                  "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Sign up
              </Button>
              <Button
                component={Link}
                href="/login?next=/communities"
                variant="outlined"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  flex: { xs: 1, sm: "0 0 auto" },
                }}
              >
                Sign in
              </Button>
            </Stack>
          </Paper>
        </>
      ) : (
        <AppCard>
          <EmptyState
            icon={<PeopleRoundedIcon sx={{ fontSize: 56 }} />}
            title={
              isFiltered
                ? "No communities matched your filters"
                : "No communities yet"
            }
            description={
              isFiltered
                ? "Try widening the distance, removing the hobby filter, or clearing filters to see more."
                : "Be the first to start one. Sign up and create a community to bring people together."
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
                <Button
                  component={Link}
                  href="/signup"
                  variant="contained"
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                >
                  Sign up to start one
                </Button>
              </Stack>
            }
          />
        </AppCard>
      )}
    </Stack>
  );
}
