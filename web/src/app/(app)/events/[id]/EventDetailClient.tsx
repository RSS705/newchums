"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { useParams, useRouter } from "next/navigation";
import UserAvatar from "@/components/common/UserAvatar";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl, getMediaApiBaseUrl } from "@/lib/apiClient";

type HobbyInfo = { name: string; slug: string };

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  locationType: string;
  locationDisplay?: string;
  locationVisibility?: string;
  locationExact?: boolean;
  locationArea?: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationLat: number | null;
  locationLng: number | null;
  onlineLink: string | null;
  maxSeats: number | null;
  visibility: string;
  status: string;
  allowAltTimes: boolean;
  canceledAt: string | null;
  bannerKey: string | null;
  hobby: string | null;
  hobbySlug: string | null;
  hobbies: HobbyInfo[];
  hostName: string;
  hostUserId: string;
  isHost: boolean;
};

type RsvpEntry = { userId: string; name: string; status: string; note: string | null; avatarUrl?: string | null };
type AltTimeEntry = { userId: string; name: string; suggestedAt: string; note: string | null };
type InviteEntry = { userId: string | null; email: string | null; name: string };
type SearchResult = { userId: string; displayName: string; handle: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function visibilityLabel(v: string): string {
  if (v === "invite_only") return "Invite only";
  if (v === "chums_only") return "Chums only";
  return "Public";
}

export default function EventDetailClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);
  const [altTimes, setAltTimes] = useState<AltTimeEntry[]>([]);
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [showAltTimeForm, setShowAltTimeForm] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altTime, setAltTime] = useState("");
  const [altNote, setAltNote] = useState("");

  // Invite people state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}`, { auth: true });
      if (!res.ok) {
        setError("Plan not found");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        event: EventDetail;
        rsvps: RsvpEntry[];
        altTimes: AltTimeEntry[];
        invites: InviteEntry[];
      };
      setEvent(data.event);
      setRsvps(data.rsvps);
      setAltTimes(data.altTimes);
      setInvites(data.invites ?? []);
    } catch {
      setError("Failed to load plan");
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  // Invite search
  useEffect(() => {
    if (!showInviteForm) return;
    const q = inviteSearch.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`/chums/search?q=${encodeURIComponent(q)}`, { auth: true });
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; results?: SearchResult[] };
          setSearchResults(data.results ?? []);
        }
      } catch { /* ignore */ }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteSearch, showInviteForm]);

  const handleInvite = async (userId?: string, email?: string) => {
    setInviteSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/invite`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitees: [{ user_id: userId ?? null, email: email ?? null }] }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Invite sent!");
        setInviteSearch("");
        setSearchResults([]);
        load();
      } else {
        toast.error(data.message ?? "Failed to send invite");
      }
    } catch {
      toast.error("Network error");
    }
    setInviteSubmitting(false);
  };

  const handleRsvp = async (status: string) => {
    setRsvpSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success(status === "going" ? "You're going!" : status === "maybe" ? "Marked as maybe" : "Response recorded");
        load();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
  };

  const handleAltTimeSubmit = async () => {
    if (!altDate || !altTime) {
      toast.error("Please pick a date and time");
      return;
    }
    try {
      const res = await apiFetch(`/events/${eventId}/alt-time`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggested_at: new Date(`${altDate}T${altTime}`).toISOString(),
          note: altNote.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Alternate time suggested!");
        setShowAltTimeForm(false);
        setAltDate("");
        setAltTime("");
        setAltNote("");
        load();
      } else {
        toast.error(data.message ?? "Error");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this plan?")) return;
    try {
      const res = await apiFetch(`/events/${eventId}/cancel`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        toast.success("Plan canceled");
        load();
      }
    } catch {
      toast.error("Network error");
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !event) {
    return (
      <Stack spacing={2} sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h5" fontWeight={600}>{error ?? "Not found"}</Typography>
        <Button onClick={() => router.push("/plans")} startIcon={<ArrowBackRoundedIcon />}>
          Back to Your Plans
        </Button>
      </Stack>
    );
  }

  const goingCount = rsvps.filter((r) => r.status === "going").length;
  const maybeCount = rsvps.filter((r) => r.status === "maybe").length;
  const isCanceled = event.status === "canceled";

  // When locationExact is explicitly false the API hid the exact venue.
  // Fall back: if the field isn't present (older API response) treat it as exact
  // when we have coords or an address.
  const isLocationApprox =
    event.locationType === "in_person" &&
    (event.locationExact === false ||
      (event.locationExact === undefined &&
        event.locationLat == null &&
        event.locationAddress == null &&
        event.locationName == null));

  const locationDisplay =
    event.locationDisplay ??
    (event.locationType === "online" ? event.onlineLink || "Online" : "TBD");

  // Helper text shown below the location row when the exact venue is hidden.
  const locationHint = isLocationApprox
    ? event.locationVisibility === "exact_joined_only"
      ? "Approximate area shown \u2014 exact address revealed after joining"
      : "Approximate area shown \u2014 exact address isn\u2019t shared for this plan"
    : null;

  // For the map: use exact coords at street zoom when available; otherwise use
  // the approximate area text at a neighbourhood zoom so we don't reveal the
  // exact venue through a pin or coords.
  const approxQuery = event.locationArea ?? "";
  const hasMapLocation =
    event.locationType === "in_person" &&
    (isLocationApprox
      ? approxQuery.trim().length > 0
      : (event.locationLat != null && event.locationLng != null) ||
        (event.locationAddress ?? event.locationName ?? "").trim().length > 0);

  const mapZoom = isLocationApprox ? 13 : 15;
  const mapQuery = hasMapLocation
    ? isLocationApprox
      ? approxQuery.trim()
      : event.locationLat != null && event.locationLng != null
        ? `${event.locationLat},${event.locationLng}`
        : (event.locationAddress ?? event.locationName ?? "").trim()
    : "";

  // "Open in Google Maps" link: exact → search by address; approximate → search
  // by area text (safe, doesn't reveal the venue).
  const mapsLinkQuery = isLocationApprox ? approxQuery.trim() : mapQuery;
  const mapsLinkLabel = isLocationApprox ? "View area in Google Maps" : "Open in Google Maps";

  const bannerUrl = event.bannerKey
    ? `${getMediaApiBaseUrl()}/events/${event.id}/banner?v=${Date.now()}`
    : null;

  const hobbies = event.hobbies?.length > 0
    ? event.hobbies
    : event.hobby ? [{ name: event.hobby, slug: event.hobbySlug ?? "" }] : [];

  const avatarBaseUrl = getAvatarBaseUrl();

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Banner */}
      {bannerUrl && (
        <Box
          sx={{
            width: "100%",
            height: { xs: 160, sm: 220 },
            borderRadius: 3,
            overflow: "hidden",
            bgcolor: "grey.100",
          }}
        >
          <Box
            component="img"
            src={bannerUrl}
            alt={`${event.title} banner`}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
      )}

      {/* Header */}
      <Box>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 1, gap: 0.75 }}>
          {hobbies.map((h) => (
            <Chip
              key={h.slug}
              label={h.name}
              size="small"
              sx={{ bgcolor: "primary.light", color: "primary.dark", fontWeight: 600, fontSize: "0.75rem" }}
            />
          ))}
          {isCanceled && <Chip label="Canceled" size="small" color="error" />}
        </Stack>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.75 }}>
          {event.title}
        </Typography>
        <Stack spacing={0.75}>
          <Typography variant="body1" color="text.secondary">
            {event.isHost ? "You\u2019re hosting this" : `Hosted by ${event.hostName}`}
          </Typography>
          <Chip label={visibilityLabel(event.visibility)} size="small" variant="outlined" sx={{ alignSelf: "flex-start" }} />
        </Stack>
      </Box>

      {/* Details card */}
      <AppCard>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AccessTimeRoundedIcon sx={{ color: "primary.main" }} />
            <Typography variant="body1">{formatDateTime(event.startsAt)}</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            {event.locationType === "online" ? (
              <LinkRoundedIcon sx={{ color: "primary.main", mt: "2px" }} />
            ) : isLocationApprox ? (
              <LockOutlinedIcon sx={{ color: "text.secondary", mt: "2px" }} />
            ) : (
              <PlaceRoundedIcon sx={{ color: "primary.main", mt: "2px" }} />
            )}
            <Stack spacing={0.4}>
              <Typography variant="body1">{locationDisplay}</Typography>
              {locationHint && (
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <InfoOutlinedIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography variant="caption" color="text.secondary">
                    {locationHint}
                  </Typography>
                </Stack>
              )}
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <PeopleOutlineRoundedIcon sx={{ color: "primary.main" }} />
            <Typography variant="body1">
              {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
              {event.maxSeats ? ` (${event.maxSeats} seats)` : ""}
            </Typography>
          </Stack>
        </Stack>
      </AppCard>

      {/* Map (in-person events with location) */}
      {hasMapLocation && mapQuery && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
        <AppCard sx={{ p: 0, overflow: "hidden" }}>
          <Box
            component="iframe"
            src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(mapQuery)}&zoom=${mapZoom}`}
            title={isLocationApprox ? "Approximate event area" : "Event location"}
            sx={{
              width: "100%",
              height: 240,
              border: "none",
              display: "block",
            }}
          />
          <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
            <Typography
              component="a"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsLinkQuery)}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="body2"
              sx={{
                color: "primary.main",
                fontWeight: 600,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {mapsLinkLabel}
            </Typography>
            {isLocationApprox && (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                Map shows approximate area only
              </Typography>
            )}
          </Box>
        </AppCard>
      )}

      {/* Description */}
      {event.description && (
        <AppCard>
          <Typography variant="body1" sx={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>
            {event.description}
          </Typography>
        </AppCard>
      )}

      {/* RSVP actions (non-hosts, non-canceled) */}
      {!event.isHost && !isCanceled && (
        <AppCard>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Are you in?
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <AppButton onClick={() => handleRsvp("going")} disabled={rsvpSubmitting} sx={{ flex: 1 }}>
              Going
            </AppButton>
            <AppButton onClick={() => handleRsvp("maybe")} disabled={rsvpSubmitting} variant="outlined" sx={{ flex: 1 }}>
              Maybe
            </AppButton>
            <AppButton onClick={() => handleRsvp("cant_make_it")} disabled={rsvpSubmitting} variant="outlined" color="inherit" sx={{ flex: 1 }}>
              Can&apos;t make it
            </AppButton>
          </Stack>

          {event.allowAltTimes && (
            <Box sx={{ mt: 2 }}>
              {!showAltTimeForm ? (
                <Button size="small" onClick={() => setShowAltTimeForm(true)} sx={{ textTransform: "none" }}>
                  Suggest another time
                </Button>
              ) : (
                <Stack spacing={2} sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Suggest another time
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <AppTextField label="Date" type="date" value={altDate} onChange={(e) => setAltDate(e.target.value)} sx={{ flex: 1 }} />
                    <AppTextField label="Time" type="time" value={altTime} onChange={(e) => setAltTime(e.target.value)} sx={{ flex: 1 }} />
                  </Stack>
                  <AppTextField label="Note (optional)" placeholder="e.g. Friday works better for me" value={altNote} onChange={(e) => setAltNote(e.target.value)} />
                  <Stack direction="row" spacing={1}>
                    <AppButton size="small" onClick={handleAltTimeSubmit}>Submit</AppButton>
                    <Button size="small" onClick={() => setShowAltTimeForm(false)}>Cancel</Button>
                  </Stack>
                </Stack>
              )}
            </Box>
          )}
        </AppCard>
      )}

      {/* Invite people (host only, not canceled) */}
      {event.isHost && !isCanceled && (
        <AppCard>
          <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight={600}>
                Invite people
              </Typography>
              {!showInviteForm && (
                <AppButton
                  size="small"
                  variant="outlined"
                  startIcon={<PersonAddRoundedIcon />}
                  onClick={() => setShowInviteForm(true)}
                  sx={{ textTransform: "none" }}
                >
                  Add
                </AppButton>
              )}
            </Stack>

            {showInviteForm && (
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  Search by name, @handle, or email. Invite emails are sent immediately.
                </Typography>
                <Box sx={{ position: "relative" }}>
                  <TextField
                    fullWidth
                    size="medium"
                    placeholder="Name, @handle, or email address"
                    value={inviteSearch}
                    onChange={(e) => setInviteSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && EMAIL_RE.test(inviteSearch.trim())) {
                        e.preventDefault();
                        handleInvite(undefined, inviteSearch.trim().toLowerCase());
                      }
                    }}
                    disabled={inviteSubmitting}
                  />
                  {searching && (
                    <CircularProgress size={20} sx={{ position: "absolute", right: 12, top: 18 }} />
                  )}
                </Box>

                {/* Search results */}
                {searchResults.length > 0 && (
                  <Stack
                    spacing={0}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      overflow: "hidden",
                    }}
                  >
                    {searchResults.map((r) => (
                      <Box
                        key={r.userId}
                        sx={{
                          px: 2, py: 1.25,
                          cursor: "pointer",
                          "&:hover": { bgcolor: "grey.50" },
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          "&:last-child": { borderBottom: "none" },
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                        onClick={() => handleInvite(r.userId)}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{r.displayName}</Typography>
                          {r.handle && (
                            <Typography variant="caption" color="text.secondary">{r.handle}</Typography>
                          )}
                        </Box>
                        <PersonAddRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                      </Box>
                    ))}
                  </Stack>
                )}

                {/* Email invite prompt */}
                {inviteSearch.trim().length > 3 &&
                  EMAIL_RE.test(inviteSearch.trim()) &&
                  searchResults.length === 0 &&
                  !searching && (
                    <Box
                      sx={{
                        p: 2, borderRadius: 1,
                        bgcolor: "primary.light",
                        cursor: "pointer",
                        "&:hover": { opacity: 0.85 },
                      }}
                      onClick={() => handleInvite(undefined, inviteSearch.trim().toLowerCase())}
                    >
                      <Typography variant="body2" fontWeight={500}>
                        Invite <strong>{inviteSearch.trim()}</strong> by email
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        They&apos;ll receive an invite email
                      </Typography>
                    </Box>
                  )}

                <Button
                  size="small"
                  onClick={() => { setShowInviteForm(false); setInviteSearch(""); setSearchResults([]); }}
                  sx={{ alignSelf: "flex-start", textTransform: "none" }}
                >
                  Done inviting
                </Button>
              </Stack>
            )}

            {/* Existing invites */}
            {invites.length > 0 && (
              <Stack spacing={0.75} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  Invited ({invites.length})
                </Typography>
                <Stack direction="row" flexWrap="wrap" gap={0.75}>
                  {invites.map((inv, idx) => (
                    <Chip
                      key={inv.userId ?? inv.email ?? idx}
                      label={inv.name}
                      size="small"
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </Stack>
            )}
          </Stack>
        </AppCard>
      )}

      {/* Who's in — Responses section (below Invite people, above Host actions) */}
      {rsvps.length > 0 && (
        <AppCard>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}>
            Who&apos;s in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.5 }}>
            {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
            {event.maxSeats ? ` · ${event.maxSeats} seats` : ""}
          </Typography>
          <Stack spacing={0}>
            {rsvps.map((r) => (
              <Stack
                key={r.userId}
                direction="row"
                alignItems="center"
                spacing={2}
                sx={{
                  py: 1.75,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <UserAvatar
                  src={r.avatarUrl ? `${avatarBaseUrl}${r.avatarUrl}` : null}
                  name={r.name}
                  size={44}
                  sx={{ flexShrink: 0 }}
                />
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" fontWeight={600} sx={{ fontSize: "1rem" }}>
                    {r.name}
                  </Typography>
                  {r.status === "going" ? (
                    <Chip
                      icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                      label="Going"
                      size="small"
                      color="success"
                      variant="filled"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        "& .MuiChip-icon": { color: "inherit", opacity: 0.9 },
                      }}
                    />
                  ) : r.status === "maybe" ? (
                    <Chip
                      label="Maybe"
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                    />
                  ) : (
                    <Chip
                      label="Can\u2019t make it"
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 500, fontSize: "0.8125rem", color: "text.secondary" }}
                    />
                  )}
                </Stack>
              </Stack>
            ))}
          </Stack>
        </AppCard>
      )}

      {/* Host actions */}
      {event.isHost && !isCanceled && (
        <AppCard>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button variant="outlined" color="error" onClick={handleCancel} sx={{ textTransform: "none" }}>
              Cancel this plan
            </Button>
          </Stack>
        </AppCard>
      )}

      {/* Alternate times */}
      {altTimes.length > 0 && (
        <AppCard>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Suggested alternate times
          </Typography>
          <Stack spacing={1} divider={<Divider />}>
            {altTimes.map((a, i) => (
              <Box key={i}>
                <Typography variant="body2" fontWeight={500}>
                  {a.name} suggested {formatDateTime(a.suggestedAt)}
                </Typography>
                {a.note && (
                  <Typography variant="caption" color="text.secondary">
                    {a.note}
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </AppCard>
      )}
    </Stack>
  );
}
