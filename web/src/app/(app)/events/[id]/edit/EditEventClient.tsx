"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import Cropper, { type Area } from "react-easy-crop";
import { useParams, useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch, getApiBaseUrl, getAvatarBaseUrl, getImageFallbackBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import ListItemText from "@mui/material/ListItemText";
import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";

type PrefOverrides = {
  disabled?: boolean;
  disabled_metrics?: string[];
} | null;

const PREF_METRIC_LABELS: Record<string, string> = {
  reliability: "Reliability",
  sociability: "Sociability",
  presentation: "Cleanliness & consideration",
  hosting_skills: "Hosting quality",
};

const PREF_METRICS = ["reliability", "sociability", "presentation"] as const;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BANNER_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_BANNER_OUTPUT_BYTES = 400 * 1024;

export default function EditEventClient() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateValue, setDateValue] = useState<Dayjs | null>(null);
  const [timeValue, setTimeValue] = useState<Dayjs | null>(null);
  const [maxSeats, setMaxSeats] = useState("");
  const [visibility, setVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [schedulingMode, setSchedulingMode] = useState<"off" | "suggest" | "availability">("suggest");
  const [deadlineDate, setDeadlineDate] = useState<Dayjs | null>(null);
  const [deadlineTime, setDeadlineTime] = useState<Dayjs | null>(null);
  const [allowAttendeeInvites, setAllowAttendeeInvites] = useState(true);
  const [reserveSeats, setReserveSeats] = useState(false);
  const [requireReconfirmation, setRequireReconfirmation] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minConfirmed, setMinConfirmed] = useState("");
  const [fallbackPolicy, setFallbackPolicy] = useState<"notify_host" | "proceed" | "auto_cancel">("notify_host");

  const [hobbies, setHobbies] = useState<HobbyOption[]>([]);

  // Location
  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationArea, setLocationArea] = useState<string | null>(null);
  const [locationVisibility, setLocationVisibility] = useState<"exact_everyone" | "exact_joined_only" | "approximate_only">("exact_everyone");
  const [onlineLink, setOnlineLink] = useState("");

  // Chum preference overrides
  const [prefOverridesOpen, setPrefOverridesOpen] = useState(false);
  const [prefDisableAll, setPrefDisableAll] = useState(false);
  const [prefDisabledMetrics, setPrefDisabledMetrics] = useState<Record<string, boolean>>({});
  const [hostHasPrefs, setHostHasPrefs] = useState(false);

  // Community association
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState<string | null>(null);
  const [hideFromExplore, setHideFromExplore] = useState(false);

  // Banner image
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [existingBannerKey, setExistingBannerKey] = useState<string | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerCropZoom, setBannerCropZoom] = useState(1);
  const [bannerCropPosition, setBannerCropPosition] = useState({ x: 0, y: 0 });
  const [bannerCroppedArea, setBannerCroppedArea] = useState<Area | null>(null);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/events/${eventId}`, { auth: true });
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok || !data.event?.isHost) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const ev = data.event;
        setTitle(ev.title ?? "");
        setDescription(ev.description ?? "");
        const d = dayjs(ev.startsAt);
        setDateValue(d);
        setTimeValue(d);
        setMaxSeats(ev.maxSeats != null ? String(ev.maxSeats) : "");
        setVisibility(ev.visibility ?? "public");
        setRequireReconfirmation(ev.requireReconfirmation ?? false);
        setRequireApproval(ev.requireApproval ?? false);
        setAllowAttendeeInvites(ev.allowAttendeeInvites !== false);
        setSchedulingMode(
          !(ev.allowAltTimes ?? false) ? "off"
          : ev.altTimesMode === "availability" ? "availability"
          : "suggest"
        );
        if (ev.availabilityDeadlineAt) {
          const dl = dayjs(ev.availabilityDeadlineAt);
          setDeadlineDate(dl);
          setDeadlineTime(dl);
        }
        setReserveSeats(ev.reserveSeats === true);
        setMinConfirmed(ev.minConfirmedAttendees != null ? String(ev.minConfirmedAttendees) : "");
        setFallbackPolicy(ev.fallbackPolicy ?? "notify_host");

        // Location
        setLocationType(ev.locationType === "online" ? "online" : "in_person");
        setLocationName(ev.locationName ?? "");
        setLocationAddress(ev.locationAddress ?? "");
        setLocationLat(ev.locationLat ?? null);
        setLocationLng(ev.locationLng ?? null);
        setLocationArea(ev.locationArea ?? null);
        setLocationVisibility(ev.locationVisibility ?? "exact_everyone");
        setOnlineLink(ev.onlineLink ?? "");

        const h = ev.hobbies?.length > 0
          ? ev.hobbies
          : ev.hobby ? [{ name: ev.hobby, slug: ev.hobbySlug ?? "" }] : [];
        setHobbies(h);

        // Community association
        if (ev.community) {
          setCommunityId(ev.community.id);
          setCommunityName(ev.community.name);
        }
        if (ev.hideFromExplore !== undefined) setHideFromExplore(ev.hideFromExplore === true);

        if (ev.bannerKey) {
          setExistingBannerKey(ev.bannerKey);
          const ts = Date.now();
          setBannerPreview(`${getAvatarBaseUrl()}/events/${ev.id}/banner?v=${ts}`);
        }

        // Load pref overrides
        const po: PrefOverrides = ev.prefOverrides ?? null;
        if (po) {
          if (po.disabled) {
            setPrefDisableAll(true);
            setPrefOverridesOpen(true);
          } else if (po.disabled_metrics?.length) {
            const dm: Record<string, boolean> = {};
            for (const m of po.disabled_metrics) dm[m] = true;
            setPrefDisabledMetrics(dm);
            setPrefOverridesOpen(true);
          }
        }

        // Check if host has chum preferences enabled
        try {
          const cpRes = await apiFetch("/chum-preferences", { auth: true });
          const cpData = await cpRes.json();
          if (!cancelled && cpData.ok) {
            setHostHasPrefs(cpData.preferences?.enabled !== false);
          }
        } catch { /* non-fatal */ }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId]);

  const buildPrefOverrides = (): PrefOverrides => {
    if (prefDisableAll) return { disabled: true };
    const dm = Object.entries(prefDisabledMetrics).filter(([, v]) => v).map(([k]) => k);
    if (dm.length > 0) return { disabled_metrics: dm };
    return null;
  };

  const handleBannerCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setBannerCroppedArea(croppedAreaPx);
  }, []);

  const handleBannerCropSave = useCallback(async () => {
    if (!bannerCropSrc || !bannerCroppedArea) return;
    try {
      const blob = await getCroppedImg(bannerCropSrc, bannerCroppedArea as PixelCrop, 1200, 400, MAX_BANNER_OUTPUT_BYTES);
      URL.revokeObjectURL(bannerCropSrc);
      setBannerCropSrc(null);
      const file = new File([blob], "banner.webp", { type: blob.type || "image/webp" });
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setBannerRemoved(false);
      setBannerDialogOpen(false);
    } catch {
      toast.error("Failed to process image");
    }
  }, [bannerCropSrc, bannerCroppedArea, toast]);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!dateValue?.isValid() || !timeValue?.isValid()) { toast.error("Date and time are required"); return; }
    if (hobbies.length === 0) { toast.error("At least one hobby is required"); return; }
    const startsAt = dateValue.hour(timeValue.hour()).minute(timeValue.minute()).second(0).toISOString();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          starts_at: startsAt,
          interest_items: hobbies.map((h) => ({ slug: h.slug, name: h.name })),
          max_seats: maxSeats ? Number(maxSeats) : null,
          reserve_seats: maxSeats ? reserveSeats : false,
          visibility,
          require_reconfirmation: requireReconfirmation,
          require_approval: requireApproval,
          allow_attendee_invites: allowAttendeeInvites,
          allow_alt_times: schedulingMode !== "off",
          alt_times_mode: schedulingMode === "availability" ? "availability" : "suggest",
          availability_deadline_at: schedulingMode === "availability" && deadlineDate?.isValid() && deadlineTime?.isValid()
            ? deadlineDate.hour(deadlineTime.hour()).minute(deadlineTime.minute()).second(0).toISOString()
            : null,
          min_confirmed_attendees: requireReconfirmation && minConfirmed ? Number(minConfirmed) : null,
          fallback_policy: requireReconfirmation ? fallbackPolicy : "notify_host",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          pref_overrides: buildPrefOverrides(),
          community_id: communityId || null,
          hide_from_explore: hideFromExplore,
          location_type: locationType,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
          location_place_id: locationPlaceId,
          location_lat: locationLat,
          location_lng: locationLng,
          location_area: locationType === "in_person" ? (locationArea?.trim() || null) : null,
          location_visibility: locationType === "in_person" ? locationVisibility : "exact_everyone",
          online_link: locationType === "online" ? onlineLink.trim() || null : null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        if (bannerFile) {
          try {
            const bInitRes = await apiFetch("/media/init", {
              auth: true,
              method: "POST",
              body: JSON.stringify({
                purpose: "event_banner",
                contentType: bannerFile.type || "image/webp",
                contentLength: bannerFile.size,
              }),
            });
            const bInitData = (await bInitRes.json()) as { ok?: boolean; uploadUrl?: string; objectKey?: string };
            if (bInitData.ok && bInitData.uploadUrl && bInitData.objectKey) {
              const uploadUrl = `${getApiBaseUrl()}${bInitData.uploadUrl}`;
              const uploadRes = await fetch(uploadUrl, {
                method: "PUT",
                body: bannerFile,
                headers: { "Content-Type": bannerFile.type || "image/webp" },
                credentials: "omit",
              });
              if (uploadRes.ok) {
                await apiFetch("/media/finalize", {
                  auth: true,
                  method: "POST",
                  body: JSON.stringify({
                    objectKey: bInitData.objectKey,
                    purpose: "event_banner",
                    eventId,
                  }),
                });
              }
            }
          } catch { /* banner upload failure is non-fatal */ }
        } else if (bannerRemoved && existingBannerKey) {
          try {
            await apiFetch(`/events/${eventId}`, {
              auth: true,
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ banner_key: null }),
            });
          } catch { /* non-fatal */ }
        }
        toast.success("Plan updated");
        router.push(`/events/${eventId}`);
      } else {
        toast.error(data.message ?? "Couldn't save changes");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (notFound) {
    return (
      <Stack spacing={2} sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h5" fontWeight={600}>Plan not found or you don&apos;t have access</Typography>
        <AppButton variant="outlined" onClick={() => router.back()}>Go back</AppButton>
      </Stack>
    );
  }

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
          Edit plan
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Update the details for this plan. Changes will notify attendees who are Going or Maybe.
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
              Upload a custom photo for this plan.
            </Typography>
          </Box>

          <Box
            onClick={() => bannerInputRef.current?.click()}
            sx={{
              width: "100%",
              height: { xs: 140, sm: 180 },
              borderRadius: 2.5,
              border: "2px dashed",
              borderColor: bannerPreview ? "transparent" : "grey.300",
              bgcolor: bannerPreview ? "transparent" : "grey.50",
              cursor: "pointer",
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
                onError={() => {
                  if (bannerPreview.startsWith(getAvatarBaseUrl())) {
                    const fb = getImageFallbackBaseUrl();
                    if (fb) {
                      setBannerPreview(bannerPreview.replace(getAvatarBaseUrl(), fb));
                      return;
                    }
                  }
                  setBannerPreview(null);
                }}
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <Stack alignItems="center" spacing={0.75}>
                <AddPhotoAlternateRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary">
                  Upload a photo
                </Typography>
              </Stack>
            )}
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {bannerPreview && (
              <AppButton
                variant="outlined"
                size="small"
                onClick={() => bannerInputRef.current?.click()}
              >
                Change photo
              </AppButton>
            )}
            {bannerPreview && (
              <AppButton
                variant="text"
                size="small"
                color="error"
                onClick={() => {
                  setBannerFile(null);
                  if (bannerPreview && !bannerPreview.startsWith("http")) URL.revokeObjectURL(bannerPreview);
                  setBannerPreview(null);
                  setBannerRemoved(true);
                }}
              >
                Remove
              </AppButton>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            JPEG, PNG, or WebP up to 20 MB, we&apos;ll compress it automatically.
          </Typography>
        </Stack>
      </AppCard>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Plan details
          </Typography>

          <AppTextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            inputProps={{ maxLength: 200 }}
            helperText={null}
          />

          <AppTextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            maxRows={6}
            inputProps={{ maxLength: 2000 }}
            helperText={null}
          />

          <HobbyPickerField
            value={hobbies}
            onChange={setHobbies}
            onReject={(msg) => toast.error(msg)}
          />

          <AppTextField
            label="Max seats (optional)"
            type="number"
            value={maxSeats}
            onChange={(e) => setMaxSeats(e.target.value)}
            inputProps={{ min: 1 }}
            helperText="Include yourself in the count"
          />
          {maxSeats && Number(maxSeats) >= 1 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={reserveSeats}
                  onChange={(e) => setReserveSeats(e.target.checked)}
                />
              }
              label={<Typography variant="body2" fontWeight={500}>Reserve seats for invited people</Typography>}
              sx={{ alignItems: "center", mt: 0.5 }}
            />
          )}
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
                slotProps={{ textField: { fullWidth: true, size: "medium" } }}
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
                slotProps={{ field: { shouldRespectLeadingZeros: true } as Record<string, unknown>, textField: { fullWidth: true, size: "medium" } }}
              />
            </Box>
          </Stack>
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
              Alternate times
            </Typography>
            <RadioGroup
              value={schedulingMode}
              onChange={(e) => {
                const mode = e.target.value as "off" | "suggest" | "availability";
                setSchedulingMode(mode);
                if (mode !== "availability") { setDeadlineDate(null); setDeadlineTime(null); }
              }}
            >
              <FormControlLabel value="suggest" control={<Radio size="small" />} label={<Typography variant="body2" fontWeight={500}>Allow suggestions</Typography>} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -0.5, mb: 0.5 }}>
                People can suggest other times if the listed time doesn't work.
              </Typography>
              <FormControlLabel value="availability" control={<Radio size="small" />} label={<Typography variant="body2" fontWeight={500}>Request availability</Typography>} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mt: -0.5, mb: 0.5 }}>
                Ask attendees to share when they're free so you can find the best time.
              </Typography>
              {schedulingMode === "availability" && (
                <Box sx={{ ml: 4, mb: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
                    Availability needed by (optional)
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <DatePicker
                      value={deadlineDate}
                      onChange={setDeadlineDate}
                      slotProps={{ textField: { size: "small", placeholder: "Date", sx: { flex: 1 } } }}
                    />
                    <TimePicker
                      value={deadlineTime}
                      onChange={setDeadlineTime}
                      format="h:mm A"
                      slotProps={{
                        field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                        textField: { size: "small", placeholder: "Time", sx: { flex: 1 } },
                      }}
                    />
                  </Stack>
                </Box>
              )}
              <FormControlLabel value="off" control={<Radio size="small" />} label={<Typography variant="body2" fontWeight={500}>Off</Typography>} />
            </RadioGroup>
          </Box>
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
                placeTypes={[]}
                inputId="places-autocomplete-edit-event"
              />
              <FormControl fullWidth size="medium" sx={{ minWidth: 200 }}>
                <Typography
                  component="label"
                  htmlFor="edit-location-visibility-select"
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{ display: "block", mb: 0.625 }}
                >
                  Who can see the exact location?
                </Typography>
                <Select
                  id="edit-location-visibility-select"
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
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Who can see this?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Controls who can find this plan and who may get notified about it.
            </Typography>
          </Box>

          <FormControl component="fieldset">
            <RadioGroup
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as typeof visibility)}
            >
              <FormControlLabel value="public" control={<Radio size="small" />} label="Public" />
              <FormControlLabel value="chums_only" control={<Radio size="small" />} label="Chums only" />
              <FormControlLabel value="invite_only" control={<Radio size="small" />} label="Invite only" />
            </RadioGroup>
          </FormControl>
        </Stack>
      </AppCard>

      {/* Extra options */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Extra options
          </Typography>

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <FormControlLabel
              control={<Switch size="small" checked={requireReconfirmation} onChange={(e) => setRequireReconfirmation(e.target.checked)} />}
              label={<Typography variant="body2" fontWeight={500}>Require final confirmation before the plan</Typography>}
              sx={{ alignItems: "center", mt: 0.5, mr: 0 }}
            />
            <Tooltip title="Going attendees will be asked to confirm 24 hours before. This includes you as the host." arrow placement="top" enterTouchDelay={0}>
              <IconButton size="small" sx={{ p: 0.25, color: "text.disabled", mt: 0.5 }}>
                <HelpOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>
          {requireReconfirmation && (
            <Stack spacing={2} sx={{ mt: 1, pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
              <Box>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                  Minimum confirmed attendees (optional)
                </Typography>
                <TextField
                  fullWidth size="small" type="number"
                  placeholder="e.g. 4 (including you)"
                  value={minConfirmed}
                  onChange={(e) => setMinConfirmed(e.target.value)}
                  inputProps={{ min: 1, max: 500 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  You count toward this total.
                </Typography>
              </Box>
              {minConfirmed && Number(minConfirmed) >= 1 && (
                <Box>
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                    If minimum isn&apos;t met
                  </Typography>
                  <Select
                    fullWidth size="small"
                    value={fallbackPolicy}
                    onChange={(e) => setFallbackPolicy(e.target.value as typeof fallbackPolicy)}
                  >
                    <MenuItem value="notify_host">Notify me so I can decide</MenuItem>
                    <MenuItem value="proceed">Proceed unless I cancel</MenuItem>
                    <MenuItem value="auto_cancel">Auto-cancel the plan</MenuItem>
                  </Select>
                </Box>
              )}
            </Stack>
          )}

          <Stack direction="row" alignItems="center" spacing={0.5}>
            <FormControlLabel
              control={<Switch size="small" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />}
              label={<Typography variant="body2" fontWeight={500}>Require approval before joining</Typography>}
              sx={{ alignItems: "center", mt: 0.5, mr: 0 }}
            />
            <Tooltip title="People who are not directly invited will need to request to join, and you'll approve or decline each request." arrow placement="top" enterTouchDelay={0}>
              <IconButton size="small" sx={{ p: 0.25, color: "text.disabled", mt: 0.5 }}>
                <HelpOutlineRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          <FormControlLabel
            control={<Switch size="small" checked={allowAttendeeInvites} onChange={(e) => setAllowAttendeeInvites(e.target.checked)} />}
            label={<Typography variant="body2" fontWeight={500}>Let Going attendees invite others</Typography>}
            sx={{ alignItems: "center", mt: 0.5 }}
          />
        </Stack>
      </AppCard>

      {/* Matching preferences override */}
      {hostHasPrefs && (
        <AppCard>
          <Stack spacing={1.5}>
            <Box
              onClick={() => setPrefOverridesOpen((v) => !v)}
              sx={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}
            >
              <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", flex: 1 }}>
                Matching preferences for this plan
              </Typography>
              <ExpandMoreRoundedIcon
                sx={{
                  transform: prefOverridesOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  color: "text.secondary",
                }}
              />
            </Box>

            <Collapse in={prefOverridesOpen}>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  Your profile chum preferences are used by default when matching people to your plans.
                  You can relax those rules for this plan only, without changing your profile settings.
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={prefDisableAll}
                      onChange={(e) => {
                        setPrefDisableAll(e.target.checked);
                        if (e.target.checked) setPrefDisabledMetrics({});
                      }}
                    />
                  }
                  label={<Typography variant="body2" fontWeight={500}>Disable all preference filtering for this plan</Typography>}
                  sx={{ alignItems: "center" }}
                />

                {!prefDisableAll && (
                  <Stack spacing={1} sx={{ pl: 0.5 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                      Or disable specific metrics for this plan:
                    </Typography>
                    {PREF_METRICS.map((metric) => (
                      <FormControlLabel
                        key={metric}
                        control={
                          <Switch
                            size="small"
                            checked={!!prefDisabledMetrics[metric]}
                            onChange={(e) =>
                              setPrefDisabledMetrics((prev) => ({ ...prev, [metric]: e.target.checked }))
                            }
                          />
                        }
                        label={
                          <Typography variant="body2">
                            Skip <strong>{PREF_METRIC_LABELS[metric]}</strong> filtering
                          </Typography>
                        }
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Collapse>
          </Stack>
        </AppCard>
      )}

      {/* Info note */}
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.65, px: 0.5 }}>
        Saving changes to this plan (such as date, description, capacity, or visibility) will send an update email to attendees who are Going or Maybe.
      </Typography>

      {/* Actions */}
      {/* Community association */}
      {communityId && communityName && (
        <AppCard>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>Community</Typography>
            <Typography variant="body2" color="text.secondary">
              This plan is linked to <strong>{communityName}</strong>.
            </Typography>
            <FormControlLabel
              control={<Switch checked={hideFromExplore} onChange={(e) => setHideFromExplore(e.target.checked)} size="small" />}
              label="Members only"
              slotProps={{ typography: { variant: "body2" } }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
              When on, this plan only appears in the community feed and to members in their Explore. Others won&#39;t see it.
            </Typography>
          </Stack>
        </AppCard>
      )}

      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={2}
        justifyContent="flex-end"
        sx={{ pt: 1, pb: 4 }}
      >
        <AppButton
          variant="outlined"
          color="inherit"
          onClick={() => router.push(`/events/${eventId}`)}
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
          {submitting ? <CircularProgress size={22} color="inherit" /> : "Save changes"}
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
          if (file.size > MAX_BANNER_INPUT_BYTES) {
            toast.error("Image must be 20MB or less.");
            return;
          }
          if (bannerPreview && !bannerPreview.startsWith("http")) URL.revokeObjectURL(bannerPreview);
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
