"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
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

const AVATAR_OPTIONS = [
  { id: "1", color: "primary.main" as const, label: "Blue" },
  { id: "2", color: "secondary.main" as const, label: "Purple" },
  { id: "3", color: "success.main" as const, label: "Green" },
  { id: "4", color: "info.main" as const, label: "Cyan" },
  { id: "5", color: "warning.main" as const, label: "Orange" },
  { id: "6", color: "error.main" as const, label: "Red" },
];

type InterestOption = { id?: string; name: string; slug: string };
type Profile = {
  name?: string | null;
  username?: string | null;
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
const CHIPS_COLLAPSED_COUNT = 12;

export default function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [avatarId, setAvatarId] = useState("1");
  const [bio, setBio] = useState("");
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);

  const [homeAddress, setHomeAddress] = useState("");
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);
  const [travelRadiusKm, setTravelRadiusKm] = useState(25);
  const [interestItems, setInterestItems] = useState<InterestOption[]>([]);

  const [suggestions, setSuggestions] = useState<InterestOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [showAllChips, setShowAllChips] = useState(false);

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
        setDisplayName(p.name ?? "");
        setHandle((p.username ?? "").replace(/^@/, ""));
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

  const sortedInterestItems = useMemo(
    () => [...interestItems].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [interestItems],
  );

  const isDirty = useCallback(() => {
    if (!profile) return true;
    if (displayName !== (profile.name ?? "")) return true;
    if (handle !== (profile.username ?? "").replace(/^@/, "")) return true;
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
  }, [profile, displayName, handle, homeAddress, homeLat, homeLng, travelRadiusKm, interestItems]);

  const handleSave = async () => {
    if (saving || !isDirty()) return;
    if (travelRadiusKm < 1 || travelRadiusKm > 200) {
      toast.error("Please select a valid travel radius");
      return;
    }
    const handleTrimmed = handle.trim();
    if (handleTrimmed && !/^[A-Za-z0-9_]{3,20}$/.test(handleTrimmed)) {
      toast.error("Handle must be 3–20 characters, letters, numbers, and underscores only");
      return;
    }
    const prevHandle = (profile?.username ?? "").replace(/^@/, "");
    const handleChanged = handleTrimmed !== prevHandle;
    if (handleChanged && !handleTrimmed) {
      toast.error("Handle is required when changing it");
      return;
    }
    setSaving(true);
    try {
      if (handleChanged && handleTrimmed) {
        const usernameRes = await apiFetch("/user/username", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ username: handleTrimmed }),
        });
        const usernameData = await usernameRes.json();
        if (!usernameData.ok) {
          toast.error(usernameData.error?.message ?? "Failed to update handle");
          setSaving(false);
          return;
        }
      }
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          name: displayName.trim() || null,
          home_city: homeAddress.trim() || null,
          home_lat: homeLat,
          home_lng: homeLng,
          travel_radius_km: travelRadiusKm,
          interest_slugs: interestItems.map((i) => i.slug),
          interest_items: interestItems.map((i) => ({ slug: i.slug, name: i.name })),
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
      toast.error(`Hobby must be ${MAX_INTEREST_LENGTH} characters or less`);
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
      <Stack spacing={0.25}>
        <Typography color="text.secondary">
          Shape how you show up on NewChums.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.85 }}>
          The more complete your profile, the better your matches.
        </Typography>
      </Stack>

      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">About you</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "center", sm: "flex-start" }}>
            <Stack spacing={2} flex={1} minWidth={0} order={{ xs: 1, sm: 0 }}>
              <TextField
                label="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                fullWidth
                size="medium"
                placeholder="Your real name"
                helperText="Your real name. Visible when someone views your full profile."
              />
              <TextField
                label="Handle"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(/^@/, ""))}
                fullWidth
                size="medium"
                placeholder="yourhandle"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography color="text.secondary">@</Typography>
                    </InputAdornment>
                  ),
                }}
                helperText="This is your public username. Others will see this in gatherings and lists. 3–20 characters, letters, numbers, underscores"
              />
              <TextField
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                fullWidth
                multiline
                rows={3}
                placeholder="Tell people a bit about what you enjoy, what you're looking for, or the kind of gatherings you like."
              />
            </Stack>
            <Stack alignItems="center" spacing={1.5} flexShrink={0} order={{ xs: 0, sm: 1 }}>
              <Avatar
                sx={{
                  width: 128,
                  height: 128,
                  fontSize: "3rem",
                  bgcolor: AVATAR_OPTIONS.find((a) => a.id === avatarId)?.color ?? "primary.main",
                  border: "2px solid",
                  borderColor: "divider",
                }}
              >
                {displayName?.slice(0, 1)?.toUpperCase() || "?"}
              </Avatar>
              <AppButton variant="outlined" size="small" onClick={() => setAvatarDialogOpen(true)}>
                Choose avatar
              </AppButton>
            </Stack>
          </Stack>
        </Stack>
      </AppCard>

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
            helperText="Enter your home address so we can show accurate distances to gatherings."
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
          <Typography variant="h6">Hobbies</Typography>
          <Typography color="text.secondary" variant="body2">
            Add hobbies you enjoy. You can pick existing ones or create your own.
          </Typography>
          <Autocomplete
            freeSolo
            multiple
            filterOptions={(x) => x}
            options={suggestions}
            sx={{
              "& .MuiOutlinedInput-root": { alignItems: "center" },
              "& .MuiInputBase-input": {
                paddingTop: 14,
                paddingBottom: 14,
                lineHeight: 1.4375,
              },
            }}
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
                label="Add hobbies"
                placeholder="Type to search or create..."
                fullWidth
                size="medium"
                variant="outlined"
                onKeyDown={(e) => {
                  if (e.key === "Backspace" && !inputValue) {
                    e.preventDefault();
                  }
                }}
              />
            )}
            renderTags={() => null}
          />
          {interestItems.length > 0 ? (
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" flexWrap="wrap" gap={0.5}>
                <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.9 }}>
                  {interestItems.length} {interestItems.length === 1 ? "hobby" : "hobbies"} selected
                </Typography>
                {interestItems.length > CHIPS_COLLAPSED_COUNT && (
                  <Typography
                    component="button"
                    type="button"
                    variant="body2"
                    onClick={() => setShowAllChips((v) => !v)}
                    sx={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "primary.main",
                      textDecoration: "underline",
                      "&:hover": { color: "primary.dark" },
                    }}
                  >
                    {showAllChips ? "Show fewer" : `Show all (${interestItems.length})`}
                  </Typography>
                )}
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap sx={{ py: 0.5 }}>
                {(showAllChips ? sortedInterestItems : sortedInterestItems.slice(0, CHIPS_COLLAPSED_COUNT)).map(
                  (item) => (
                    <Chip
                      key={item.slug}
                      label={item.name}
                      size="small"
                      color="primary"
                      variant="filled"
                      onDelete={() =>
                        setInterestItems((prev) => prev.filter((i) => i.slug !== item.slug))
                      }
                    />
                  )
                )}
              </Stack>
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.85 }}>
              The more specific you are, the easier it is for others to find you.
            </Typography>
          )}
        </Stack>
      </AppCard>

      <AppButton
        onClick={handleSave}
        disabled={saving || !isDirty()}
      >
        {saving ? "Saving…" : "Save profile"}
      </AppButton>

      <Dialog open={avatarDialogOpen} onClose={() => setAvatarDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Choose avatar</DialogTitle>
        <DialogContent>
          <Stack direction="row" flexWrap="wrap" gap={1} sx={{ pt: 1 }}>
            {AVATAR_OPTIONS.map((opt) => (
              <Avatar
                key={opt.id}
                onClick={() => {
                  setAvatarId(opt.id);
                  setAvatarDialogOpen(false);
                }}
                sx={{
                  width: 48,
                  height: 48,
                  bgcolor: opt.color,
                  cursor: "pointer",
                  border: avatarId === opt.id ? 3 : 0,
                  borderColor: "primary.main",
                  "&:hover": { opacity: 0.9 },
                }}
              >
                {displayName?.slice(0, 1)?.toUpperCase() || "?"}
              </Avatar>
            ))}
          </Stack>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
