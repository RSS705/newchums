"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { AppButton, AppCard, useToast } from "@/components/ui";
import DistanceSelect from "@/components/common/DistanceSelect";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import { TRAVEL_RADIUS_OPTIONS } from "@/config/travelRadius";
import { isDuplicate, nameToSlug, slugToName } from "@/lib/interestUtils";

type InterestOption = { id?: string; name: string; slug: string };
type Profile = {
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_radius_km: number;
  interest_slugs: string[];
  interest_items?: { slug: string; name: string }[];
  email_chat_digest: boolean;
  email_new_events: boolean;
};

const MAX_INTEREST_LENGTH = 50;

export default function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [homeAddress, setHomeAddress] = useState("");
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);
  const [travelRadiusKm, setTravelRadiusKm] = useState(25);
  const [interestItems, setInterestItems] = useState<InterestOption[]>([]);

  const [suggestions, setSuggestions] = useState<InterestOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const toast = useToast();

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setSuggestions([]);
      return;
    }
    setSuggestionsLoading(true);
    try {
      const res = await apiFetch(`/interests?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.ok && data.interests) {
        const opts = data.interests.map((r: { id?: string; name: string; slug: string }) => ({
          id: r.id,
          name: r.name,
          slug: r.slug,
        }));
        setSuggestions(opts);
      } else {
        setSuggestions([]);
      }
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }, []);

  const debouncedFetch = useMemo(() => {
    let t: ReturnType<typeof setTimeout>;
    return (q: string) => {
      clearTimeout(t);
      t = setTimeout(() => fetchSuggestions(q), 250);
    };
  }, [fetchSuggestions]);

  useEffect(() => {
    if (inputValue) debouncedFetch(inputValue);
    else setSuggestions([]);
  }, [inputValue, debouncedFetch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const profileRes = await apiFetch("/profile", { auth: true });
      const profileData = await profileRes.json();

      if (profileData.ok && profileData.profile) {
        const p = profileData.profile;
        setProfile(p);
        setHomeAddress(p.home_city ?? "");
        setHomeLat(p.home_lat ?? null);
        setHomeLng(p.home_lng ?? null);
        setTravelRadiusKm(p.travel_radius_km ?? 25);
        const raw = p.interest_items ?? (p.interest_slugs ?? []).map((s: string) => ({ slug: s, name: slugToName(s) }));
        const items = raw.map((x: { slug: string; name: string }) => ({
          name: x.name || slugToName(x.slug),
          slug: x.slug,
        }));
        setInterestItems(items);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const interestSlugsSet = useMemo(
    () => new Set(interestItems.map((i) => i.slug.toLowerCase())),
    [interestItems],
  );

  const isDirty = useCallback(() => {
    if (!profile) return true;
    if (homeAddress !== (profile.home_city ?? "")) return true;
    if (homeLat !== profile.home_lat || homeLng !== profile.home_lng) return true;
    if (travelRadiusKm !== profile.travel_radius_km) return true;
    const prevSlugs = new Set((profile.interest_items ?? profile.interest_slugs ?? []).map((x: { slug?: string } | string) =>
      typeof x === "string" ? x : x.slug ?? "",
    ));
    const currSlugs = new Set(interestItems.map((i) => i.slug));
    if (currSlugs.size !== prevSlugs.size) return true;
    for (const s of currSlugs) if (!prevSlugs.has(s)) return true;
    return false;
  }, [profile, homeAddress, homeLat, homeLng, travelRadiusKm, interestItems]);

  const handleSave = async () => {
    if (saving || !isDirty()) return;
    if (travelRadiusKm < 1 || travelRadiusKm > 200) {
      toast.error("Please select a valid travel radius");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          home_city: homeAddress.trim() || null,
          home_lat: homeLat,
          home_lng: homeLng,
          travel_radius_km: travelRadiusKm,
          interest_slugs: interestItems.map((i) => i.slug),
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        toast.error(data.error?.message ?? "Failed to save");
        return;
      }

      toast.success("Profile saved");
      setProfile(data.profile);
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  const addInterest = (option: InterestOption | string) => {
    const item: InterestOption =
      typeof option === "string"
        ? { name: option.trim(), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > MAX_INTEREST_LENGTH) {
      toast.error(`Interest must be ${MAX_INTEREST_LENGTH} characters or less`);
      return;
    }
    const already = interestItems.some((i) => isDuplicate(i, item));
    if (already) return;
    setInterestItems((prev) => [...prev, item]);
  };

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h3">
        Profile
      </Typography>
      <Typography color="text.secondary">
        Set your interests, location, and travel radius to find events near you.
      </Typography>

      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Location</Typography>
          <PlacesAutocompleteInput
            value={homeAddress}
            onChange={(v) => {
              setHomeAddress(v);
              if (!v.trim()) {
                setHomeLat(null);
                setHomeLng(null);
              }
            }}
            onPlaceSelect={(result) => {
              setHomeAddress(result.formattedAddress);
              setHomeLat(result.lat);
              setHomeLng(result.lng);
            }}
            label="Home location"
            placeholder="Enter your address"
            helperText="Enter your home address for accurate distance calculations."
          />
          <DistanceSelect
            value={
              TRAVEL_RADIUS_OPTIONS.some((o) => o.value === travelRadiusKm)
                ? travelRadiusKm
                : 25
            }
            onChange={setTravelRadiusKm}
            label="Travel distance"
            helperText={null}
            fullWidth
          />
        </Stack>
      </AppCard>

      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Interests</Typography>
          <Typography color="text.secondary" variant="body2">
            Add interests you’d like to see events for. Type to search or create new ones.
          </Typography>
          <Autocomplete
            freeSolo
            multiple
            filterOptions={(x) => x}
            options={suggestions}
            value={interestItems}
            inputValue={inputValue}
            onInputChange={(_, v) => setInputValue(v)}
            onChange={(_, newValue) => {
              const last = newValue[newValue.length - 1];
              if (typeof last === "string") addInterest(last);
              else setInterestItems(newValue as InterestOption[]);
            }}
            getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
            isOptionEqualToValue={(opt, val) =>
              typeof opt !== "string" && typeof val !== "string" && opt.slug === val.slug
            }
            loading={suggestionsLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Add interests"
                placeholder="Type to search or create..."
              />
            )}
            renderTags={(values, getTagProps) =>
              values.map((item, i) => {
                const { key, ...tagProps } = getTagProps({ index: i });
                return (
                  <Chip
                    key={key}
                    label={item.name}
                    size="small"
                    color="primary"
                    variant="filled"
                    {...tagProps}
                  />
                );
              })
            }
          />
        </Stack>
      </AppCard>

      <AppButton
        onClick={handleSave}
        disabled={saving || !isDirty()}
      >
        {saving ? "Saving…" : "Save profile"}
      </AppButton>
    </Stack>
  );
}
