"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box, Typography, Stack, Button, Chip, Avatar, CircularProgress,
  Divider, IconButton, Tooltip, Tab, Tabs,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ShareRoundedIcon from "@mui/icons-material/ShareRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

type CommunityData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
  chat_enabled: boolean;
  location_name: string | null;
  location_address: string | null;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
  member_count: number;
  created_at: string;
};

type Member = {
  id: string;
  user_id: string;
  role: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
};

type PlanEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  timezone?: string;
  location_type: string;
  location_name: string | null;
  location_area: string | null;
  host_name: string | null;
  host_username: string | null;
  host_avatar_url: string | null;
  going_count: number;
  hobby_names: string | null;
};

type JoinRequest = {
  id: string;
  user_id: string;
  name: string | null;
  username: string | null;
  created_at: string;
};

export default function CommunityDetailClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const slug = params.slug as string;

  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [viewerMembership, setViewerMembership] = useState<{ role: string; status: string } | null>(null);
  const [viewerPendingRequest, setViewerPendingRequest] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${slug}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        setCommunity(data.community);
        setViewerMembership(data.viewerMembership);
        setViewerPendingRequest(data.viewerPendingRequest ?? false);
        setRestricted(data.restricted ?? false);
        setShareToken(data.shareToken ?? null);
        setPendingRequests(data.pendingRequests ?? []);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [slug]);

  const fetchEvents = useCallback(async () => {
    if (!community) return;
    setEventsLoading(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/events`, { auth: true });
      const data = await res.json();
      if (data.ok) setEvents(data.events);
    } catch { /* noop */ }
    setEventsLoading(false);
  }, [community]);

  const fetchMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/members`, { auth: true });
      const data = await res.json();
      if (data.ok) setMembers(data.members);
    } catch { /* noop */ }
    setMembersLoading(false);
  }, [community]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  useEffect(() => {
    if (!community || restricted) return;
    if (tabIndex === 0) fetchEvents();
    else if (tabIndex === 1) fetchMembers();
  }, [community, restricted, tabIndex, fetchEvents, fetchMembers]);

  const handleJoin = async () => {
    if (!community) return;
    setJoining(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/join`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        if (data.status === "joined") { toast.success("You've joined!"); fetchCommunity(); }
        else if (data.status === "pending") { toast.success("Request sent! The owner will review it."); setViewerPendingRequest(true); }
        else if (data.status === "already_member") toast.info("You're already a member");
      }
    } catch { toast.error("Something went wrong"); }
    setJoining(false);
  };

  const handleLeave = async () => {
    if (!community) return;
    setLeaving(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/leave`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) { toast.success("You've left the community"); fetchCommunity(); }
      else toast.error(data.message || "Cannot leave");
    } catch { toast.error("Something went wrong"); }
    setLeaving(false);
  };

  const handleJoinRequestAction = async (requestId: string, action: "approve" | "decline") => {
    if (!community) return;
    try {
      const res = await apiFetch(`/communities/${community.id}/join-requests/${requestId}`, {
        auth: true, method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(action === "approve" ? "Approved!" : "Declined");
        setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (action === "approve") fetchMembers();
      }
    } catch { toast.error("Something went wrong"); }
  };

  const handleShare = async () => {
    const url = shareToken
      ? `${window.location.origin}/communities/${slug}?share_token=${shareToken}`
      : `${window.location.origin}/communities/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!community) return;
    try {
      const res = await apiFetch(`/communities/${community.id}/members/${userId}/remove`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) { toast.success("Member removed"); fetchMembers(); fetchCommunity(); }
    } catch { toast.error("Something went wrong"); }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!community) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", px: 3, py: 6, textAlign: "center" }}>
        <Typography variant="h6" color="text.secondary">Community not found</Typography>
      </Box>
    );
  }

  const isOwner = viewerMembership?.role === "owner";
  const isMember = !!viewerMembership;

  if (restricted) {
    return (
      <Box sx={{ maxWidth: 600, mx: "auto", px: { xs: 2, sm: 3 }, py: 4 }}>
        <AppCard>
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <LockRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography variant="h6" fontWeight={700}>{community.name}</Typography>
            <Typography color="text.secondary">This is a private community.</Typography>
            <Chip icon={<PeopleRoundedIcon sx={{ fontSize: "14px !important" }} />} label={`${community.member_count} member${community.member_count !== 1 ? "s" : ""}`} size="small" variant="outlined" />
            {viewerPendingRequest ? (
              <Chip icon={<HourglassEmptyRoundedIcon />} label="Request pending" color="warning" variant="outlined" />
            ) : community.join_mode === "approval_required" ? (
              <Button variant="contained" onClick={handleJoin} disabled={joining} sx={{ textTransform: "none" }}>
                {joining ? <CircularProgress size={20} color="inherit" /> : "Request to join"}
              </Button>
            ) : (
              <Button variant="contained" onClick={handleJoin} disabled={joining} sx={{ textTransform: "none" }}>
                {joining ? <CircularProgress size={20} color="inherit" /> : "Join community"}
              </Button>
            )}
          </Stack>
        </AppCard>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      {/* Header */}
      <AppCard sx={{ mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "flex-start" }}>
          <Avatar
            sx={{
              width: 64, height: 64,
              bgcolor: "primary.main", color: "primary.contrastText",
              fontWeight: 700, fontSize: "1.5rem",
            }}
          >
            {community.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Typography variant="h5" fontWeight={700} noWrap>{community.name}</Typography>
              {community.visibility === "private" ? (
                <Tooltip title="Private community"><LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></Tooltip>
              ) : (
                <Tooltip title="Public community"><PublicRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></Tooltip>
              )}
            </Stack>
            {community.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1.5, whiteSpace: "pre-wrap" }}>
                {community.description}
              </Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
              <Chip
                icon={<PeopleRoundedIcon sx={{ fontSize: "14px !important" }} />}
                label={`${community.member_count} member${community.member_count !== 1 ? "s" : ""}`}
                size="small" variant="outlined"
              />
              {community.location_name && (
                <Chip label={community.location_name} size="small" variant="outlined" />
              )}
              {community.join_mode === "approval_required" && (
                <Chip label="Approval required" size="small" color="warning" variant="outlined" />
              )}
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Tooltip title="Share">
              <IconButton onClick={handleShare} size="small"><ShareRoundedIcon /></IconButton>
            </Tooltip>
            {isOwner && (
              <Tooltip title="Edit">
                <IconButton onClick={() => router.push(`/communities/${slug}/edit`)} size="small">
                  <EditRoundedIcon />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1.5} alignItems="center">
          {!isMember && !viewerPendingRequest && (
            <Button variant="contained" size="small" onClick={handleJoin} disabled={joining} sx={{ textTransform: "none" }}>
              {joining ? <CircularProgress size={18} color="inherit" /> : community.join_mode === "approval_required" ? "Request to join" : "Join community"}
            </Button>
          )}
          {viewerPendingRequest && !isMember && (
            <Chip icon={<HourglassEmptyRoundedIcon />} label="Request pending" color="warning" variant="outlined" size="small" />
          )}
          {isMember && !isOwner && (
            <Button variant="outlined" size="small" onClick={handleLeave} disabled={leaving} sx={{ textTransform: "none", color: "text.secondary", borderColor: "divider" }}>
              {leaving ? <CircularProgress size={18} color="inherit" /> : "Leave community"}
            </Button>
          )}
          {isMember && (
            <Button
              variant="outlined" size="small"
              startIcon={<AddRoundedIcon />}
              onClick={() => router.push(`/events/create?community_id=${community.id}&community_name=${encodeURIComponent(community.name)}`)}
              sx={{ textTransform: "none" }}
            >
              Create a plan
            </Button>
          )}
        </Stack>
      </AppCard>

      {/* Pending join requests (owner only) */}
      {isOwner && pendingRequests.length > 0 && (
        <AppCard sx={{ mb: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
            Pending join requests ({pendingRequests.length})
          </Typography>
          <Stack spacing={1.5}>
            {pendingRequests.map((req) => (
              <Stack key={req.id} direction="row" alignItems="center" spacing={2}>
                <Avatar sx={{ width: 36, height: 36, bgcolor: "grey.300", fontSize: "0.85rem" }}>
                  {(req.name || req.username || "?").charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{req.name || req.username || "Unknown"}</Typography>
                  {req.username && <Typography variant="caption" color="text.secondary">@{req.username.replace(/^@/, "")}</Typography>}
                </Box>
                <Tooltip title="Approve">
                  <IconButton size="small" color="success" onClick={() => handleJoinRequestAction(req.id, "approve")}>
                    <CheckRoundedIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Decline">
                  <IconButton size="small" color="error" onClick={() => handleJoinRequestAction(req.id, "decline")}>
                    <CloseRoundedIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
        </AppCard>
      )}

      {/* Tabs */}
      <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 2 }}>
        <Tab label="Plans" icon={<EventNoteRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ textTransform: "none", minHeight: 48 }} />
        <Tab label="Members" icon={<PeopleRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ textTransform: "none", minHeight: 48 }} />
      </Tabs>

      {/* Plans tab */}
      {tabIndex === 0 && (
        <>
          {eventsLoading && events.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={28} /></Box>
          ) : events.length === 0 ? (
            <AppCard>
              <Stack spacing={1.5} alignItems="center" sx={{ py: 4 }}>
                <EventNoteRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
                <Typography color="text.secondary">No upcoming plans in this community yet.</Typography>
                {isMember && (
                  <Button
                    variant="outlined" size="small" startIcon={<AddRoundedIcon />}
                    onClick={() => router.push(`/events/create?community_id=${community.id}&community_name=${encodeURIComponent(community.name)}`)}
                    sx={{ textTransform: "none", mt: 1 }}
                  >
                    Create the first plan
                  </Button>
                )}
              </Stack>
            </AppCard>
          ) : (
            <Stack spacing={2}>
              {events.map((ev) => (
                <AppCard
                  key={ev.id}
                  sx={{ cursor: "pointer", transition: "box-shadow 0.15s", "&:hover": { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" } }}
                  onClick={() => router.push(`/events/${ev.id}`)}
                >
                  <Stack spacing={0.75}>
                    <Typography variant="subtitle1" fontWeight={700}>{ev.title}</Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center">
                      <Typography variant="body2" color="text.secondary">
                        {new Date(ev.starts_at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </Typography>
                      {ev.location_name && (
                        <Typography variant="body2" color="text.secondary">{ev.location_name}</Typography>
                      )}
                      <Chip label={`${ev.going_count} going`} size="small" variant="outlined" />
                    </Stack>
                    {ev.host_name && (
                      <Typography variant="caption" color="text.secondary">
                        Hosted by {ev.host_name || `@${ev.host_username}`}
                      </Typography>
                    )}
                  </Stack>
                </AppCard>
              ))}
            </Stack>
          )}
        </>
      )}

      {/* Members tab */}
      {tabIndex === 1 && (
        <>
          {membersLoading && members.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress size={28} /></Box>
          ) : (
            <Stack spacing={1.5}>
              {members.map((m) => {
                const handle = m.username?.replace(/^@/, "") ?? null;
                return (
                  <AppCard key={m.id}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Avatar
                        src={m.avatar_url ? `${getAvatarBaseUrl()}${m.avatar_url}` : undefined}
                        sx={{ width: 40, height: 40, bgcolor: "grey.300", fontSize: "0.9rem" }}
                      >
                        {(m.name || m.username || "?").charAt(0).toUpperCase()}
                      </Avatar>
                      <Box
                        sx={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => router.push(`/users/${handle || m.user_id}`)}
                      >
                        <Typography variant="body2" fontWeight={600} noWrap>{m.name || m.username || "Unknown"}</Typography>
                        {handle && <Typography variant="caption" color="text.secondary">@{handle}</Typography>}
                      </Box>
                      {m.role === "owner" && (
                        <Chip label="Owner" size="small" color="primary" variant="outlined" />
                      )}
                      {isOwner && m.role !== "owner" && (
                        <Button
                          size="small" variant="outlined" color="error"
                          onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.user_id); }}
                          sx={{ textTransform: "none", fontSize: "0.75rem" }}
                        >
                          Remove
                        </Button>
                      )}
                    </Stack>
                  </AppCard>
                );
              })}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
}
