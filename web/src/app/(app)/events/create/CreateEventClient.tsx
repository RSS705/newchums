"use client";

import { useCallback, useEffect, useRef, useState, type WheelEvent } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";

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
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import Cropper, { type Area } from "react-easy-crop";
import { useRouter, useSearchParams } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import PlacesAutocompleteInput, { formatPlaceDisplay } from "@/components/common/PlacesAutocompleteInput";
import { apiFetch, getApiBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { notifyObjectivesChanged } from "@/components/objectives/NextStepNudge";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { BANNER_PRESETS, renderBannerPreset, suggestPreset } from "@/lib/eventBanners";
import { scrollToFirstError } from "@/lib/scrollToFirstError";
import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";
import {
  CommunityLinkSection,
  ExtraOptionsSection,
  MatchingPreferencesSection,
  QAPlanSection,
  type MyCommunity as SharedMyCommunity,
} from "@/components/events/planForm";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";

// Visual top-to-bottom order of validation-bearing fields. Drives the
// scroll-to-first-error helper so the user always lands on the earliest
// problem they need to fix rather than a later one.
const FIELD_ORDER = ["title", "hobby", "maxSeats", "minAttendeesRequired", "date", "time", "location"] as const;

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BANNER_INPUT_BYTES = 20 * 1024 * 1024; // 20MB, raw file limit before compression
const MAX_BANNER_OUTPUT_BYTES = 400 * 1024; // 400KB, compressed output target

export default function CreateEventClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedHobbies, setSelectedHobbies] = useState<HobbyOption[]>([]);
  const [maxSeats, setMaxSeats] = useState("");

  // Start null on SSR and the initial client render so both sides emit
  // the same empty picker markup. A post-mount effect populates the
  // defaults to "now", which keeps today's date as the default
  // date/time for the form while avoiding a hydration mismatch (React
  // #418) from server `dayjs()` and client `dayjs()` producing
  // different timestamps.
  const [dateValue, setDateValue] = useState<Dayjs | null>(null);
  const [timeValue, setTimeValue] = useState<Dayjs | null>(null);
  useEffect(() => {
    // Schedule-block deeplink: `?day=N&start_hhmm=HH:MM` (and optionally
    // `end_hhmm`). Sent by the community Schedule tab's "Start a plan
    // during this time" CTA so the create form opens with the right
    // weekday and start time pre-filled. The user can still adjust
    // before publishing; we only seed defaults, we don't lock anything.
    const dayParam = searchParams.get("day");
    const startHHMM = searchParams.get("start_hhmm");
    let date = dayjs();
    let time = dayjs();
    if (dayParam !== null && /^[0-6]$/.test(dayParam)) {
      const targetDay = Number(dayParam);
      const today = dayjs().startOf("day");
      const diff = ((targetDay - today.day()) + 7) % 7;
      date = today.add(diff, "day");
    }
    if (startHHMM) {
      const m = /^(\d{1,2}):(\d{2})$/.exec(startHHMM.trim());
      if (m) {
        const hh = Number(m[1]);
        const mm = Number(m[2]);
        if (Number.isFinite(hh) && hh >= 0 && hh <= 23 && Number.isFinite(mm) && mm >= 0 && mm <= 59) {
          time = dayjs().hour(hh).minute(mm).second(0).millisecond(0);
        }
      }
    }
    setDateValue(date);
    setTimeValue(time);
    // Mount-only seeding. Subsequent searchParams changes shouldn't
    // override a value the user has already touched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState<string | null>(null);
  const [locationLat, setLocationLat] = useState<number | null>(null);
  const [locationLng, setLocationLng] = useState<number | null>(null);
  const [locationArea, setLocationArea] = useState<string | null>(null);
  const [locationVisibility, setLocationVisibility] = useState<
    "exact_everyone" | "exact_joined_only" | "approximate_only"
  >("exact_everyone");
  const [onlineLink, setOnlineLink] = useState("");

  const [visibility, setVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [schedulingMode, setSchedulingMode] = useState<"off" | "suggest" | "availability">(
    "suggest"
  );
  const [deadlineDate, setDeadlineDate] = useState<Dayjs | null>(null);
  const [deadlineTime, setDeadlineTime] = useState<Dayjs | null>(null);
  const [allowAttendeeInvites, setAllowAttendeeInvites] = useState(true);
  const [reserveSeats, setReserveSeats] = useState(false);
  const [requireReconfirmation, setRequireReconfirmation] = useState(false);
  const [muteHostAttendanceEmails, setMuteHostAttendanceEmails] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minConfirmedAttendees, setMinConfirmedAttendees] = useState("");
  const [fallbackPolicy, setFallbackPolicy] = useState<"notify_host" | "proceed" | "auto_cancel">(
    "notify_host"
  );
  // Optional RSVP-based threshold. If set, the cron auto-cancels the plan 2
  // hours before start when fewer than this many people are "going" (host
  // counts toward the total, matching the rest of the product).
  const [minAttendeesRequired, setMinAttendeesRequired] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Field-level scroll targets for the validation-error recenter behavior.
  // Each errored field wraps its visual block in a Box that registers itself
  // here on mount, so handleSubmit can scroll the first failing one into view.
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({});
  const setFieldRef = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      fieldRefs.current[key] = el;
    },
    []
  );

  // Chum preference overrides
  const [prefOverridesOpen, setPrefOverridesOpen] = useState(false);
  const [prefDisableAll, setPrefDisableAll] = useState(false);
  const [prefDisabledMetrics, setPrefDisabledMetrics] = useState<Record<string, boolean>>({});

  // Community association
  type MyCommunity = {
    id: string;
    slug: string;
    name: string;
    is_online: boolean;
    location_name: string | null;
    location_address: string | null;
    location_lat: number | null;
    location_lng: number | null;
  };
  const [myCommunities, setMyCommunities] = useState<MyCommunity[]>([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>(() => {
    const initial = searchParams.get("community_id");
    return initial ? [initial] : [];
  });
  const [hideFromExplore, setHideFromExplore] = useState(false);

  // QA plan (super admin only)
  const [isQa, setIsQa] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

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
    loadGooglePlacesScript().catch((err) => {
      console.warn("[CreateEventClient] Google Places script failed to load:", err);
    });
  }, []);

  // Fetch profile (for QA toggle) and user's communities (for the community selector)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [profileRes, communitiesRes] = await Promise.allSettled([
          apiFetch("/profile", { auth: true }),
          apiFetch("/communities?mine=1&limit=50", { auth: true }),
        ]);
        if (cancelled) return;
        if (profileRes.status === "fulfilled" && profileRes.value.ok) {
          const d = await profileRes.value.json();
          if (d.ok && d.profile?.role === "super_admin") setIsSuperAdmin(true);
        }
        if (communitiesRes.status === "fulfilled" && communitiesRes.value.ok) {
          const d = await communitiesRes.value.json();
          if (d.ok && Array.isArray(d.communities)) {
            const list: MyCommunity[] = d.communities.map((c: Record<string, unknown>) => ({
              id: String(c.id),
              slug: String(c.slug ?? ""),
              name: String(c.name ?? ""),
              is_online: c.is_online === true,
              location_name: (c.location_name as string) ?? null,
              location_address: (c.location_address as string) ?? null,
              location_lat: c.location_lat != null ? Number(c.location_lat) : null,
              location_lng: c.location_lng != null ? Number(c.location_lng) : null,
            }));
            setMyCommunities(list);

            // If arriving from a community page, prefill location from that community
            const preselectedId = searchParams.get("community_id");
            if (preselectedId) {
              const match = list.find((c) => c.id === preselectedId);
              if (match && !match.is_online && match.location_name && !locationName) {
                setLocationName(match.location_name);
                if (match.location_address) setLocationAddress(match.location_address);
                if (match.location_lat != null && match.location_lng != null) {
                  setLocationLat(match.location_lat);
                  setLocationLng(match.location_lng);
                }
              }
            }
          }
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When visibility switches to invite_only, clear any community linkage so
  // the form state matches what the server will store (POST /events forces
  // an empty community list for invite_only) and the Community section
  // disappears rather than misleading the user. Mirror of the same effect in
  // the Edit form. See AGENTS.md -> Plan Feed and Community Visibility
  // Contract.
  useEffect(() => {
    if (visibility === "invite_only") {
      setSelectedCommunityIds([]);
      setHideFromExplore(false);
    }
  }, [visibility]);

  const handleBannerCropComplete = useCallback((_: Area, croppedAreaPx: Area) => {
    setBannerCroppedArea(croppedAreaPx);
  }, []);

  const handleBannerCropSave = useCallback(async () => {
    if (!bannerCropSrc || !bannerCroppedArea) return;
    try {
      const blob = await getCroppedImg(
        bannerCropSrc,
        bannerCroppedArea as PixelCrop,
        1200,
        400,
        MAX_BANNER_OUTPUT_BYTES
      );
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

  const handlePresetSelect = useCallback(
    async (slug: string) => {
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
    },
    [presetRendering, bannerPreview, selectedPresetSlug, toast]
  );

  // Auto-suggest a preset based on the first hobby selected (fires once)
  useEffect(() => {
    if (autoSuggestedRef.current) return;
    if (!selectedHobbies.length || bannerFile) return;
    const suggestion = suggestPreset(selectedHobbies.map((h) => h.slug));
    if (!suggestion) return;
    autoSuggestedRef.current = true;
    void handlePresetSelect(suggestion);
  }, [selectedHobbies, bannerFile, handlePresetSelect]);

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Give your plan a title";
    if (selectedHobbies.length === 0)
      errs.hobby = "Add at least one hobby so people can find this plan";
    if (!dateValue || !dateValue.isValid()) errs.date = "Pick a date";
    if (!timeValue || !timeValue.isValid()) errs.time = "Pick a time";
    if (locationType === "in_person") {
      if (!locationName.trim() && !locationAddress.trim()) {
        errs.location = "Add a venue or address";
      } else if (locationLat == null || locationLng == null) {
        errs.location = "Please pick a location from the suggestions";
      }
    }
    if (maxSeats && (isNaN(Number(maxSeats)) || Number(maxSeats) < 1))
      errs.maxSeats = "Must be a positive number";
    if (minAttendeesRequired) {
      const n = Number(minAttendeesRequired);
      if (isNaN(n) || n < 1) {
        errs.minAttendeesRequired = "Must be at least 1";
      } else if (maxSeats && n > Number(maxSeats)) {
        errs.minAttendeesRequired = "Can't be more than the seat count";
      }
    }
    setErrors(errs);
    return errs;
  };

  const buildPrefOverrides = (): { disabled?: boolean; disabled_metrics?: string[] } | null => {
    if (prefDisableAll) return { disabled: true };
    const dm = Object.entries(prefDisabledMetrics)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (dm.length > 0) return { disabled_metrics: dm };
    return null;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      // scrollToFirstError -> scrollElementIntoView already double-rAFs
      // internally to wait for layout to settle, so no outer rAF wrapper
      // needed here. The previous attempt's single-rAF wrapper was racing
      // React's commit on slow mobile devices.
      scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER);
      return;
    }
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
      location_area: locationType === "in_person" ? locationArea?.trim() || null : null,
      location_visibility: locationType === "in_person" ? locationVisibility : "exact_everyone",
      online_link: locationType === "online" ? onlineLink.trim() || null : null,
      max_seats: maxSeats ? Number(maxSeats) : null,
      reserve_seats: maxSeats ? reserveSeats : false,
      visibility,
      allow_alt_times: schedulingMode !== "off",
      alt_times_mode: schedulingMode === "availability" ? "availability" : "suggest",
      availability_deadline_at:
        schedulingMode === "availability" && deadlineDate?.isValid() && deadlineTime?.isValid()
          ? deadlineDate
              .hour(deadlineTime.hour())
              .minute(deadlineTime.minute())
              .second(0)
              .toISOString()
          : null,
      allow_attendee_invites: allowAttendeeInvites,
      require_reconfirmation: requireReconfirmation,
      mute_host_attendance_emails: muteHostAttendanceEmails,
      require_approval: requireApproval,
      min_confirmed_attendees:
        requireReconfirmation && minConfirmedAttendees ? Number(minConfirmedAttendees) : null,
      fallback_policy: requireReconfirmation ? fallbackPolicy : "notify_host",
      min_attendees_required: minAttendeesRequired ? Number(minAttendeesRequired) : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      status: "published",
      pref_overrides: buildPrefOverrides(),
      community_ids: selectedCommunityIds,
      hide_from_explore: hideFromExplore,
      ...(isQa ? { is_qa: true } : {}),
    };

    try {
      const res = await apiFetch("/events", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok: boolean;
        event?: { id: string };
        error?: string;
        message?: string;
        field?: string;
      };
      if (data.ok && data.event) {
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
            const bInitData = (await bInitRes.json()) as {
              ok?: boolean;
              uploadToken?: string;
              objectKey?: string;
              uploadUrl?: string;
            };
            if (
              bInitData.ok &&
              bInitData.uploadToken &&
              bInitData.uploadUrl &&
              bInitData.objectKey
            ) {
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
                    eventId: data.event.id,
                  }),
                });
              }
            }
          } catch {
            /* banner upload failure is non-fatal */
          }
        }
        toast.success("Plan created!");
        notifyObjectivesChanged();
        router.push(`/events/${data.event.id}`);
      } else {
        if (data.field) {
          const fieldErrs = { [data.field]: data.message ?? "Validation error" };
          setErrors(fieldErrs);
          scrollToFirstError(fieldRefs.current, fieldErrs, FIELD_ORDER);
        } else {
          toast.error(data.message ?? "Something went wrong");
        }
      }
    } catch {
      toast.error("Network error, please try again");
    }
    setSubmitting(false);
  };

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Warm-wash hero matching the rest of the polished
          surfaces (Explore, Your Plans, Communities, Profile, Settings,
          Roadmap, Contact, etc.). */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
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
              <AddCircleRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
              New plan
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
            Start a plan
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
            Organize a gathering around something you enjoy. Keep it simple, you can always update later.
          </Typography>
        </Stack>
      </Paper>

      {/* Banner image */}
      <AppCard>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ImageRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Banner image
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Pick a colour theme or upload your own photo.
              </Typography>
            </Box>
          </Stack>

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
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(99,102,241,0.35)"
                      : "0 1px 3px rgba(0,0,0,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "transform 0.1s ease, box-shadow 0.1s ease",
                    "&:hover": { transform: presetRendering ? "none" : "scale(1.06)" },
                  }}
                >
                  {isSelected && (
                    <CheckRoundedIcon
                      sx={{
                        fontSize: 16,
                        color: "white",
                        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
                      }}
                    />
                  )}
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
            Custom photos: JPEG, PNG, or WebP up to 20 MB, we&apos;ll compress it automatically.
          </Typography>
        </Stack>
      </AppCard>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <EventNoteRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                What&apos;s the plan?
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Title, description, and the hobbies it&apos;s about.
              </Typography>
            </Box>
          </Stack>

          <Box ref={setFieldRef("title")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Title"
              placeholder="e.g. Thursday Board Game Night"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={!!errors.title}
              helperText={errors.title || null}
              inputProps={{ maxLength: 200 }}
            />
          </Box>

          <RichTextEditor
            label="Description"
            placeholder="What should people expect? Any details they should know?"
            value={description}
            onChange={setDescription}
          />

          <Box ref={setFieldRef("hobby")} sx={{ scrollMarginTop: 96 }}>
            <HobbyPickerField
              value={selectedHobbies}
              onChange={setSelectedHobbies}
              error={errors.hobby}
              onReject={(msg) => toast.error(msg)}
            />
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="flex-start">
            <Box
              ref={setFieldRef("maxSeats")}
              sx={{ width: { xs: "100%", sm: "auto" }, scrollMarginTop: 96 }}
            >
              <AppTextField
                label="Seats"
                placeholder="e.g. 8"
                value={maxSeats}
                onChange={(e) => setMaxSeats(e.target.value)}
                error={!!errors.maxSeats}
                helperText={errors.maxSeats ?? "Include yourself in the count"}
                type="number"
                // Disable scroll-wheel value changes. Browsers' default behaviour for
                // type=number is to decrement/increment on wheel events while focused,
                // which has silently set seats to 1 (the min) when hosts scrolled the
                // page after typing a value. Blurring on wheel preserves what they typed.
                inputProps={{
                  min: 1,
                  max: 500,
                  onWheel: (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
                }}
                sx={{ minWidth: { xs: "100%", sm: 260 } }}
              />
            </Box>
          </Stack>
          {maxSeats && Number(maxSeats) >= 1 && (
            <>
              <FormControlLabel
                control={
                  <Switch
                    checked={reserveSeats}
                    onChange={(e) => setReserveSeats(e.target.checked)}
                  />
                }
                label="Reserve seats for invited people"
                sx={{ gap: 0.5 }}
              />
            </>
          )}

          <Box
            ref={setFieldRef("minAttendeesRequired")}
            sx={{ width: { xs: "100%", sm: "auto" }, scrollMarginTop: 96 }}
          >
            <AppTextField
              label="Minimum attendees required (optional)"
              placeholder="e.g. 4"
              value={minAttendeesRequired}
              onChange={(e) => setMinAttendeesRequired(e.target.value)}
              error={!!errors.minAttendeesRequired}
              helperText={
                errors.minAttendeesRequired ??
                "If fewer than this many people are going 2 hours before the plan, NewChums will automatically cancel it."
              }
              type="number"
              inputProps={{
                min: 1,
                max: 500,
                onWheel: (e: WheelEvent<HTMLInputElement>) => e.currentTarget.blur(),
              }}
              sx={{ minWidth: { xs: "100%", sm: 320 } }}
            />
          </Box>
        </Stack>
      </AppCard>

      {/* Date & time */}
      <AppCard>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AccessTimeRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                When?
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Date, time, and how flexible you want to be.
              </Typography>
            </Box>
          </Stack>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Box ref={setFieldRef("date")} sx={{ flex: 1, scrollMarginTop: 96 }}>
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
                    onKeyDown: pickerFieldTabKeyDown,
                  },
                }}
              />
            </Box>
            <Box ref={setFieldRef("time")} sx={{ flex: 1, scrollMarginTop: 96 }}>
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
                    onKeyDown: pickerFieldTabKeyDown,
                  },
                }}
              />
            </Box>
          </Stack>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
              Alternate times
            </Typography>
            <RadioGroup
              value={schedulingMode}
              onChange={(e) => {
                const mode = e.target.value as "off" | "suggest" | "availability";
                setSchedulingMode(mode);
                if (mode !== "availability") {
                  setDeadlineDate(null);
                  setDeadlineTime(null);
                }
              }}
            >
              <FormControlLabel
                value="suggest"
                control={<Radio />}
                label="Allow suggestions"
                sx={{ gap: 0.5 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: "32px", mt: -0.5, mb: 0.5 }}
              >
                People can suggest other times if the listed time doesn&apos;t work.
              </Typography>
              <FormControlLabel
                value="availability"
                control={<Radio />}
                label="Request availability"
                sx={{ gap: 0.5 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ ml: "32px", mt: -0.5, mb: 0.5 }}
              >
                Ask attendees to share when they&apos;re free so you can find the best time.
              </Typography>
              {schedulingMode === "availability" && (
                <Box sx={{ ml: "32px", mb: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mb: 0.75 }}
                  >
                    Availability needed by (optional)
                  </Typography>
                  <Stack direction="row" spacing={1.5}>
                    <DatePicker
                      value={deadlineDate}
                      onChange={setDeadlineDate}
                      minDate={dayjs()}
                      slotProps={{
                        textField: {
                          size: "small",
                          placeholder: "Date",
                          sx: { flex: 1 },
                          onKeyDown: pickerFieldTabKeyDown,
                        },
                      }}
                    />
                    <TimePicker
                      value={deadlineTime}
                      onChange={setDeadlineTime}
                      format="h:mm A"
                      slotProps={{
                        field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                        textField: {
                          size: "small",
                          placeholder: "Time",
                          sx: { flex: 1 },
                          onKeyDown: pickerFieldTabKeyDown,
                        },
                      }}
                    />
                  </Stack>
                </Box>
              )}
              <FormControlLabel value="off" control={<Radio />} label="Off" sx={{ gap: 0.5 }} />
            </RadioGroup>
          </Box>
        </Stack>
      </AppCard>

      {/* Location */}
      <AppCard>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <PlaceRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Where?
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                In-person address or an online meeting link.
              </Typography>
            </Box>
          </Stack>

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
              <Box ref={setFieldRef("location")} sx={{ scrollMarginTop: 96 }}>
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
                    setLocationName(formatPlaceDisplay(result));
                    setLocationAddress(result.formattedAddress);
                    setLocationPlaceId(result.placeId);
                    setLocationLat(result.lat);
                    setLocationLng(result.lng);
                    setLocationArea(result.area ?? null);
                  }}
                  label="Venue or address"
                  placeholder="Search for a place or enter an address"
                  helperText={errors.location || undefined}
                  error={!!errors.location}
                  placeTypes={[]}
                  inputId="places-autocomplete-event"
                />
              </Box>
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
                  onChange={(e) =>
                    setLocationVisibility(e.target.value as typeof locationVisibility)
                  }
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
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <VisibilityRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Who can see this?
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Controls who can find this plan and who may get notified about it.
              </Typography>
            </Box>
          </Stack>

          <RadioGroup
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <FormControlLabel
              value="public"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    Public
                  </Typography>
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
                  <Typography variant="body1" fontWeight={500}>
                    Chums only
                  </Typography>
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
                  <Typography variant="body1" fontWeight={500}>
                    Invite only
                  </Typography>
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

      {/* Extra options */}
      <ExtraOptionsSection
        requireReconfirmation={requireReconfirmation}
        onChangeRequireReconfirmation={setRequireReconfirmation}
        minConfirmedAttendees={minConfirmedAttendees}
        onChangeMinConfirmedAttendees={setMinConfirmedAttendees}
        fallbackPolicy={fallbackPolicy}
        onChangeFallbackPolicy={setFallbackPolicy}
        requireApproval={requireApproval}
        onChangeRequireApproval={setRequireApproval}
        allowAttendeeInvites={allowAttendeeInvites}
        onChangeAllowAttendeeInvites={setAllowAttendeeInvites}
        muteHostAttendanceEmails={muteHostAttendanceEmails}
        onChangeMuteHostAttendanceEmails={setMuteHostAttendanceEmails}
      />

      {/* Community association. Hidden entirely when visibility=invite_only,
          since invite_only plans never appear in Explore or community feeds.
          See AGENTS.md -> Plan Feed and Community Visibility Contract. */}
      <CommunityLinkSection
        visibility={visibility}
        myCommunities={myCommunities as SharedMyCommunity[]}
        selectedCommunityIds={selectedCommunityIds}
        onChangeSelectedCommunityIds={setSelectedCommunityIds}
        hideFromExplore={hideFromExplore}
        onChangeHideFromExplore={setHideFromExplore}
      />

      {/* Matching preferences override */}
      <MatchingPreferencesSection
        open={prefOverridesOpen}
        onToggleOpen={() => setPrefOverridesOpen((v) => !v)}
        disableAll={prefDisableAll}
        onChangeDisableAll={setPrefDisableAll}
        disabledMetrics={prefDisabledMetrics}
        onChangeDisabledMetrics={setPrefDisabledMetrics}
      />

      {/* QA plan toggle (super admin only) */}
      <QAPlanSection show={isSuperAdmin} value={isQa} onChange={setIsQa} />

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
          onClick={() => {
            const firstSelectedId = selectedCommunityIds[0] ?? null;
            const selectedCommunity = firstSelectedId ? myCommunities.find((c) => c.id === firstSelectedId) : null;
            const target = selectedCommunity?.slug ? `/communities/${selectedCommunity.slug}` : "/plans";
            router.push(target, { scroll: true });
            // iOS Safari (and a few Android browsers) sometimes restore the
            // previous scroll position on SPA navigation even when the
            // router asks for a fresh scroll. Force the target page to
            // land at the top on the next frame so Cancel reliably
            // returns the viewer to the top of the community page.
            requestAnimationFrame(() => {
              window.scrollTo({ top: 0, left: 0 });
            });
          }}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 140 }, borderRadius: 2.5, textTransform: "none" }}
        >
          Cancel
        </AppButton>
        <AppButton
          onClick={handleSubmit}
          disabled={submitting}
          sx={{
            minWidth: { xs: "100%", sm: 200 },
            py: 1.5,
            borderRadius: 2.5,
            fontWeight: 700,
            textTransform: "none",
            fontSize: "0.9375rem",
            boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
            "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
            "&.Mui-disabled": { boxShadow: "none" },
          }}
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
          if (file.size > MAX_BANNER_INPUT_BYTES) {
            toast.error("Image must be 20MB or less.");
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
          sx: {
            m: { xs: 2, sm: 3 },
            maxHeight: { xs: "calc(100dvh - 32px)", sm: "calc(100dvh - 48px)" },
          },
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
