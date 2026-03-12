"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import Cropper, { type Area } from "react-easy-crop";
import { useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
import { apiFetch, getMediaApiBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { isDuplicate, nameToSlug } from "@/lib/interestUtils";
import { validateCleanText } from "@/lib/contentSafety";
import { BANNER_PRESETS, renderBannerPreset, suggestPreset } from "@/lib/eventBanners";

type HobbyOption = { id?: string; name: string; slug: string };

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BANNER_BYTES = 5 * 1024 * 1024;

export default function CreateEventClient() {
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<HobbyOption[]>([]);
  const [maxSeats, setMaxSeats] = useState("");

  const [dateValue, setDateValue] = useState<Dayjs | null>(() => dayjs());
  const [timeValue, setTimeValue] = useState<Dayjs | null>(() => dayjs());

  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationArea, setLocationArea] = useState<string | null>(null);
  const [locationVisibility, setLocationVisibility] = useState<"exact_everyone" | "exact_joined_only" | "approximate_only">("exact_everyone");
  const [onlineLink, setOnlineLink] = useState("");

  const [visibility, setVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [allowAltTimes, setAllowAltTimes] = useState(true);
  const [requireReconfirmation, setRequireReconfirmation] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Hobby search
  const [suggestions, setSuggestions] = useState<HobbyOption[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [hobbyInputValue, setHobbyInputValue] = useState("");

  // Banner image
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerCropZoom, setBannerCropZoom] = useState(1);
  const [bannerCropPosition, setBannerCropPosition] = useState({ x: 0, y: 0 });
  const [bannerCroppedArea, setBannerCroppedArea] = useState<Area | null>(null);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  // Which system preset is active (null = none / custom upload)
  const [selectedPresetSlug, setSelectedPresetSlug] = useState<string | null>(null);
  const [presetRendering, setPresetRendering] = useState(false);
  const autoSuggestedRef = useRef(false);

  useEffect(() => {
    loadGooglePlacesScript().catch(() => {});
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) { setSuggestions([]); return; }
    setSuggestionsLoading(true);
    try {
      const res = await apiFetch(`/interests?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.ok && data.interests) {
        setSuggestions(data.interests.map((r: { id?: string; name: string; slug: string }) => ({
          id: r.id, name: r.name, slug: r.slug,
        })));
      } else {
        setSuggestions([]);
      }
    } catch { setSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  }, []);

  const debouncedFetch = useMemo(() => {
    let t: ReturnType<typeof setTimeout>;
    return (q: string) => { clearTimeout(t); t = setTimeout(() => fetchSuggestions(q), 250); };
  }, [fetchSuggestions]);

  useEffect(() => {
    if (hobbyInputValue) debouncedFetch(hobbyInputValue);
    else setSuggestions([]);
  }, [hobbyInputValue, debouncedFetch]);

  const addHobby = (option: HobbyOption | string) => {
    const item: HobbyOption =
      typeof option === "string"
        ? { name: option.trim().replace(/\s+/g, " "), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > 50) { toast.error("Hobby must be 50 characters or less"); return; }
    const check = validateCleanText(item.name, "hobby");
    if (!check.ok) { toast.error(check.reason ?? "That hobby name isn't allowed."); return; }
    if (selectedHobbies.some((i) => isDuplicate(i, item))) return;
    setSelectedHobbies((prev) => [...prev, item]);
  };

  const handleBannerCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setBannerCroppedArea(croppedAreaPx);
  }, []);

  const handleBannerCropSave = useCallback(async () => {
    if (!bannerCropSrc || !bannerCroppedArea) return;
    try {
      const blob = await getCroppedImg(bannerCropSrc, bannerCroppedArea as PixelCrop, 1200, 400);
      URL.revokeObjectURL(bannerCropSrc);
      setBannerCropSrc(null);
      const file = new File([blob], "banner.webp", { type: blob.type || "image/webp" });
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setBannerDialogOpen(false);
    } catch {
      toast.error("Failed to process image");
    }
  }, [bannerCropSrc, bannerCroppedArea, toast]);

  const handlePresetSelect = useCallback(async (slug: string) => {
    if (presetRendering) return;
    setPresetRendering(true);
    try {
      const blob = await renderBannerPreset(slug);
      if (bannerPreview && selectedPresetSlug) URL.revokeObjectURL(bannerPreview);
      const file = new File([blob], `banner-${slug}.webp`, { type: "image/webp" });
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setSelectedPresetSlug(slug);
    } catch {
      toast.error("Failed to generate banner");
    } finally {
      setPresetRendering(false);
    }
  }, [presetRendering, bannerPreview, selectedPresetSlug, toast]);

  // Auto-suggest a preset based on the first hobby selected (fires once)
  useEffect(() => {
    if (autoSuggestedRef.current) return;
    if (!selectedHobbies.length || bannerFile) return;
    const suggestion = suggestPreset(selectedHobbies.map((h) => h.slug));
    if (!suggestion) return;
    autoSuggestedRef.current = true;
    void handlePresetSelect(suggestion);
  }, [selectedHobbies, bannerFile, handlePresetSelect]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Give your plan a title";
    if (selectedHobbies.length === 0) errs.hobby = "Add at least one hobby so people can find this plan";
    if (!dateValue || !dateValue.isValid()) errs.date = "Pick a date";
    if (!timeValue || !timeValue.isValid()) errs.time = "Pick a time";
    if (locationType === "in_person" && !locationName.trim() && !locationAddress.trim())
      errs.location = "Add a venue or address";
    if (maxSeats && (isNaN(Number(maxSeats)) || Number(maxSeats) < 1))
      errs.maxSeats = "Must be a positive number";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const d = dateValue!;
    const t = timeValue!;
    const startsAt = d.hour(t.hour()).minute(t.minute()).second(0).toISOString();

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      interest_ids: selectedHobbies.filter((h) => h.id).map((h) => h.id),
      interest_id: selectedHobbies[0]?.id ?? null,
      interest_items: selectedHobbies.map((h) => ({ slug: h.slug, name: h.name })),
      starts_at: startsAt,
      location_type: locationType,
      location_name: locationName.trim() || null,
      location_address: locationAddress.trim() || null,
      location_place_id: locationPlaceId,
      location_lat: locationLat,
      location_lng: locationLng,
      location_area: locationType === "in_person" ? (locationArea?.trim() || null) : null,
      location_visibility: locationType === "in_person" ? locationVisibility : "exact_everyone",
      online_link: locationType === "online" ? onlineLink.trim() || null : null,
      max_seats: maxSeats ? Number(maxSeats) : null,
      visibility,
      allow_alt_times: allowAltTimes,
      require_reconfirmation: requireReconfirmation,
      require_approval: requireApproval,
      status: "published",
    };

    try {
      const res = await apiFetch("/events", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; event?: { id: string }; error?: string; message?: string; field?: string };
      if (data.ok && data.event) {
        if (bannerFile) {
          try {
            const bInitRes = await apiFetch("/media/init", {
              auth: true,
              baseUrl: getMediaApiBaseUrl(),
              method: "POST",
              body: JSON.stringify({
                purpose: "event_banner",
                contentType: bannerFile.type || "image/webp",
                contentLength: bannerFile.size,
              }),
            });
            const bInitData = (await bInitRes.json()) as { ok?: boolean; uploadToken?: string; objectKey?: string; uploadUrl?: string };
            if (bInitData.ok && bInitData.uploadToken && bInitData.uploadUrl && bInitData.objectKey) {
              const uploadUrl = `${getMediaApiBaseUrl()}${bInitData.uploadUrl}`;
              const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                body: bannerFile,
                headers: { "Content-Type": bannerFile.type || "image/webp" },
                credentials: "omit",
              });
              if (uploadRes.ok) {
                await apiFetch("/media/finalize", {
                  auth: true,
                  baseUrl: getMediaApiBaseUrl(),
                  method: "POST",
                  body: JSON.stringify({
                    objectKey: bInitData.objectKey,
                    purpose: "event_banner",
                    eventId: data.event.id,
                  }),
                });
              }
            }
          } catch { /* banner upload failure is non-fatal */ }
        }
        toast.success("Plan created!");
        router.push(`/events/${data.event.id}`);
      } else {
        if (data.field) {
          setErrors({ [data.field]: data.message ?? "Validation error" });
        } else {
          toast.error(data.message ?? "Something went wrong");
        }
      }
    } catch {
      toast.error("Network error, please try again");
    }
    setSubmitting(false);
  };

  const sortedHobbies = useMemo(
    () => [...selectedHobbies].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [selectedHobbies],
  );

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            mb: 0.75,
          }}
        >
          Start a plan
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Organize a gathering around something you enjoy. Keep it simple, you can always update later.
        </Typography>
      </Box>

      {/* Banner image */}
      <AppCard>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Banner image
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Pick a colour theme or upload your own photo.
            </Typography>
          </Box>

          {/* Preset swatches */}
          <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
            {BANNER_PRESETS.map((preset) => {
              const isSelected = selectedPresetSlug === preset.slug;
              return (
                <Box
                  key={preset.slug}
                  onClick={() => !presetRendering && handlePresetSelect(preset.slug)}
                  title={preset.label}
                  sx={{
                    width: 52,
                    height: 36,
                    borderRadius: 1.5,
                    background: preset.gradient,
                    cursor: presetRendering ? "wait" : "pointer",
                    border: "2px solid",
                    borderColor: isSelected ? "primary.main" : "transparent",
                    boxShadow: isSelected ? "0 0 0 2px rgba(99,102,241,0.35)" : "0 1px 3px rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "transform 0.1s ease, box-shadow 0.1s ease",
                    "&:hover": { transform: presetRendering ? "none" : "scale(1.06)" },
                  }}
                >
                  {isSelected && <CheckRoundedIcon sx={{ fontSize: 16, color: "white", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))" }} />}
                </Box>
              );
            })}
          </Stack>

          {/* Preview / upload area */}
          <Box
            onClick={() => !selectedPresetSlug && bannerInputRef.current?.click()}
            sx={{
              width: "100%",
              height: { xs: 140, sm: 180 },
              borderRadius: 2.5,
              border: "2px dashed",
              borderColor: bannerPreview ? "transparent" : "grey.300",
              bgcolor: bannerPreview ? "transparent" : "grey.50",
              cursor: selectedPresetSlug ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              position: "relative",
              transition: "border-color 0.2s",
              "&:hover": { borderColor: bannerPreview ? "transparent" : "primary.main" },
            }}
          >
            {bannerPreview ? (
              <Box
                component="img"
                src={bannerPreview}
                alt="Banner preview"
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Stack alignItems="center" spacing={0.75}>
                <AddPhotoAlternateRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  Upload a custom photo
                </Typography>
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {selectedPresetSlug ? (
              <AppButton
                variant="outlined"
                size="small"
                onClick={() => bannerInputRef.current?.click()}
              >
                Upload custom photo instead
              </AppButton>
            ) : bannerPreview ? (
              <AppButton
                variant="outlined"
                size="small"
                onClick={() => bannerInputRef.current?.click()}
              >
                Change photo
              </AppButton>
            ) : null}
            {bannerPreview && (
              <AppButton
                variant="text"
                size="small"
                color="error"
                onClick={() => {
                  setBannerFile(null);
                  if (bannerPreview) URL.revokeObjectURL(bannerPreview);
                  setBannerPreview(null);
                  setSelectedPresetSlug(null);
                }}
              >
                Remove
              </AppButton>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Colour themes are free. Custom photos: JPEG, PNG, or WebP, max 5 MB.
          </Typography>
        </Stack>
      </AppCard>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            What&apos;s the plan?
          </Typography>

          <AppTextField
            label="Title"
            placeholder="e.g. Thursday Board Game Night"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={!!errors.title}
            helperText={errors.title ?? "Give it a name people will recognise"}
            inputProps={{ maxLength: 200 }}
          />

          <AppTextField
            label="Description"
            placeholder="What should people expect? Any details they should know?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            maxRows={6}
            inputProps={{ maxLength: 2000 }}
            helperText="Optional, but a short description helps people decide to join"
          />

          {/* Multi-hobby selector (mirrors profile pattern) */}
          <Autocomplete
            freeSolo
            multiple
            filterOptions={(x) => x}
            options={suggestions}
            value={selectedHobbies}
            inputValue={hobbyInputValue}
            onInputChange={(_, v) => setHobbyInputValue(v)}
            onChange={(_, newValue) => {
              const filtered = (newValue ?? []).filter(Boolean);
              const last = filtered[filtered.length - 1];
              if (typeof last === "string") addHobby(last);
              else setSelectedHobbies(filtered as HobbyOption[]);
            }}
            getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
            isOptionEqualToValue={(opt, val) => {
              if (!opt || !val) return false;
              if (typeof opt === "string" || typeof val === "string") return false;
              return opt.slug === val.slug;
            }}
            loading={suggestionsLoading}
            renderInput={(params) => (
              <Box sx={{ width: "100%" }}>
                <Typography
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.625, color: errors.hobby ? "error.main" : "inherit" }}
                >
                  Hobbies
                </Typography>
                <TextField
                  {...params}
                  placeholder="Type to search or create..."
                  variant="outlined"
                  size="medium"
                  fullWidth
                  label={undefined}
                  error={!!errors.hobby}
                  helperText={errors.hobby ?? "Link this plan to hobbies so the right people can find it"}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace" && !hobbyInputValue) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                />
              </Box>
            )}
            renderTags={() => null}
          />
          {selectedHobbies.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1.5} useFlexGap>
              {sortedHobbies.map((item) => (
                <Chip
                  key={item.slug}
                  label={item.name}
                  size="medium"
                  color="primary"
                  variant="filled"
                  onDelete={() => setSelectedHobbies((prev) => prev.filter((i) => i.slug !== item.slug))}
                  sx={{
                    height: 34,
                    fontSize: "0.875rem",
                    fontWeight: 600,
                    "& .MuiChip-label": { px: 1.5, py: 0.5 },
                    "& .MuiChip-deleteIcon": { fontSize: "1.125rem", "&:hover": { color: "primary.dark" } },
                  }}
                />
              ))}
            </Stack>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
            <AppTextField
              label="Seats"
              placeholder="e.g. 8"
              value={maxSeats}
              onChange={(e) => setMaxSeats(e.target.value)}
              error={!!errors.maxSeats}
              helperText={errors.maxSeats ?? "Optional, leave blank for unlimited"}
              type="number"
              inputProps={{ min: 1, max: 500 }}
              sx={{ minWidth: { xs: "100%", sm: 260 } }}
            />
          </Stack>
        </Stack>
      </AppCard>

      {/* Date & time */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            When?
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                Date
              </Typography>
              <DatePicker
                value={dateValue}
                onChange={setDateValue}
                minDate={dayjs()}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: "medium",
                    error: !!errors.date,
                    helperText: errors.date,
                    placeholder: "Pick a date",
                  },
                }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                Time
              </Typography>
              <TimePicker
                value={timeValue}
                onChange={setTimeValue}
                format="h:mm A"
                slotProps={{
                  field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                  textField: {
                    fullWidth: true,
                    size: "medium",
                    error: !!errors.time,
                    helperText: errors.time,
                    placeholder: "Pick a time",
                  },
                }}
              />
            </Box>
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={allowAltTimes}
                onChange={(e) => setAllowAltTimes(e.target.checked)}
              />
            }
            label="Let people suggest alternate times"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
            Invitees can propose a different date or time if this one doesn&apos;t work for them.
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={requireReconfirmation}
                onChange={(e) => setRequireReconfirmation(e.target.checked)}
              />
            }
            label="Ask attendees to reconfirm before the plan"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
            24 hours before the plan starts, attendees will receive a reminder asking whether they&apos;re still coming.
            This doesn&apos;t automatically cancel the plan or change anyone&apos;s RSVP.
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
            }
            label="Require approval before joining"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
            People who are not directly invited will need to request to join, and you&apos;ll approve or decline each request.
          </Typography>
        </Stack>
      </AppCard>

      {/* Location */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Where?
          </Typography>

          <RadioGroup
            row
            value={locationType}
            onChange={(e) => setLocationType(e.target.value as "in_person" | "online")}
          >
            <FormControlLabel value="in_person" control={<Radio />} label="In person" />
            <FormControlLabel value="online" control={<Radio />} label="Online" />
          </RadioGroup>

          {locationType === "in_person" ? (
            <>
              <PlacesAutocompleteInput
                value={locationName}
                onChange={(v) => {
                  setLocationName(v);
                  if (!v.trim()) {
                    setLocationAddress("");
                    setLocationPlaceId(null);
                    setLocationLat(null);
                    setLocationLng(null);
                    setLocationArea(null);
                  }
                }}
                onPlaceSelect={(result) => {
                  setLocationName(result.name || result.formattedAddress);
                  setLocationAddress(result.formattedAddress);
                  setLocationPlaceId(result.placeId);
                  setLocationLat(result.lat);
                  setLocationLng(result.lng);
                  setLocationArea(result.area ?? null);
                }}
                label="Venue or address"
                placeholder="Search for a place or enter an address"
                helperText={errors.location ?? "Start typing to search venues, parks, cafes, or addresses"}
                error={!!errors.location}
                placeTypes={["establishment", "geocode"]}
                inputId="places-autocomplete-event"
              />
              <FormControl fullWidth size="medium" sx={{ minWidth: 200 }}>
                <Typography
                  component="label"
                  htmlFor="location-visibility-select"
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.625 }}
                >
                  Who can see the exact location?
                </Typography>
                <Select
                  id="location-visibility-select"
                  value={locationVisibility}
                  onChange={(e) => setLocationVisibility(e.target.value as typeof locationVisibility)}
                  variant="outlined"
                  displayEmpty={false}
                  renderValue={(v) => {
                    const labels: Record<typeof locationVisibility, string> = {
                      exact_everyone: "Everyone",
                      exact_joined_only: "Only people who join",
                      approximate_only: "General area only",
                    };
                    return labels[v];
                  }}
                  MenuProps={{
                    PaperProps: { sx: { minWidth: 320 } },
                  }}
                  sx={{ "& .MuiSelect-select": { py: 1.25 } }}
                >
                  <MenuItem value="exact_everyone">
                    <ListItemText
                      primary="Everyone"
                      secondary="The full venue or address is shown wherever the plan appears"
                      primaryTypographyProps={{ fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </MenuItem>
                  <MenuItem value="exact_joined_only">
                    <ListItemText
                      primary="Only people who join"
                      secondary="Others see only the general area until they respond (going or maybe)"
                      primaryTypographyProps={{ fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </MenuItem>
                  <MenuItem value="approximate_only">
                    <ListItemText
                      primary="General area only"
                      secondary="The exact venue is never shown; everyone sees only the broader area"
                      primaryTypographyProps={{ fontWeight: 500 }}
                      secondaryTypographyProps={{ variant: "caption" }}
                    />
                  </MenuItem>
                </Select>
              </FormControl>
            </>
          ) : (
            <AppTextField
              label="Online link or details"
              placeholder="e.g. Zoom link, Discord server"
              value={onlineLink}
              onChange={(e) => setOnlineLink(e.target.value)}
              helperText="Share a link or instructions for joining online"
            />
          )}
        </Stack>
      </AppCard>

      {/* Visibility */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Who can see this?
          </Typography>

          <RadioGroup
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <FormControlLabel
              value="public"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Public</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Anyone on NewChums can discover and join this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mb: 1.5 }}
            />
            <FormControlLabel
              value="chums_only"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Chums only</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Only your Chums can see and join this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mb: 1.5 }}
            />
            <FormControlLabel
              value="invite_only"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Invite only</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Only people you invite will see this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start" }}
            />
          </RadioGroup>
        </Stack>
      </AppCard>

      {/* Submit */}
      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={2}
        justifyContent="flex-end"
        sx={{ pt: 1, pb: 4 }}
      >
        <AppButton
          variant="outlined"
          color="inherit"
          onClick={() => router.push("/plans")}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 140 }, borderRadius: 2.5, textTransform: "none" }}
        >
          Cancel
        </AppButton>
        <AppButton
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 200 }, py: 1.5, borderRadius: 2.5, fontWeight: 600, textTransform: "none", fontSize: "1rem" }}
        >
          {submitting ? <CircularProgress size={22} color="inherit" /> : "Publish plan"}
        </AppButton>
      </Stack>

      {/* Hidden file input for banner */}
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            toast.error("Please use JPEG, PNG, or WebP.");
            return;
          }
          if (file.size > MAX_BANNER_BYTES) {
            toast.error("Image must be 5MB or less.");
            return;
          }
          // Custom upload takes precedence over any selected preset
          setSelectedPresetSlug(null);
          if (bannerPreview) URL.revokeObjectURL(bannerPreview);
          const url = URL.createObjectURL(file);
          setBannerCropSrc(url);
          setBannerCropZoom(1);
          setBannerCropPosition({ x: 0, y: 0 });
          setBannerCroppedArea(null);
          setBannerDialogOpen(true);
          if (bannerInputRef.current) bannerInputRef.current.value = "";
        }}
      />

      {/* Banner crop dialog */}
      <Dialog
        open={bannerDialogOpen}
        onClose={() => {
          if (bannerCropSrc) URL.revokeObjectURL(bannerCropSrc);
          setBannerCropSrc(null);
          setBannerDialogOpen(false);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { m: { xs: 2, sm: 3 }, maxHeight: { xs: "calc(100dvh - 32px)", sm: "calc(100dvh - 48px)" } },
        }}
      >
        <DialogTitle>Crop banner image</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
          {bannerCropSrc && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Box sx={{ position: "relative", height: 280 }}>
                <Cropper
                  image={bannerCropSrc}
                  crop={bannerCropPosition}
                  zoom={bannerCropZoom}
                  aspect={3}
                  onCropChange={setBannerCropPosition}
                  onZoomChange={setBannerCropZoom}
                  onCropComplete={handleBannerCropComplete}
                />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Zoom
                </Typography>
                <Slider
                  value={bannerCropZoom}
                  min={1}
                  max={3}
                  step={0.1}
                  valueLabelDisplay="auto"
                  onChange={(_, v) => setBannerCropZoom(Number(v))}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                Drag to reposition, use the slider to zoom.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
          <AppButton
            variant="outlined"
            onClick={() => {
              if (bannerCropSrc) URL.revokeObjectURL(bannerCropSrc);
              setBannerCropSrc(null);
              setBannerDialogOpen(false);
            }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            disabled={!bannerCroppedArea}
            onClick={handleBannerCropSave}
          >
            Use this crop
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
