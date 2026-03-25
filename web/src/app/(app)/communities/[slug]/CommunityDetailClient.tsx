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
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import Link from "next/link";
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
      <Stack spacing={{ xs: 3, sm: 4 }}>
        <AppCard>
          <Stack spacing={2.5} alignItems="center" sx={{ py: { xs: 4, sm: 5 } }}>
            <Avatar
              sx={{
                width: 72, height: 72,
                bgcolor: "primary.main", color: "primary.contrastText",
                fontWeight: 700, fontSize: "1.75rem",
              }}
            >
              {community.name.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ textAlign: "center" }}>
              <Typography
                component="h1"
                sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", mb: 0.5 }}
              >
                {community.name}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                This is a private community. Join to see plans and members.
              </Typography>
            </Box>
            <Chip icon={<PeopleRoundedIcon sx={{ fontSize: "14px !important" }} />} label={`${community.member_count} member${community.member_count !== 1 ? "s" : ""}`} size="small" variant="outlined" />
            {viewerPendingRequest ? (
              <Chip icon={<HourglassEmptyRoundedIcon />} label="Request pending" color="warning" variant="outlined" />
            ) : (
              <Button
                variant="contained"
                onClick={handleJoin}
                disabled={joining}
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, py: 1, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
              >
                {joining ? <CircularProgress size={20} color="inherit" /> : community.join_mode === "approval_required" ? "Request to join" : "Join community"}
              </Button>
            )}
          </Stack>
        </AppCard>
      </Stack>
    );
  }

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header card */}
      <AppCard>
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
              <Typography
                component="h1"
                sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em" }}
                noWrap
              >
                {community.name}
              </Typography>
              {community.visibility === "private" ? (
                <Tooltip title="Private community"><LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></Tooltip>
              ) : (
                <Tooltip title="Public community"><PublicRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} /></Tooltip>
              )}
            </Stack>
            {community.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1.5, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {community.description}
              </Typography>
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
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

        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          {!isMember && !viewerPendingRequest && (
            <Button
              variant="contained"
              onClick={handleJoin}
              disabled={joining}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
            >
              {joining ? <CircularProgress size={18} color="inherit" /> : community.join_mode === "approval_required" ? "Request to join" : "Join community"}
            </Button>
          )}
          {viewerPendingRequest && !isMember && (
            <Chip icon={<HourglassEmptyRoundedIcon />} label="Request pending" color="warning" variant="outlined" size="small" />
          )}
          {isMember && !isOwner && (
            <Button variant="outlined" size="small" onClick={handleLeave} disabled={leaving} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", borderColor: "divider", borderRadius: 2 }}>
              {leaving ? <CircularProgress size={18} color="inherit" /> : "Leave community"}
            </Button>
          )}
          {isMember && (
            <Button
              component={Link}
              href={`/events/create?community_id=${community.id}&community_name=${encodeURIComponent(community.name)}`}
              variant="contained"
              startIcon={<AddCircleRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
            >
              Start a plan
            </Button>
          )}
        </Stack>
      </AppCard>

      {/* Pending join requests (owner only) */}
      {isOwner && pendingRequests.length > 0 && (
        <AppCard>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 2 }}>
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
      <Box>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 2.5 }}>
          <Tab label="Plans" icon={<EventNoteRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ textTransform: "none", minHeight: 48, fontWeight: 600 }} />
          <Tab label="Members" icon={<PeopleRoundedIcon sx={{ fontSize: 18 }} />} iconPosition="start" sx={{ textTransform: "none", minHeight: 48, fontWeight: 600 }} />
        </Tabs>

        {/* Plans tab */}
        {tabIndex === 0 && (
          <>
            {eventsLoading && events.length === 0 ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={28} /></Box>
            ) : events.length === 0 ? (
              <AppCard>
                <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 } }}>
                  <EventNoteRoundedIcon sx={{ fontSize: 56, color: "text.disabled", opacity: 0.5 }} />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                      No upcoming plans yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {isMember
                        ? "Be the first to organize something for this community."
                        : "Plans from this community will appear here."}
                    </Typography>
                  </Box>
                  {isMember && (
                    <Button
                      component={Link}
                      href={`/events/create?community_id=${community.id}&community_name=${encodeURIComponent(community.name)}`}
                      variant="contained"
                      startIcon={<AddCircleRoundedIcon />}
                      sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, mt: 1, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                    >
                      Start the first plan
                    </Button>
                  )}
                </Stack>
              </AppCard>
            ) : (
              <Stack spacing={2}>
                {events.map((ev) => (
                  <AppCard
                    key={ev.id}
                    sx={{ cursor: "pointer", transition: "box-shadow 0.15s, transform 0.15s", "&:hover": { boxShadow: "0 4px 16px rgba(0,0,0,0.08)", transform: "translateY(-1px)" } }}
                    onClick={() => router.push(`/events/${ev.id}`)}
                  >
                    <Stack spacing={0.75}>
                      <Typography fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.35 }}>{ev.title}</Typography>
                      <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" useFlexGap>
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
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={28} /></Box>
            ) : members.length === 0 ? (
              <AppCard>
                <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 } }}>
                  <PeopleRoundedIcon sx={{ fontSize: 56, color: "text.disabled", opacity: 0.5 }} />
                  <Typography variant="body1" color="text.secondary">No members to show.</Typography>
                </Stack>
              </AppCard>
            ) : (
              <Stack spacing={1.5}>
                {members.map((m) => {
                  const handle = m.username?.replace(/^@/, "") ?? null;
                  return (
                    <AppCard key={m.id} sx={{ transition: "box-shadow 0.15s", "&:hover": { boxShadow: "0 2px 12px rgba(0,0,0,0.06)" } }}>
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
                            sx={{ textTransform: "none", fontSize: "0.75rem", borderRadius: 1.5 }}
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
    </Stack>
  );
}
