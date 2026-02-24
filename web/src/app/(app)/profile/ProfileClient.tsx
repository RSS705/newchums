"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";

type Interest = { id: string; name: string; category: string; slug: string; sort_order: number };
type Profile = {
  home_city: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_radius_km: number;
  interest_slugs: string[];
  email_chat_digest: boolean;
  email_new_events: boolean;
};

function groupByCategory(interests: Interest[]): Map<string, Interest[]> {
  const map = new Map<string, Interest[]>();
  for (const i of interests) {
    const list = map.get(i.category) ?? [];
    list.push(i);
    map.set(i.category, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  return map;
}

export default function ProfileClient() {
  const [interests, setInterests] = useState<Interest[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [homeCity, setHomeCity] = useState("");
  const [homeLat, setHomeLat] = useState<string>("");
  const [homeLng, setHomeLng] = useState<string>("");
  const [travelRadiusKm, setTravelRadiusKm] = useState(25);
  const [interestSlugs, setInterestSlugs] = useState<Set<string>>(new Set());

  const toast = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [interestsRes, profileRes] = await Promise.all([
        apiFetch("/interests"),
        apiFetch("/profile", { auth: true }),
      ]);

      const interestsData = await interestsRes.json();
      const profileData = await profileRes.json();

      if (interestsData.ok) setInterests(interestsData.interests ?? []);
      if (profileData.ok && profileData.profile) {
        const p = profileData.profile;
        setProfile(p);
        setHomeCity(p.home_city ?? "");
        setHomeLat(p.home_lat != null ? String(p.home_lat) : "");
        setHomeLng(p.home_lng != null ? String(p.home_lng) : "");
        setTravelRadiusKm(p.travel_radius_km ?? 25);
        setInterestSlugs(new Set(p.interest_slugs ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isDirty = useCallback(() => {
    if (!profile) return true;
    if (homeCity !== (profile.home_city ?? "")) return true;
    const lat = homeLat === "" ? null : Number(homeLat);
    const lng = homeLng === "" ? null : Number(homeLng);
    if (lat !== profile.home_lat || lng !== profile.home_lng) return true;
    if (travelRadiusKm !== profile.travel_radius_km) return true;
    const prevSlugs = new Set(profile.interest_slugs ?? []);
    if (interestSlugs.size !== prevSlugs.size) return true;
    for (const s of interestSlugs) if (!prevSlugs.has(s)) return true;
    return false;
  }, [profile, homeCity, homeLat, homeLng, travelRadiusKm, interestSlugs]);

  const toggleInterest = (slug: string) => {
    setInterestSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || !isDirty()) return;

    const lat = homeLat.trim() === "" ? null : Number(homeLat);
    const lng = homeLng.trim() === "" ? null : Number(homeLng);

    if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      toast.error("Latitude must be between -90 and 90");
      return;
    }
    if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      toast.error("Longitude must be between -180 and 180");
      return;
    }
    if ((lat == null) !== (lng == null)) {
      toast.error("Provide both latitude and longitude, or leave both empty");
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          home_city: homeCity.trim() || null,
          home_lat: lat,
          home_lng: lng,
          travel_radius_km: travelRadiusKm,
          interest_slugs: Array.from(interestSlugs),
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

  const grouped = groupByCategory(interests);

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
          <AppTextField
            label="City"
            placeholder="e.g. Toronto"
            value={homeCity}
            onChange={(e) => setHomeCity(e.target.value)}
            helperText=" "
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <AppTextField
              label="Latitude"
              type="number"
              placeholder="e.g. 43.65"
              value={homeLat}
              onChange={(e) => setHomeLat(e.target.value)}
              inputProps={{ min: -90, max: 90, step: 0.0001 }}
              helperText=" "
            />
            <AppTextField
              label="Longitude"
              type="number"
              placeholder="e.g. -79.38"
              value={homeLng}
              onChange={(e) => setHomeLng(e.target.value)}
              inputProps={{ min: -180, max: 180, step: 0.0001 }}
              helperText=" "
            />
          </Stack>
          <Box>
            <Typography gutterBottom>
              Travel radius: {travelRadiusKm} km
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Slider
                value={travelRadiusKm}
                onChange={(_, v) => setTravelRadiusKm(v as number)}
                min={1}
                max={200}
                valueLabelDisplay="auto"
                sx={{ flex: 1, maxWidth: 280 }}
              />
              <AppTextField
                type="number"
                value={travelRadiusKm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v) && v >= 1 && v <= 200) setTravelRadiusKm(v);
                }}
                inputProps={{ min: 1, max: 200 }}
                sx={{ width: 80 }}
                helperText=" "
              />
            </Stack>
          </Box>
        </Stack>
      </AppCard>

      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Interests</Typography>
          <Typography color="text.secondary" variant="body2">
            Select the interests you’d like to see events for.
          </Typography>
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, items]) => (
              <Box key={category}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  {category}
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.5}>
                  {items.map((i) => (
                    <Chip
                      key={i.id}
                      label={i.name}
                      onClick={() => toggleInterest(i.slug)}
                      color={interestSlugs.has(i.slug) ? "primary" : "default"}
                      variant={interestSlugs.has(i.slug) ? "filled" : "outlined"}
                      size="small"
                    />
                  ))}
                </Stack>
              </Box>
            ))}
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
