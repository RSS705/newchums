"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import { useParams, useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  locationType: string;
  locationName: string | null;
  locationAddress: string | null;
  onlineLink: string | null;
  maxSeats: number | null;
  visibility: string;
  status: string;
  allowAltTimes: boolean;
  canceledAt: string | null;
  hobby: string | null;
  hostName: string;
  hostUserId: string;
  isHost: boolean;
};

type RsvpEntry = { userId: string; name: string; status: string; note: string | null };
type AltTimeEntry = { userId: string; name: string; suggestedAt: string; note: string | null };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function EventDetailClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);
  const [altTimes, setAltTimes] = useState<AltTimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [showAltTimeForm, setShowAltTimeForm] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altTime, setAltTime] = useState("");
  const [altNote, setAltNote] = useState("");

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
      };
      setEvent(data.event);
      setRsvps(data.rsvps);
      setAltTimes(data.altTimes);
    } catch {
      setError("Failed to load plan");
    }
    setLoading(false);
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const handleRsvp = async (status: string) => {
    setRsvpSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
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
  const locationDisplay =
    event.locationType === "online"
      ? event.onlineLink || "Online"
      : [event.locationName, event.locationAddress].filter(Boolean).join(" — ") || "TBD";

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Back */}
      <Button
        onClick={() => router.push("/plans")}
        startIcon={<ArrowBackRoundedIcon />}
        sx={{ alignSelf: "flex-start", textTransform: "none" }}
      >
        Your Plans
      </Button>

      {/* Header */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          {event.hobby && <Chip label={event.hobby} size="small" sx={{ bgcolor: "primary.light", color: "primary.dark", fontWeight: 500 }} />}
          {isCanceled && <Chip label="Canceled" size="small" color="error" />}
          <Chip label={event.visibility === "invite_only" ? "Invite only" : event.visibility === "chums_only" ? "Chums only" : "Public"} size="small" variant="outlined" />
        </Stack>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.75 }}>
          {event.title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {event.isHost ? "You\u2019re hosting this" : `Hosted by ${event.hostName}`}
        </Typography>
      </Box>

      {/* Details card */}
      <AppCard>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <AccessTimeRoundedIcon sx={{ color: "primary.main" }} />
            <Typography variant="body1">{formatDateTime(event.startsAt)}</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="center">
            {event.locationType === "online" ? (
              <LinkRoundedIcon sx={{ color: "primary.main" }} />
            ) : (
              <PlaceRoundedIcon sx={{ color: "primary.main" }} />
            )}
            <Typography variant="body1">{locationDisplay}</Typography>
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

      {/* Attendees */}
      {rsvps.length > 0 && (
        <AppCard>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Responses ({rsvps.length})
          </Typography>
          <Stack spacing={1} divider={<Divider />}>
            {rsvps.map((r) => (
              <Stack key={r.userId} direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2">{r.name}</Typography>
                <Chip
                  label={r.status === "going" ? "Going" : r.status === "maybe" ? "Maybe" : "Can\u2019t make it"}
                  size="small"
                  color={r.status === "going" ? "success" : r.status === "maybe" ? "warning" : "default"}
                  variant="outlined"
                />
              </Stack>
            ))}
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
