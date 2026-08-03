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
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import Cropper, { type Area } from "react-easy-crop";
import { useRouter, useSearchParams } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import PlacesAutocompleteInput, { formatPlaceDisplay } from "@/components/common/PlacesAutocompleteInput";
import { apiFetch, getApiBaseUrl, getAvatarBaseUrl, getImageFallbackBaseUrl } from "@/lib/apiClient";
import { trackEvent } from "@/lib/analytics";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import { notifyObjectivesChanged } from "@/components/objectives/NextStepNudge";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { BANNER_PRESETS, renderBannerPreset, suggestPreset } from "@/lib/eventBanners";
import { scrollToFirstError } from "@/lib/scrollToFirstError";
import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";
import CopyPlanDialog from "@/components/events/CopyPlanDialog";
import {
  CollapsibleSection,
  CommunityLinkSection,
  ExtraOptionsSection,
  QAPlanSection,
  describeAltTimes,
  describeBanner,
  describeDescription,
  describeHobbies,
  describeVisibility,
  type MyCommunity as SharedMyCommunity,
} from "@/components/events/planForm";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";

// Visual top-to-bottom order of validation-bearing fields. Drives the
// scroll-to-first-error helper so the user always lands on the earliest
// problem they need to fix rather than a later one.
const FIELD_ORDER = ["title", "date", "time", "location", "maxSeats", "minAttendeesRequired"] as const;

// Which collapsed section each validation-bearing field lives in, so a failed
// submit can force that section open before scrolling to the error. Tier-one
// fields are always visible and need no entry. `availability_deadline_at` is
// the server's field name for the deadline inside Alternate times.
const SECTION_OF_FIELD: Record<string, string> = {
  minAttendeesRequired: "extras",
  availability_deadline_at: "altTimes",
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BANNER_INPUT_BYTES = 20 * 1024 * 1024; // 20MB, raw file limit before compression
const MAX_BANNER_OUTPUT_BYTES = 400 * 1024; // 400KB, compressed output target

export default function CreateEventClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // Copy-a-plan mode: pre-fills the whole form from a plan the viewer
  // previously hosted, so week-to-week re-runs don't start from scratch.
  // Reached via `?copy_from=<planId>` (Copy plan on the plan detail page) or
  // the "Copy a previous plan" picker in this form's header. Nothing is
  // created until the user reviews and publishes.
  const copyFromId = searchParams.get("copy_from");
  const [copyLoading, setCopyLoading] = useState(!!copyFromId);
  const [copyApplied, setCopyApplied] = useState(false);
  /** Source plan id once hydration succeeded; sent as `copied_from` on create
   *  so the server can record the repeat-planning product event. Covers both
   *  entry points (?copy_from= and the Copy a previous plan picker). */
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  // Lets copy hydration started from the picker bail out if the user
  // navigates away mid-fetch.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  // Presented inverted ("Prevent attendees from inviting others", default
  // off); the wire field stays allow_attendee_invites. See ExtraOptionsSection.
  const [preventAttendeeInvites, setPreventAttendeeInvites] = useState(false);
  const [reserveSeats, setReserveSeats] = useState(false);
  // On by default (Aug 2026): the attendance check is what makes plans
  // happen, so new plans get it and the host can switch it off in Extra
  // options. Copy-a-plan hydration still applies the source plan's value.
  const [requireReconfirmation, setRequireReconfirmation] = useState(true);
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

  // Two-tier form: the optional sections start collapsed. Keyed by section so
  // validation can force one open (see revealAndScrollToErrors).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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
    // When copying a plan, linkage comes from the source plan instead.
    if (searchParams.get("copy_from")) return [];
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

  // Pre-fill the form from a plan the viewer hosted. Reached two ways: the
  // `?copy_from=` query param (Copy plan on the plan detail page) and the
  // "Copy a previous plan" picker on this form. Resets before applying so
  // copying over a half-filled form still produces a faithful copy. Things
  // tied to the original instance are never copied: attendees, the
  // availability deadline, and community linkage the viewer can no longer
  // use (POST /events validates membership on every linked id).
  const hydrateFromSourcePlan = async (
    sourceId: string,
    communityList: MyCommunity[],
    isCancelled: () => boolean
  ): Promise<boolean> => {
    const copyLoadFailed = () =>
      toast.error("We couldn't load that plan to copy, so you're starting fresh.");
    try {
      const res = await apiFetch(`/events/${sourceId}`, { auth: true });
      const data = await res.json();
      if (isCancelled()) return false;
      const ev = data.ok ? data.event : null;
      if (!ev?.isHost) {
        copyLoadFailed();
        return false;
      }

      // Clear anything a previous copy or manual editing left behind.
      setErrors({});
      setDeadlineDate(null);
      setDeadlineTime(null);
      setLocationPlaceId(null);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setBannerFile(null);
      setBannerPreview(null);
      setSelectedPresetSlug(null);
      // The copy keeps the source plan's banner (or none); don't let the
      // hobby-based preset auto-suggest override that.
      autoSuggestedRef.current = true;

      setTitle(ev.title ?? "");
      setDescription(ev.description ?? "");
      const hobbyList: HobbyOption[] =
        Array.isArray(ev.hobbies) && ev.hobbies.length > 0
          ? ev.hobbies.map((h: { name: string; slug: string }) => ({ name: h.name, slug: h.slug }))
          : ev.hobby
            ? [{ name: ev.hobby, slug: ev.hobbySlug ?? "" }]
            : [];
      setSelectedHobbies(hobbyList);
      setMaxSeats(ev.maxSeats != null ? String(ev.maxSeats) : "");
      setReserveSeats(ev.reserveSeats === true);
      setMinAttendeesRequired(
        ev.minAttendeesRequired != null ? String(ev.minAttendeesRequired) : ""
      );

      // Same time of day, next future occurrence of the source plan's
      // weekday, so a weekly re-run lands on the natural next slot.
      const src = dayjs(ev.startsAt);
      const now = dayjs();
      let target = now
        .startOf("day")
        .add((src.day() - now.day() + 7) % 7, "day")
        .hour(src.hour())
        .minute(src.minute())
        .second(0)
        .millisecond(0);
      if (!target.isAfter(now)) target = target.add(7, "day");
      setDateValue(target);
      setTimeValue(target);

      setLocationType(ev.locationType === "online" ? "online" : "in_person");
      setLocationName(ev.locationName ?? "");
      setLocationAddress(ev.locationAddress ?? "");
      setLocationLat(ev.locationLat ?? null);
      setLocationLng(ev.locationLng ?? null);
      setLocationArea(ev.locationArea ?? null);
      setLocationVisibility(ev.locationVisibility ?? "exact_everyone");
      setOnlineLink(ev.onlineLink ?? "");

      setVisibility(ev.visibility ?? "public");
      setSchedulingMode(
        !(ev.allowAltTimes ?? false)
          ? "off"
          : ev.altTimesMode === "availability"
            ? "availability"
            : "suggest"
      );
      setPreventAttendeeInvites(ev.allowAttendeeInvites === false);
      setRequireReconfirmation(ev.requireReconfirmation ?? false);
      setMuteHostAttendanceEmails(ev.muteHostAttendanceEmails === true);
      setRequireApproval(ev.requireApproval ?? false);
      setMinConfirmedAttendees(
        ev.minConfirmedAttendees != null ? String(ev.minConfirmedAttendees) : ""
      );
      setFallbackPolicy(ev.fallbackPolicy ?? "notify_host");

      // Community linkage carries over only where the viewer is still a
      // member; hide_from_explore without a surviving linkage would hide the
      // plan from everyone in Explore, so it only carries with one.
      const linked: Array<{ id: string }> = Array.isArray(ev.communities) ? ev.communities : [];
      const linkable =
        ev.visibility === "invite_only"
          ? []
          : linked
              .map((c) => String(c.id))
              .filter((id) => communityList.some((c) => c.id === id));
      setSelectedCommunityIds(linkable);
      setHideFromExplore(linkable.length > 0 && ev.hideFromExplore === true);

      // Only super admins can load a QA plan, so carrying the flag keeps the
      // copy isolated the same way its source was.
      setIsQa(ev.isQa === true);

      // Best-effort banner copy: fetch the source image and stage it through
      // the normal upload pipeline. Failure just means no banner.
      if (ev.bannerKey) {
        const bases = [getAvatarBaseUrl(), getImageFallbackBaseUrl()].filter(
          (b): b is string => !!b
        );
        for (const base of bases) {
          try {
            // cache: "no-store" dodges browser-cached copies of the banner
            // that were stored from <img> loads without CORS headers (the
            // endpoint serves Cache-Control: public, max-age=86400).
            const imgRes = await fetch(`${base}/events/${ev.id}/banner`, {
              credentials: "omit",
              cache: "no-store",
            });
            if (!imgRes.ok) continue;
            const blob = await imgRes.blob();
            if (isCancelled()) return false;
            const file = new File([blob], "banner.webp", { type: blob.type || "image/webp" });
            setBannerFile(file);
            setBannerPreview(URL.createObjectURL(file));
            break;
          } catch {
            /* try the next base */
          }
        }
      }

      setCopyApplied(true);
      setCopySourceId(sourceId);
      return true;
    } catch {
      if (!isCancelled()) copyLoadFailed();
      return false;
    }
  };

  // Selection handler for the "Copy a previous plan" picker. Swaps in the
  // same full-page spinner as the `?copy_from=` entry path so every
  // mount-initialized control (rich text editor, pickers) re-initializes
  // with the copied values.
  const handleCopyPlanSelected = async (planId: string) => {
    if (copyLoading) return;
    setCopyDialogOpen(false);
    setCopyLoading(true);
    const applied = await hydrateFromSourcePlan(planId, myCommunities, () => !mountedRef.current);
    if (!mountedRef.current) return;
    setCopyLoading(false);
    if (applied) toast.success("Plan details copied. Adjust anything, then publish.");
  };

  // Fetch profile (for QA toggle) and user's communities (for the community
  // selector), then hydrate from the source plan when copying.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list: MyCommunity[] = [];
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
            list = d.communities.map((c: Record<string, unknown>) => ({
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

            // If arriving from a community page, prefill location from that
            // community. Skipped when copying; the source plan's location wins.
            const preselectedId = copyFromId ? null : searchParams.get("community_id");
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

      if (copyFromId && !cancelled) {
        await hydrateFromSourcePlan(copyFromId, list, () => cancelled);
      }
      if (!cancelled) setCopyLoading(false);
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

  // Open any collapsed section that contains an errored field, then scroll.
  // Children stay mounted inside Collapse, so refs are always registered; the
  // short delay lets the expansion commit so the target reads its final
  // position (content above the target does not move during the height
  // animation, so this does not race the animation itself).
  const revealAndScrollToErrors = (errs: Record<string, string>) => {
    const toOpen = Object.keys(errs)
      .map((k) => SECTION_OF_FIELD[k])
      .filter((k): k is string => !!k);
    if (toOpen.length > 0) {
      setOpenSections((prev) => ({
        ...prev,
        ...Object.fromEntries(toOpen.map((k) => [k, true])),
      }));
      window.setTimeout(() => scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER), 120);
    } else {
      // scrollToFirstError -> scrollElementIntoView already double-rAFs
      // internally to wait for layout to settle, so no outer rAF wrapper
      // needed here. The previous attempt's single-rAF wrapper was racing
      // React's commit on slow mobile devices.
      scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER);
    }
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      revealAndScrollToErrors(errs);
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
      allow_attendee_invites: !preventAttendeeInvites,
      require_reconfirmation: requireReconfirmation,
      mute_host_attendance_emails: muteHostAttendanceEmails,
      require_approval: requireApproval,
      min_confirmed_attendees:
        requireReconfirmation && minConfirmedAttendees ? Number(minConfirmedAttendees) : null,
      fallback_policy: requireReconfirmation ? fallbackPolicy : "notify_host",
      min_attendees_required: minAttendeesRequired ? Number(minAttendeesRequired) : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      status: "published",
      copied_from: copySourceId,
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
        // Host-loop funnel event (client-side GA complement to the server's
        // first/second-plan product events). QA plans stay out of analytics.
        if (!isQa) trackEvent("plan_created");
        notifyObjectivesChanged();
        // ?published=1 opens the share moment on arrival. Publishing used to
        // end in a toast and a redirect, which left the most important next
        // step (share the link) as something the host had to go find.
        router.push(`/events/${data.event.id}?published=1`);
      } else {
        if (data.field) {
          const fieldErrs = { [data.field]: data.message ?? "Validation error" };
          setErrors(fieldErrs);
          revealAndScrollToErrors(fieldErrs);
        } else {
          toast.error(data.message ?? "Something went wrong");
        }
      }
    } catch {
      toast.error("Network error, please try again");
    }
    setSubmitting(false);
  };

  // Copy mode fetches the source plan before first paint of the form, so the
  // user never sees empty fields flash and then fill in. Mirrors the Edit
  // form's loading state.
  if (copyLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

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
            {copyApplied
              ? "We've pre-filled everything from your previous plan. Review the details, tweak what you need, then publish."
              : "Organize a gathering around something you enjoy. Keep it simple, you can always update later."}
          </Typography>
          {/* Quiet entry point for re-running a previous plan. Kept visible
              after a copy so the user can switch to a different source. */}
          <AppButton
            variant="text"
            size="small"
            startIcon={<EventRepeatRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setCopyDialogOpen(true)}
            sx={{
              alignSelf: "flex-start",
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              lineHeight: 1.4,
              color: "primary.dark",
              px: 0.75,
              py: 0.25,
              ml: -0.75,
              minHeight: 0,
              minWidth: 0,
              "& .MuiButton-startIcon": { mr: 0.5 },
              "&:hover": { bgcolor: "rgba(230, 91, 19, 0.06)" },
            }}
          >
            {copyApplied ? "Copy a different plan" : "Copy a previous plan"}
          </AppButton>
        </Stack>
      </Paper>

      {/* Tier one: the minimum viable plan, always visible. Title, when,
          where, seats. Everything optional lives in the collapsed sections
          below, so a first-time host reaches Publish without scrolling past
          controls they don't need yet. */}
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
                Title, when, where, and seats. That&apos;s all a plan needs.
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
            <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.25 }}>
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
              <Box ref={setFieldRef("location")} sx={{ scrollMarginTop: 96, mt: 1 }}>
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
            ) : (
              <Box sx={{ mt: 1 }}>
                <AppTextField
                  label="Online link or details"
                  placeholder="e.g. Zoom link, Discord server"
                  value={onlineLink}
                  onChange={(e) => setOnlineLink(e.target.value)}
                  helperText="Share a link or instructions for joining online"
                />
              </Box>
            )}
          </Box>

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
              helperText={errors.maxSeats ?? "Optional. Include yourself in the count"}
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
          {maxSeats && Number(maxSeats) >= 1 && (
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
          )}
        </Stack>
      </AppCard>

      {/* Tier two: optional sections, collapsed with a live summary of their
          current value in the header. Every one has a safe default, so
          skipping all of them still publishes a complete plan. */}
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", mt: { xs: -1.5, sm: -2 }, ml: 0.5 }}
      >
        Everything below is optional. Tap a section to open it.
      </Typography>

      <CollapsibleSection
        sectionKey="description"
        icon={<NotesRoundedIcon sx={{ fontSize: 22 }} />}
        title="Description"
        subtitle="What should people expect? Any details they should know?"
        summary={describeDescription(description)}
        expanded={!!openSections.description}
        onToggle={() => toggleSection("description")}
      >
        <RichTextEditor
          placeholder="What should people expect? Any details they should know?"
          value={description}
          onChange={setDescription}
        />
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="banner"
        icon={<ImageRoundedIcon sx={{ fontSize: 22 }} />}
        title="Banner image"
        subtitle="Pick a colour theme or upload your own photo."
        summary={describeBanner(selectedPresetSlug, !!bannerPreview)}
        expanded={!!openSections.banner}
        onToggle={() => toggleSection("banner")}
      >
        <Stack spacing={2}>
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
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="hobbies"
        icon={<StyleRoundedIcon sx={{ fontSize: 22 }} />}
        title="Hobbies"
        subtitle="Optional, helps people who share them find this plan."
        summary={describeHobbies(selectedHobbies)}
        expanded={!!openSections.hobbies}
        onToggle={() => toggleSection("hobbies")}
      >
        <Box ref={setFieldRef("hobby")} sx={{ scrollMarginTop: 96 }}>
          <HobbyPickerField
            value={selectedHobbies}
            onChange={setSelectedHobbies}
            error={errors.hobby}
            helperText="People nearby who share these hobbies may get notified about this plan, depending on who can see it."
            onReject={(msg) => toast.error(msg)}
          />
        </Box>
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="altTimes"
        icon={<EventRepeatRoundedIcon sx={{ fontSize: 22 }} />}
        title="Alternate times"
        subtitle="How flexible do you want to be about the time?"
        summary={describeAltTimes(schedulingMode)}
        expanded={!!openSections.altTimes}
        onToggle={() => toggleSection("altTimes")}
      >
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
      </CollapsibleSection>

      <CollapsibleSection
        sectionKey="visibility"
        icon={<VisibilityRoundedIcon sx={{ fontSize: 22 }} />}
        title="Who can see this?"
        subtitle="Controls who can find this plan and who may get notified about it."
        summary={describeVisibility(visibility, locationType, locationVisibility)}
        expanded={!!openSections.visibility}
        onToggle={() => toggleSection("visibility")}
      >
        <Stack spacing={2}>
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

          {/* Exact-location privacy. Lives here rather than under Where?
              because it is an audience control with a safe default, and the
              tier-one card stays down to what a minimum plan needs. */}
          {locationType === "in_person" && (
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
          )}
        </Stack>
      </CollapsibleSection>

      {/* Extra options */}
      <ExtraOptionsSection
        expanded={!!openSections.extras}
        onToggle={() => toggleSection("extras")}
        requireReconfirmation={requireReconfirmation}
        onChangeRequireReconfirmation={setRequireReconfirmation}
        minConfirmedAttendees={minConfirmedAttendees}
        onChangeMinConfirmedAttendees={setMinConfirmedAttendees}
        fallbackPolicy={fallbackPolicy}
        onChangeFallbackPolicy={setFallbackPolicy}
        requireApproval={requireApproval}
        onChangeRequireApproval={setRequireApproval}
        preventAttendeeInvites={preventAttendeeInvites}
        onChangePreventAttendeeInvites={setPreventAttendeeInvites}
        muteHostAttendanceEmails={muteHostAttendanceEmails}
        onChangeMuteHostAttendanceEmails={setMuteHostAttendanceEmails}
        minAttendeesRequired={minAttendeesRequired}
        onChangeMinAttendeesRequired={setMinAttendeesRequired}
        minAttendeesError={errors.minAttendeesRequired}
        registerMinAttendeesField={setFieldRef("minAttendeesRequired")}
      />

      {/* Community association. Hidden entirely when visibility=invite_only,
          since invite_only plans never appear in Explore or community feeds.
          See AGENTS.md -> Plan Feed and Community Visibility Contract. */}
      <CommunityLinkSection
        expanded={!!openSections.community}
        onToggle={() => toggleSection("community")}
        visibility={visibility}
        myCommunities={myCommunities as SharedMyCommunity[]}
        selectedCommunityIds={selectedCommunityIds}
        onChangeSelectedCommunityIds={setSelectedCommunityIds}
        hideFromExplore={hideFromExplore}
        onChangeHideFromExplore={setHideFromExplore}
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

      {/* Copy-a-previous-plan picker */}
      <CopyPlanDialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        onSelect={(planId) => void handleCopyPlanSelected(planId)}
      />

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
