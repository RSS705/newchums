"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import dayjs from "dayjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { apiFetch, getAvatarBaseUrl, getMediaApiBaseUrl } from "@/lib/apiClient";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import DistanceSelect from "@/components/common/DistanceSelect";
import NCDatePicker from "@/components/fields/NCDatePicker";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import UserAvatar from "@/components/common/UserAvatar";
import { TRAVEL_RADIUS_OPTIONS } from "@/config/travelRadius";
import { PROFILE_THEME_KEYS, PROFILE_THEMES, type ProfileThemeKey } from "@/lib/profileTheme";
import { validateCleanText } from "@/lib/contentSafety";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { isDuplicate, nameToSlug, slugToName } from "@/lib/interestUtils";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";

type InterestOption = { id?: string; name: string; slug: string };
const GENDER_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

type Profile = {
  name?: string | null;
  username?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  profile_theme?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
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
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_DISPLAY_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 500;
const CHIPS_COLLAPSED_COUNT = 12;
const HANDLE_REGEX = /^[A-Za-z0-9_]{3,20}$/;

export default function ProfileClient() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [gender, setGender] = useState("");
  const [profileTheme, setProfileTheme] = useState("default");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [bio, setBio] = useState("");
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [handleStatus, setHandleStatus] = useState<"idle" | "checking" | "available" | "unavailable">("idle");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

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
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const checkHandleAvailable = useCallback(async (h: string) => {
    const trimmed = h.trim();
    if (!trimmed || trimmed.length < 3) {
      setHandleStatus("idle");
      setHandleError(null);
      return;
    }
    if (!HANDLE_REGEX.test(trimmed) || trimmed.toLowerCase().startsWith("_") || trimmed.toLowerCase().endsWith("_")) {
      setHandleStatus("unavailable");
      setHandleError("Use 3–20 letters, numbers, or underscores; no leading/trailing underscore.");
      return;
    }
    setHandleStatus("checking");
    setHandleError(null);
    try {
      const res = await apiFetch(`/handles/available?handle=${encodeURIComponent(trimmed)}`, { auth: true });
      const data = (await res.json()) as { available?: boolean };
      setHandleStatus(data.available ? "available" : "unavailable");
      setHandleError(data.available ? null : "This handle is already taken.");
    } catch {
      setHandleStatus("idle");
      setHandleError(null);
    }
  }, []);

  const debouncedCheckHandle = useMemo(() => {
    let t: ReturnType<typeof setTimeout>;
    return (h: string) => {
      clearTimeout(t);
      t = setTimeout(() => checkHandleAvailable(h), 400);
    };
  }, [checkHandleAvailable]);

  useEffect(() => {
    const trimmed = handle.trim();
    const prevHandle = (profile?.username ?? "").replace(/^@/, "");
    if (trimmed === prevHandle) {
      setHandleStatus("idle");
      setHandleError(null);
      return;
    }
    if (!trimmed || trimmed.length < 3) {
      setHandleStatus("idle");
      setHandleError(null);
      return;
    }
    debouncedCheckHandle(handle);
  }, [handle, profile?.username, debouncedCheckHandle]);

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
        setGender(p.gender ?? "");
        setProfileTheme(p.profile_theme ?? "default");
        setDateOfBirth(p.date_of_birth ?? "");
        setBio(p.bio ?? "");
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
        setHandleStatus("idle");
        setHandleError(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    loadGooglePlacesScript().catch(() => {});
  }, []);

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
    if (gender !== (profile.gender ?? "")) return true;
    if (profileTheme !== (profile.profile_theme ?? "default")) return true;
    if (dateOfBirth !== (profile.date_of_birth ?? "")) return true;
    if (bio !== (profile.bio ?? "")) return true;
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
  }, [profile, displayName, handle, gender, profileTheme, dateOfBirth, bio, homeAddress, homeLat, homeLng, travelRadiusKm, interestItems]);

  const handleAvatarUpload = useCallback(
    async (fileOrBlob: File | Blob) => {
      if (!profile) return;
      const contentType = fileOrBlob.type || "image/webp";
      if (!ALLOWED_AVATAR_TYPES.includes(contentType)) {
        toast.error("Please use JPEG, PNG, or WebP.");
        return;
      }
      if (fileOrBlob.size > MAX_AVATAR_BYTES) {
        toast.error("Image must be 2MB or less.");
        return;
      }
      setAvatarUploading(true);
      try {
        const initRes = await apiFetch("/media/init", {
          auth: true,
          baseUrl: getMediaApiBaseUrl(),
          method: "POST",
          body: JSON.stringify({
            purpose: "avatar",
            contentType,
            contentLength: fileOrBlob.size,
          }),
        });
        const initData = (await initRes.json()) as {
          ok?: boolean;
          uploadToken?: string;
          objectKey?: string;
          uploadUrl?: string;
          error?: string;
        };
        if (!initData.ok || !initData.uploadToken || !initData.uploadUrl) {
          toast.error(initData.error ?? "Failed to prepare upload");
          return;
        }
        const uploadUrl = `${getMediaApiBaseUrl()}${initData.uploadUrl}`;
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          body: fileOrBlob,
          headers: { "Content-Type": contentType },
          credentials: "omit",
        });
        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          toast.error(errData.error === "FILE_TOO_LARGE" ? "Image too large." : "Upload failed.");
          return;
        }
        const finalizeRes = await apiFetch("/media/finalize", {
          auth: true,
          baseUrl: getMediaApiBaseUrl(),
          method: "POST",
          body: JSON.stringify({ objectKey: initData.objectKey, purpose: "avatar" }),
        });
        const finalizeData = (await finalizeRes.json()) as {
          ok?: boolean;
          avatarUrl?: string;
          error?: string;
        };
        if (!finalizeData.ok || !finalizeData.avatarUrl) {
          toast.error(finalizeData.error ?? "Failed to save avatar");
          return;
        }
        setProfile((p) => (p ? { ...p, avatar_url: finalizeData.avatarUrl! } : p));
        setAvatarDialogOpen(false);
        setCropImageSrc(null);
        toast.success("Avatar updated");
        router.refresh();
      } catch {
        toast.error("Upload failed");
      } finally {
        setAvatarUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [profile, toast, router],
  );

  const handleCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleRemoveAvatar = useCallback(async () => {
    if (!profile || avatarUploading) return;
    setAvatarUploading(true);
    try {
      const res = await apiFetch("/profile/avatar", {
        auth: true,
        baseUrl: getMediaApiBaseUrl(),
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        toast.error(data.error ?? "Failed to remove avatar");
        return;
      }
      setProfile((p) => (p ? { ...p, avatar_url: null } : p));
      setAvatarDialogOpen(false);
      toast.success("Avatar removed");
      router.refresh();
    } catch {
      toast.error("Failed to remove avatar");
    } finally {
      setAvatarUploading(false);
    }
  }, [profile, avatarUploading, toast, router]);

  const handleCropSave = useCallback(async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    setAvatarUploading(true);
    try {
      const blob = await getCroppedImg(cropImageSrc, croppedAreaPixels as PixelCrop);
      URL.revokeObjectURL(cropImageSrc);
      setCropImageSrc(null);
      setCroppedAreaPixels(null);
      await handleAvatarUpload(blob);
    } catch {
      toast.error("Failed to process image");
    } finally {
      setAvatarUploading(false);
    }
  }, [cropImageSrc, croppedAreaPixels, handleAvatarUpload, toast]);

  const handleSave = async () => {
    if (saving || !isDirty()) return;
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      toast.error(`Name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`);
      return;
    }
    const displayNameTrimmed = displayName.trim();
    if (displayNameTrimmed) {
      const displayNameCheck = validateCleanText(displayNameTrimmed, "display_name");
      if (!displayNameCheck.ok) {
        setDisplayNameError(displayNameCheck.reason ?? "Please choose a different display name.");
        return;
      }
    }
    const handleTrimmed = handle.trim();
    if (handleTrimmed) {
      const handleContentCheck = validateCleanText(handleTrimmed, "username");
      if (!handleContentCheck.ok) {
        setHandleError(handleContentCheck.reason ?? "That username isn't allowed. Try something else.");
        return;
      }
      if (!HANDLE_REGEX.test(handleTrimmed) || handleTrimmed.toLowerCase().startsWith("_") || handleTrimmed.toLowerCase().endsWith("_")) {
        toast.error("Use 3–20 letters, numbers, or underscores; no leading/trailing underscore.");
        return;
      }
      if (handleStatus === "unavailable") {
        toast.error("Please choose an available handle.");
        return;
      }
      if (handleStatus === "checking") {
        return;
      }
    }
    const prevHandle = (profile?.username ?? "").replace(/^@/, "");
    const handleChanged = handleTrimmed !== prevHandle;
    if (handleChanged && !handleTrimmed) {
      toast.error("Handle is required when changing it");
      return;
    }
    if (handleChanged && handleStatus !== "available" && handleTrimmed !== prevHandle) {
      toast.error("Please choose an available handle.");
      return;
    }
    if (bio.length > MAX_BIO_LENGTH) {
      toast.error(`Bio must be ${MAX_BIO_LENGTH} characters or less`);
      return;
    }
    if (travelRadiusKm < 1 || travelRadiusKm > 200) {
      toast.error("Please select a valid travel radius");
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
        const usernameData = (await usernameRes.json()) as { ok?: boolean; error?: string; code?: string };
        if (!usernameData.ok) {
          const msg =
            usernameData.error === "USERNAME_TAKEN"
              ? "This handle is already taken."
              : usernameData.error === "INAPPROPRIATE_TEXT" || usernameData.code === "INAPPROPRIATE_TEXT"
                ? "That username isn't allowed. Try something else."
                : usernameData.error === "INVALID_USERNAME"
                  ? "Use 3–20 letters, numbers, or underscores; no leading/trailing underscore."
                  : "Failed to update handle.";
          setHandleError(msg);
          toast.error(msg);
          setSaving(false);
          return;
        }
      }
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          name: displayName.trim() || null,
          bio: bio.trim() || null,
          gender: gender || null,
          profile_theme: profileTheme || null,
          date_of_birth: dateOfBirth.trim() || null,
          home_city: homeAddress.trim() || null,
          home_lat: homeLat,
          home_lng: homeLng,
          travel_radius_km: travelRadiusKm,
          interest_slugs: interestItems.map((i) => i.slug),
          interest_items: interestItems.map((i) => ({ slug: i.slug, name: i.name })),
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        profile?: Profile;
        error?: { code?: string; field?: string; message?: string } | string;
      };
      const errObj = typeof data.error === "object" ? data.error : null;
      const errMsg = errObj?.message ?? (typeof data.error === "string" ? data.error : null);

      if (!data.ok || !data.profile) {
        if (errObj?.code === "INAPPROPRIATE_TEXT") {
          if (errObj.field === "display_name") {
            setDisplayNameError(errObj.message ?? "Please choose a different display name.");
          } else if (errObj.field === "hobby") {
            toast.error(errObj.message ?? "That hobby name isn't allowed. Try a different wording.");
          } else {
            toast.error(errMsg ?? "Failed to save");
          }
        } else if (errObj?.code === "INTEREST_DELETED") {
          toast.error(errObj.message ?? "That hobby is not available. Please choose a different hobby.");
        } else {
          toast.error(errMsg ?? "Failed to save");
        }
        return;
      }

      toast.success("Profile saved");
      setDisplayNameError(null);
      setHandleError(null);
      setProfile(data.profile);
      fetchData();
      router.refresh();
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
        // We intentionally preserve user-provided casing; do not auto-title-case.
        ? { name: option.trim().replace(/\s+/g, " "), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > MAX_INTEREST_LENGTH) {
      toast.error(`Hobby must be ${MAX_INTEREST_LENGTH} characters or less`);
      return;
    }
    const hobbyCheck = validateCleanText(item.name, "hobby");
    if (!hobbyCheck.ok) {
      toast.error(hobbyCheck.reason ?? "That hobby name isn't allowed. Try a different wording.");
      return;
    }
    const already = interestItems.some((i) => isDuplicate(i, item));
    if (already) return;
    setInterestItems((prev) => [...prev, item]);
  };

  const handleForUrl = handle.trim().replace(/^@/, "");
  const canViewPublic = handleForUrl.length >= 3 && HANDLE_REGEX.test(handleForUrl);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      <Box
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "1.75rem", sm: "2rem" },
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
            }}
          >
            Profile
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 0.75, fontSize: { xs: "0.875rem", sm: "0.9375rem" }, lineHeight: 1.5 }}
          >
            Shape how you show up on NewChums. A complete profile helps people feel comfortable planning with you.
          </Typography>
        </Box>
        {canViewPublic ? (
          <AppButton
            component={Link}
            href={`/u/${handleForUrl}`}
            variant="outlined"
            size="medium"
            sx={{
              alignSelf: { xs: "center", sm: "flex-end" },
              flexShrink: 0,
              borderRadius: 2.5,
              textTransform: "none",
            }}
          >
            View public profile
          </AppButton>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              alignSelf: { xs: "center", sm: "center" },
              fontSize: "0.8125rem",
              fontStyle: "italic",
            }}
          >
            Set a username to enable public profile preview
          </Typography>
        )}
      </Box>

      <AppCard sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden" }}>
        <Stack spacing={{ xs: 1, sm: 2.5 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
            About you
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={{ xs: 2, sm: 2 }} alignItems={{ xs: "center", sm: "flex-start" }}>
            <Stack spacing={2} flex={1} minWidth={0} order={{ xs: 1, sm: 0 }}>
              <AppTextField
                label="Your Name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setDisplayNameError(null);
                }}
                onBlur={() => {
                  const trimmed = displayName.trim();
                  if (trimmed) {
                    const check = validateCleanText(trimmed, "display_name");
                    setDisplayNameError(!check.ok ? (check.reason ?? "Please choose a different display name.") : null);
                  } else {
                    setDisplayNameError(null);
                  }
                }}
                placeholder="Your real name"
                helperText={displayNameError ?? "Your real name."}
                error={Boolean(displayNameError)}
                inputProps={{ maxLength: MAX_DISPLAY_NAME_LENGTH }}
              />
              <AppTextField
                label="Username"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value.replace(/^@/, "").replace(/\s/g, ""));
                  setHandleError(null);
                }}
                onBlur={() => {
                  const trimmed = handle.trim();
                  if (trimmed) {
                    const check = validateCleanText(trimmed, "username");
                    if (!check.ok) {
                      setHandleError(check.reason ?? "That username isn't allowed. Try something else.");
                      setHandleStatus("unavailable");
                      return;
                    }
                  }
                  checkHandleAvailable(handle);
                }}
                placeholder="yourhandle"
                error={Boolean(handleError)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Typography color="text.secondary">@</Typography>
                    </InputAdornment>
                  ),
                }}
                helperText={
                  handleError ??
                  (handleStatus === "available"
                    ? "This handle is available."
                    : handleStatus === "checking"
                      ? "Checking availability…"
                      : "Your unique handle, visible throughout the system.")
                }
              />
              <AppTextField
                select
                label="Gender"
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                helperText="Optional. Visible on your public profile."
              >
                {GENDER_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </AppTextField>
              <NCDatePicker
                id="profile-date-of-birth"
                label="Date of birth"
                value={dateOfBirth}
                onChange={(v) => setDateOfBirth(v)}
                maxDate={dayjs()}
                helperText="You must be 18+ to use NewChums."
                noTopMargin
              />
              <AppTextField
                label="Bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                multiline
                rows={3}
                placeholder="Tell people a bit about what you enjoy, what you're looking for, or the kind of gatherings you like."
                inputProps={{ maxLength: MAX_BIO_LENGTH }}
                helperText={`${bio.length}/${MAX_BIO_LENGTH}`}
              />

              {/* Profile accent dropdown */}
              <AppTextField
                select
                label="Profile accent"
                value={profileTheme}
                onChange={(e) => setProfileTheme(e.target.value)}
                helperText="Choose a color accent for your public profile."
              >
                {PROFILE_THEME_KEYS.map((key: ProfileThemeKey) => {
                  const { label, color } = PROFILE_THEMES[key];
                  return (
                    <MenuItem key={key} value={key}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            backgroundColor: color,
                            border: "1px solid",
                            borderColor: "divider",
                            flexShrink: 0,
                          }}
                        />
                        {label}
                      </Box>
                    </MenuItem>
                  );
                })}
              </AppTextField>
            </Stack>
            <Stack
              alignItems="center"
              spacing={1.5}
              flexShrink={0}
              order={{ xs: 0, sm: 1 }}
              sx={{ pb: { xs: 2.5, sm: 0 } }}
            >
              <UserAvatar
                src={profile?.avatar_url ? `${getAvatarBaseUrl()}${profile.avatar_url}` : null}
                name={displayName}
                username={handle}
                size={128}
                sx={{ width: { xs: 96, sm: 128 }, height: { xs: 96, sm: 128 } }}
              />
              <AppButton variant="outlined" size="small" onClick={() => setAvatarDialogOpen(true)}>
                Choose avatar
              </AppButton>
            </Stack>
          </Stack>
        </Stack>
      </AppCard>

      <AppCard sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden" }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
              Location
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
              Helps us show plans and gatherings near you.
            </Typography>
          </Box>
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
            helperText="Enter your home address so we can show accurate distances to gatherings. This will not be shared publicly."
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

      <AppCard sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden" }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
              Hobbies
            </Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, lineHeight: 1.5 }}>
              Add hobbies you enjoy so people can find gatherings around shared interests.
            </Typography>
          </Box>
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
              const filtered = (newValue ?? []).filter(Boolean);
              const last = filtered[filtered.length - 1];
              if (typeof last === "string") addInterest(last);
              else setInterestItems(filtered as InterestOption[]);
            }}
            getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
            isOptionEqualToValue={(opt, val) => {
              // MUI may call this with undefined/null during freeSolo keyboard transitions
              // (Sentry: Cannot read properties of undefined reading 'slug')
              if (!opt || !val) return false;
              if (typeof opt === "string" || typeof val === "string") return false;
              return opt.slug === val.slug;
            }}
            loading={suggestionsLoading}
            renderInput={(params) => (
              <Box>
                <Typography
                  component="label"
                  htmlFor={params.id}
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.625, cursor: "text" }}
                >
                  Add hobbies
                </Typography>
                <TextField
                  {...params}
                  label={undefined}
                  placeholder="Type to search or create..."
                  fullWidth
                  size="medium"
                  variant="outlined"
                  onKeyDown={(e) => {
                    // Prevent MUI Autocomplete from removing the last chip on Backspace
                    // when the input is empty. stopPropagation is required because MUI's
                    // internal keydown listener still fires after preventDefault alone.
                    if (e.key === "Backspace" && !inputValue) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                />
              </Box>
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
              <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap sx={{ py: 0.75 }}>
                {(showAllChips ? sortedInterestItems : sortedInterestItems.slice(0, CHIPS_COLLAPSED_COUNT)).map(
                  (item) => (
                    <Chip
                      key={item.slug}
                      label={item.name}
                      size="medium"
                      color="primary"
                      variant="filled"
                      onDelete={() =>
                        setInterestItems((prev) => prev.filter((i) => i.slug !== item.slug))
                      }
                      sx={{
                        height: 34,
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        "& .MuiChip-label": {
                          px: 1.5,
                          py: 0.5,
                        },
                        "& .MuiChip-deleteIcon": {
                          fontSize: "1.125rem",
                          "&:hover": { color: "primary.dark" },
                        },
                      }}
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
        fullWidth
        disabled={
          saving ||
          !isDirty() ||
          (handle.trim() !== (profile?.username ?? "").replace(/^@/, "") &&
            handleStatus === "checking")
        }
        sx={{
          py: { xs: 1.25, sm: 1 },
          borderRadius: 2.5,
          textTransform: "none",
        }}
      >
        {saving
          ? "Saving…"
          : handle.trim() !== (profile?.username ?? "").replace(/^@/, "") && handleStatus === "checking"
            ? "Checking handle…"
            : "Save profile"}
      </AppButton>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
            toast.error("Please use JPEG, PNG, or WebP.");
            return;
          }
          const url = URL.createObjectURL(file);
          setCropImageSrc(url);
          setCropZoom(1);
          setCropPosition({ x: 0, y: 0 });
          setCroppedAreaPixels(null);
        }}
      />
      <Dialog
        open={avatarDialogOpen}
        onClose={() => {
          if (avatarUploading) return;
          if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
          setCropImageSrc(null);
          setAvatarDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            m: { xs: 2, sm: 3 },
            maxHeight: { xs: "calc(100dvh - 32px)", sm: "calc(100dvh - 48px)" },
          },
        }}
      >
        <DialogTitle>{cropImageSrc ? "Crop avatar" : "Choose avatar"}</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          {cropImageSrc ? (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Box sx={{ position: "relative", height: 320 }}>
                <Cropper
                  image={cropImageSrc}
                  crop={cropPosition}
                  zoom={cropZoom}
                  aspect={1}
                  cropShape="round"
                  onCropChange={setCropPosition}
                  onZoomChange={setCropZoom}
                  onCropComplete={handleCropComplete}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Zoom
                </Typography>
                <Slider
                  value={cropZoom}
                  min={1}
                  max={3}
                  step={0.1}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => setCropZoom(Number(v))}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                Drag to reposition, use the slider to zoom.
              </Typography>
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <AppButton
                variant="outlined"
                size="medium"
                fullWidth
                disabled={avatarUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUploading ? "Uploading…" : "Upload avatar"}
              </AppButton>
              {profile?.avatar_url && (
                <AppButton
                  variant="text"
                  size="medium"
                  fullWidth
                  disabled={avatarUploading}
                  onClick={handleRemoveAvatar}
                  color="error"
                >
                  Remove current avatar
                </AppButton>
              )}
              <Typography variant="body2" color="text.secondary">
                JPEG, PNG, or WebP. Max 2MB. We&apos;ll crop to a square.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        {cropImageSrc && (
          <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
            <AppButton
              variant="outlined"
              onClick={() => {
                URL.revokeObjectURL(cropImageSrc);
                setCropImageSrc(null);
                setCroppedAreaPixels(null);
              }}
            >
              Choose different
            </AppButton>
            <AppButton
              variant="contained"
              disabled={avatarUploading || !croppedAreaPixels}
              onClick={handleCropSave}
            >
              {avatarUploading ? "Uploading…" : "Save avatar"}
            </AppButton>
          </DialogActions>
        )}
      </Dialog>
    </Stack>
  );
}
