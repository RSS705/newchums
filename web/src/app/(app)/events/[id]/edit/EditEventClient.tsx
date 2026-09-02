"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
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
import MuiLink from "@mui/material/Link";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import Cropper, { type Area } from "react-easy-crop";
import { useParams, useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { apiFetch, getApiBaseUrl, getAvatarBaseUrl, getImageFallbackBaseUrl } from "@/lib/apiClient";
import { getCroppedImg, type PixelCrop } from "@/lib/cropImage";
import ListItemText from "@mui/material/ListItemText";
import HobbyPickerField, { type HobbyOption } from "@/components/common/HobbyPickerField";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";
import PlacesAutocompleteInput, { formatPlaceDisplay } from "@/components/common/PlacesAutocompleteInput";
import { loadGooglePlacesScript } from "@/lib/loadGooglePlaces";
import { renderBannerPreset } from "@/lib/eventBanners";
import { scrollToFirstError } from "@/lib/scrollToFirstError";
import {
  BannerField,
  CollapsibleSection,
  CommunityLinkSection,
  ExtraOptionsSection,
  QAPlanSection,
  describeAltTimes,
  describeHobbies,
  describeVisibility,
  type MyCommunity as SharedMyCommunity,
} from "@/components/events/planForm";

// Visual top-to-bottom order of validation-bearing fields. Drives the
// scroll-to-first-error helper so the user always lands on the earliest
// problem they need to fix rather than a later one.
const FIELD_ORDER = ["title", "date", "time", "location", "maxSeats"] as const;

// Which collapsed section each validation-bearing field lives in, so a failed
// submit can force that section open before scrolling to the error. Mirrors
// the Add Plan form; see AGENTS.md -> Add Plan / Edit Plan Parity Rule.
const SECTION_OF_FIELD: Record<string, string> = {
  availability_deadline_at: "altTimes",
};


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
  // Presented inverted ("Prevent attendees from inviting others", default
  // off); the wire field stays allow_attendee_invites. See ExtraOptionsSection.
  const [preventAttendeeInvites, setPreventAttendeeInvites] = useState(false);
  const [reserveSeats, setReserveSeats] = useState(false);
  const [requireReconfirmation, setRequireReconfirmation] = useState(false);
  const [muteHostAttendanceEmails, setMuteHostAttendanceEmails] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minConfirmed, setMinConfirmed] = useState("");
  const [fallbackPolicy, setFallbackPolicy] = useState<"notify_host" | "proceed" | "auto_cancel">("proceed");
  // Legacy RSVP-count auto-cancel threshold. No longer offered in either form
  // (2026-09-02), but plans that set it before then keep it: the loaded value
  // is passed straight back on save, so an unrelated edit never clears it or
  // surfaces as a change in the attendee update email.
  const [legacyMinAttendeesRequired, setLegacyMinAttendeesRequired] = useState<number | null>(null);

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

  // Community association. Mirrors the Add Plan form: `myCommunities` is
  // the selector's option list, `selectedCommunityIds` is the current set of
  // linked communities. `initialCommunityIds` is the list linked when the
  // event loaded; PATCH only ships `community_ids` when the selection
  // actually changed, so an unchanged save never triggers the server-side
  // "must be a member" validation for a host who has since left one of the
  // already-linked communities.
  const [myCommunities, setMyCommunities] = useState<SharedMyCommunity[]>([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>([]);
  const [initialCommunityIds, setInitialCommunityIds] = useState<string[]>([]);
  const [hideFromExplore, setHideFromExplore] = useState(false);
  const [initialHideFromExplore, setInitialHideFromExplore] = useState(false);

  // Notification control for this edit
  const [notifyAttendees, setNotifyAttendees] = useState(true);

  // Date-change reconfirmation (edit-only; see AGENTS.md -> Add Plan /
  // Edit Plan Parity Rule, deliberately-divergent sections). Follows the
  // initialCommunityIds pattern: the original start time and the count of
  // non-host going/maybe attendees are captured once at hydration, and the
  // toggle only renders when the date/time actually differs and there is
  // somebody to ask.
  const [initialStartsAt, setInitialStartsAt] = useState<string | null>(null);
  const [reconfirmableAttendeeCount, setReconfirmableAttendeeCount] = useState(0);
  const [reconfirmRsvps, setReconfirmRsvps] = useState(false);

  // QA plan (super admin only)
  const [isQa, setIsQa] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Banner image
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [existingBannerKey, setExistingBannerKey] = useState<string | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);
  // Preset the current preview came from. Always null on load: a stored
  // banner is just an image by the time it reaches this form, whichever way
  // it was made, so the swatches light up only for picks made here.
  const [selectedPresetSlug, setSelectedPresetSlug] = useState<string | null>(null);
  const [presetRendering, setPresetRendering] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerCropZoom, setBannerCropZoom] = useState(1);
  const [bannerCropPosition, setBannerCropPosition] = useState({ x: 0, y: 0 });
  const [bannerCroppedArea, setBannerCroppedArea] = useState<Area | null>(null);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Same mechanism as the Add form: render the gradient to a webp and treat
  // it as an ordinary uploaded banner from there.
  const handlePresetSelect = useCallback(
    async (slug: string) => {
      if (presetRendering) return;
      setPresetRendering(true);
      try {
        const blob = await renderBannerPreset(slug);
        if (bannerPreview && !bannerPreview.startsWith("http")) URL.revokeObjectURL(bannerPreview);
        const file = new File([blob], `banner-${slug}.webp`, { type: "image/webp" });
        setBannerFile(file);
      setSelectedPresetSlug(null);
        setBannerPreview(URL.createObjectURL(file));
        setSelectedPresetSlug(slug);
        setBannerRemoved(false);
      } catch {
        toast.error("Failed to generate banner");
      } finally {
        setPresetRendering(false);
      }
    },
    [presetRendering, bannerPreview, toast]
  );

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
    [],
  );

  // Two-tier form: the optional sections start collapsed, with their current
  // values in the header summaries. Same structure as the Add Plan form.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Warm-load the Google Places script as soon as the form mounts so the
  // autocomplete on the location field is ready by the time the user reaches
  // it. PlacesAutocompleteInput also lazy-loads when its input mounts, but
  // doing it here mirrors CreateEventClient and shaves visible latency.
  useEffect(() => {
    loadGooglePlacesScript().catch((err) => {
      // Surface as a warning so devs see misconfigured environments. A silent
      // catch is intentionally avoided here because that pattern is what hid
      // this issue in the first place.
      console.warn("[EditEventClient] Google Places script failed to load:", err);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/events/${eventId}`, { auth: true });
        const data = await res.json();
        if (cancelled) return;
        // Hosts edit their own plans; super admins (identified by the
        // server-gated adminView payload) may edit any plan.
        if (!data.ok || !data.event || !(data.event.isHost || data.adminView)) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const ev = data.event;
        // Non-host super admins get redacted location fields in the main
        // payload; adminView.exactLocation carries the real values.
        const adminExact = (data.adminView as {
          exactLocation?: { name?: string | null; address?: string | null; lat?: number | null; lng?: number | null };
        } | null | undefined)?.exactLocation;
        setTitle(ev.title ?? "");
        setDescription(ev.description ?? "");
        const d = dayjs(ev.startsAt);
        setDateValue(d);
        setTimeValue(d);
        setInitialStartsAt(ev.startsAt ?? null);
        // Attendees who would be asked to reconfirm on a date/time change.
        // The host-branch GET /events/:id response already carries the full
        // rsvps array; the host's own auto-going row is excluded.
        const rsvpRows: Array<{ userId?: string; status?: string }> = Array.isArray(data.rsvps) ? data.rsvps : [];
        setReconfirmableAttendeeCount(
          rsvpRows.filter((r) => (r.status === "going" || r.status === "maybe") && r.userId !== ev.hostUserId).length,
        );
        setMaxSeats(ev.maxSeats != null ? String(ev.maxSeats) : "");
        setVisibility(ev.visibility ?? "public");
        setRequireReconfirmation(ev.requireReconfirmation ?? false);
        setMuteHostAttendanceEmails(ev.muteHostAttendanceEmails === true);
        setRequireApproval(ev.requireApproval ?? false);
        setPreventAttendeeInvites(ev.allowAttendeeInvites === false);
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
        setFallbackPolicy(ev.fallbackPolicy ?? "proceed");
        setLegacyMinAttendeesRequired(ev.minAttendeesRequired != null ? Number(ev.minAttendeesRequired) : null);

        // Location
        setLocationType(ev.locationType === "online" ? "online" : "in_person");
        setLocationName(ev.locationName ?? adminExact?.name ?? "");
        setLocationAddress(ev.locationAddress ?? adminExact?.address ?? "");
        setLocationLat(ev.locationLat ?? adminExact?.lat ?? null);
        setLocationLng(ev.locationLng ?? adminExact?.lng ?? null);
        setLocationArea(ev.locationArea ?? null);
        setLocationVisibility(ev.locationVisibility ?? "exact_everyone");
        setOnlineLink(ev.onlineLink ?? "");

        const h = ev.hobbies?.length > 0
          ? ev.hobbies
          : ev.hobby ? [{ name: ev.hobby, slug: ev.hobbySlug ?? "" }] : [];
        setHobbies(h);

        // Community associations. Plans can be linked to zero or more
        // communities.
        const linkedCommunities: Array<{ id: string; name: string; slug?: string }> =
          Array.isArray(ev.communities) ? ev.communities : [];
        if (linkedCommunities.length > 0) {
          const linkedIds = linkedCommunities.map((c) => c.id);
          setSelectedCommunityIds(linkedIds);
          setInitialCommunityIds(linkedIds);
          // Seed the selector with the currently-linked communities so the
          // user always sees them, even if they're no longer an active
          // member (in which case the /communities?mine=1 fetch below would
          // omit them). `myCommunities` is then replaced (not merged) once
          // that fetch resolves; we re-seed any still-missing linked
          // communities there.
          setMyCommunities(linkedCommunities.map((c) => ({ id: c.id, name: c.name })));
        }
        const initialHide = ev.hideFromExplore === true;
        setHideFromExplore(initialHide);
        setInitialHideFromExplore(initialHide);
        if (ev.isQa) setIsQa(true);

        if (ev.bannerKey) {
          setExistingBannerKey(ev.bannerKey);
          const ts = Date.now();
          setBannerPreview(`${getAvatarBaseUrl()}/events/${ev.id}/banner?v=${ts}`);
        }

      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId]);

  // Fetch role for QA toggle visibility
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        const data = await res.json();
        if (!cancelled && data.ok && data.profile?.role === "super_admin") {
          setIsSuperAdmin(true);
        }
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // When visibility switches to invite_only, clear any community linkage so
  // the form state matches what the server will store (PATCH /events/:id
  // forces an empty community list for invite_only) and the Community
  // section disappears rather than misleading the user. Mirror of the same
  // effect in the Add Plan form. See AGENTS.md -> Plan Feed and Community
  // Visibility Contract.
  useEffect(() => {
    if (visibility === "invite_only") {
      setSelectedCommunityIds([]);
      setHideFromExplore(false);
    }
  }, [visibility]);

  // Fetch the viewer's communities to populate the Community section's
  // dropdown. Runs once on mount so the user can re-parent (or detach) the
  // plan during edit. If the plan is linked to a community the user no
  // longer belongs to, we keep the seeded single-entry list from the event
  // load and skip the merge so the UI still renders the current linkage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/communities?mine=1&limit=50", { auth: true });
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled || !d.ok || !Array.isArray(d.communities)) return;
        const list: SharedMyCommunity[] = d.communities.map((c: Record<string, unknown>) => ({
          id: String(c.id),
          slug: String(c.slug ?? ""),
          name: String(c.name ?? ""),
          is_online: c.is_online === true,
          location_name: (c.location_name as string) ?? null,
          location_address: (c.location_address as string) ?? null,
          location_lat: c.location_lat != null ? Number(c.location_lat) : null,
          location_lng: c.location_lng != null ? Number(c.location_lng) : null,
        }));
        setMyCommunities((prev) => {
          // If the plan is linked to communities that aren't in the fresh
          // list (host has left them, for example), preserve those seeded
          // entries so the user can still see the linkage and detach.
          const linkedIds = new Set(initialCommunityIds);
          const carry = prev.filter((c) => linkedIds.has(c.id) && !list.some((nc) => nc.id === c.id));
          return carry.length > 0 ? [...list, ...carry] : list;
        });
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [initialCommunityIds]);

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

  // True when the pickers differ from the plan's stored start time.
  // Seconds and milliseconds are zeroed on both sides because submit
  // builds starts_at with .second(0), so anything below minute precision
  // would false-positive.
  const dateTimeChanged = useMemo(() => {
    if (!initialStartsAt || !dateValue?.isValid() || !timeValue?.isValid()) return false;
    const combined = dateValue.hour(timeValue.hour()).minute(timeValue.minute()).second(0).millisecond(0);
    return !combined.isSame(dayjs(initialStartsAt).second(0).millisecond(0));
  }, [initialStartsAt, dateValue, timeValue]);
  const offerReconfirm = dateTimeChanged && reconfirmableAttendeeCount > 0;

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Give your plan a title";
    if (maxSeats && (isNaN(Number(maxSeats)) || Number(maxSeats) < 1))
      errs.maxSeats = "Must be a positive number";
    if (!dateValue?.isValid()) errs.date = "Pick a date";
    if (!timeValue?.isValid()) errs.time = "Pick a time";
    if (locationType === "in_person") {
      if (!locationName.trim() && !locationAddress.trim()) {
        errs.location = "Add a venue or address";
      } else if (locationLat == null || locationLng == null) {
        errs.location = "Please pick a location from the suggestions";
      }
    }
    setErrors(errs);
    return errs;
  };

  // Open any collapsed section that contains an errored field, then scroll.
  // Mirrors the Add Plan form; children stay mounted inside Collapse so refs
  // are always registered.
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
      // needed here.
      scrollToFirstError(fieldRefs.current, errs, FIELD_ORDER);
    }
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      revealAndScrollToErrors(errs);
      return;
    }
    const startsAt = dateValue!.hour(timeValue!.hour()).minute(timeValue!.minute()).second(0).toISOString();
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
          mute_host_attendance_emails: muteHostAttendanceEmails,
          require_approval: requireApproval,
          allow_attendee_invites: !preventAttendeeInvites,
          allow_alt_times: schedulingMode !== "off",
          alt_times_mode: schedulingMode === "availability" ? "availability" : "suggest",
          availability_deadline_at: schedulingMode === "availability" && deadlineDate?.isValid() && deadlineTime?.isValid()
            ? deadlineDate.hour(deadlineTime.hour()).minute(deadlineTime.minute()).second(0).toISOString()
            : null,
          min_confirmed_attendees: requireReconfirmation && minConfirmed ? Number(minConfirmed) : null,
          fallback_policy: requireReconfirmation ? fallbackPolicy : "proceed",
          // Legacy passthrough; dropped only if it would now exceed the seat
          // count, which the API rejects.
          min_attendees_required:
            legacyMinAttendeesRequired != null && (!maxSeats || legacyMinAttendeesRequired <= Number(maxSeats))
              ? legacyMinAttendeesRequired
              : null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          // Only send community linkage fields when they actually changed.
          // That way an unrelated edit (title, date, etc.) by a host who has
          // since left the linked community doesn't re-trigger the server's
          // "you must be a member" validation on the unchanged id. Clearing
          // or switching the linkage still sends the new value and is
          // validated as normal.
          ...((() => {
            // Only ship community_ids when the set of linked communities
            // actually changed. Order-insensitive comparison so reordering
            // alone (which has no semantic effect) doesn't trip the server-
            // side membership check on already-linked entries.
            const before = [...initialCommunityIds].sort().join(",");
            const after = [...selectedCommunityIds].sort().join(",");
            return before !== after ? { community_ids: selectedCommunityIds } : {};
          })()),
          ...(hideFromExplore !== initialHideFromExplore
            ? { hide_from_explore: hideFromExplore }
            : {}),
          ...(isSuperAdmin ? { is_qa: isQa } : {}),
          location_type: locationType,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
          location_place_id: locationPlaceId,
          location_lat: locationLat,
          location_lng: locationLng,
          location_area: locationType === "in_person" ? (locationArea?.trim() || null) : null,
          location_visibility: locationType === "in_person" ? locationVisibility : "exact_everyone",
          online_link: locationType === "online" ? onlineLink.trim() || null : null,
          notify_attendees: notifyAttendees,
          // Only meaningful when the date/time changed; the server
          // re-verifies that before resetting anything.
          ...(offerReconfirm && reconfirmRsvps ? { reconfirm_rsvps: true } : {}),
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string; reconfirm_requested?: number };
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
        toast.success(
          data.reconfirm_requested && data.reconfirm_requested > 0
            ? "Plan updated. Attendees have been asked to reconfirm."
            : "Plan updated",
        );
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
      <Stack
        spacing={3}
        sx={{
          py: { xs: 6, sm: 10 },
          px: 2,
          textAlign: "center",
          maxWidth: 460,
          mx: "auto",
        }}
      >
        <Stack spacing={1.25}>
          <Typography variant="h5" fontWeight={700}>
            We couldn&apos;t find that plan
          </Typography>
          <Typography variant="body1" color="text.secondary">
            It may have been removed, the link might be incorrect, or you may not
            have access to it.
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1.5} justifyContent="center">
          <AppButton onClick={() => router.push("/")}>Back to home</AppButton>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Still stuck? Email{" "}
          <MuiLink
            href="mailto:contact@newchums.com"
            sx={{ color: "primary.main", fontWeight: 500 }}
          >
            contact@newchums.com
          </MuiLink>{" "}
          and we&apos;ll take a look.
        </Typography>
      </Stack>
    );
  }

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header. Warm-wash hero matching the rest of the polished
          surfaces, including the Create plan form so the Create and
          Edit flows feel like the same product. */}
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
              <EditRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
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
              Manage plan
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
            Edit plan
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
            Update the details for this plan.
          </Typography>
        </Stack>
      </Paper>

      {/* Tier one: always visible. Title, when, where, seats, mirroring the
          Add Plan form's two-tier structure. Everything optional lives in the
          collapsed sections below with its current value in the header. */}
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
                Plan details
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Title, when, where, and seats.
              </Typography>
            </Box>
          </Stack>

          <Box ref={setFieldRef("title")} sx={{ scrollMarginTop: 96 }}>
            <AppTextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              inputProps={{ maxLength: 200 }}
              error={!!errors.title}
              helperText={errors.title || null}
            />
          </Box>
          {/* Description and banner live with the essentials; see the Add
              form for the rationale. The swatches are new here: Edit was
              upload-only for a while, an accidental regression from Add. */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>
              Description
            </Typography>
            <RichTextEditor
              placeholder="What should people expect? Any details they should know?"
              value={description}
              onChange={setDescription}
            />
          </Box>
          <BannerField
            bannerPreview={bannerPreview}
            selectedPresetSlug={selectedPresetSlug}
            presetRendering={presetRendering}
            onPresetSelect={(slug) => void handlePresetSelect(slug)}
            onUploadClick={() => bannerInputRef.current?.click()}
            onRemove={() => {
              setBannerFile(null);
              if (bannerPreview && !bannerPreview.startsWith("http")) URL.revokeObjectURL(bannerPreview);
              setBannerPreview(null);
              setSelectedPresetSlug(null);
              setBannerRemoved(true);
            }}
            onPreviewError={() => {
              if (bannerPreview && bannerPreview.startsWith(getAvatarBaseUrl())) {
                const fb = getImageFallbackBaseUrl();
                if (fb) {
                  setBannerPreview(bannerPreview.replace(getAvatarBaseUrl(), fb));
                  return;
                }
              }
              setBannerPreview(null);
            }}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Box ref={setFieldRef("date")} sx={{ flex: 1, scrollMarginTop: 96 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                Date
              </Typography>
              <DatePicker
                value={dateValue}
                onChange={setDateValue}
                slotProps={{ textField: { fullWidth: true, size: "medium", error: !!errors.date, helperText: errors.date, onKeyDown: pickerFieldTabKeyDown } }}
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
                slotProps={{ field: { shouldRespectLeadingZeros: true } as Record<string, unknown>, textField: { fullWidth: true, size: "medium", error: !!errors.time, helperText: errors.time, onKeyDown: pickerFieldTabKeyDown } }}
              />
            </Box>
          </Stack>
          {/* Edit-only, shown once the pickers diverge from the saved start
              time on a plan with going/maybe attendees. Deliberate parity
              divergence from the Add form; see AGENTS.md -> Add Plan / Edit
              Plan Parity Rule. */}
          {offerReconfirm && (
            <Box sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider", bgcolor: "action.hover", px: 2, py: 1.5 }}>
              <FormControlLabel
                control={<Switch checked={reconfirmRsvps} onChange={(e) => setReconfirmRsvps(e.target.checked)} />}
                label={<Typography variant="body2" fontWeight={600}>Ask attendees to reconfirm for the new time</Typography>}
                sx={{ mr: 0, gap: 0.5 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25, lineHeight: 1.45 }}>
                Everyone marked Going moves to Maybe, and attendees get an email showing the new time with one-tap RSVP links.
              </Typography>
            </Box>
          )}

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
                  inputId="places-autocomplete-edit-event"
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
              // Disable scroll-wheel value changes, see the Add Plan seat field for context.
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
          current value in the header. */}
      <Box sx={{ ml: 0.5 }}>
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" }, lineHeight: 1.3 }}
        >
          Optional settings to enhance your plan
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          Everything has a safe default. Tap a section to adjust it.
        </Typography>
      </Box>

      <CollapsibleSection
        sectionKey="hobbies"
        icon={<StyleRoundedIcon sx={{ fontSize: 22 }} />}
        title="Hobbies"
        subtitle="Optional, helps people who share these hobbies find this plan."
        summary={describeHobbies(hobbies)}
        expanded={!!openSections.hobbies}
        onToggle={() => toggleSection("hobbies")}
      >
        <Box ref={setFieldRef("hobby")} sx={{ scrollMarginTop: 96 }}>
          <HobbyPickerField
            value={hobbies}
            onChange={setHobbies}
            error={errors.hobby}
            helperText="People nearby who share these hobbies may get notified about this plan, depending on this plan's visibility setting below."
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
            if (mode !== "availability") { setDeadlineDate(null); setDeadlineTime(null); }
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
                  slotProps={{ textField: { size: "small", placeholder: "Date", sx: { flex: 1 }, onKeyDown: pickerFieldTabKeyDown } }}
                />
                <TimePicker
                  value={deadlineTime}
                  onChange={setDeadlineTime}
                  format="h:mm A"
                  slotProps={{
                    field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                    textField: { size: "small", placeholder: "Time", sx: { flex: 1 }, onKeyDown: pickerFieldTabKeyDown },
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
                    secondary="Shown to anyone signed in and anyone who opens your shared link. Signed-out visitors without the link see only the general area"
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
        minConfirmedAttendees={minConfirmed}
        onChangeMinConfirmedAttendees={setMinConfirmed}
        fallbackPolicy={fallbackPolicy}
        onChangeFallbackPolicy={setFallbackPolicy}
        requireApproval={requireApproval}
        onChangeRequireApproval={setRequireApproval}
        preventAttendeeInvites={preventAttendeeInvites}
        onChangePreventAttendeeInvites={setPreventAttendeeInvites}
        muteHostAttendanceEmails={muteHostAttendanceEmails}
        onChangeMuteHostAttendanceEmails={setMuteHostAttendanceEmails}
        notifyAttendees={{ value: notifyAttendees, onChange: setNotifyAttendees }}
      />

      {/* Community association. Hidden entirely when visibility=invite_only,
          since invite_only plans never appear in Explore or community feeds.
          See AGENTS.md -> Plan Feed and Community Visibility Contract. */}
      <CommunityLinkSection
        expanded={!!openSections.community}
        onToggle={() => toggleSection("community")}
        visibility={visibility}
        myCommunities={myCommunities}
        selectedCommunityIds={selectedCommunityIds}
        onChangeSelectedCommunityIds={setSelectedCommunityIds}
        hideFromExplore={hideFromExplore}
        onChangeHideFromExplore={setHideFromExplore}
      />

      {/* QA plan toggle (super admin only) */}
      <QAPlanSection show={isSuperAdmin} value={isQa} onChange={setIsQa} />

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
