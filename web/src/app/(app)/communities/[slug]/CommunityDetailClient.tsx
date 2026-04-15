"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Box, Typography, Stack, Button, Chip, Avatar, CircularProgress,
  Divider, IconButton, Tooltip, Tab, Tabs, Grid, TextField,
} from "@mui/material";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LanguageRoundedIcon from "@mui/icons-material/LanguageRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import Link from "next/link";
import { AppCard, useToast } from "@/components/ui";
import EventCard, { type PlanEvent } from "@/components/events/EventCard";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { effectiveCategorySet } from "@/lib/interestUtils";

type CommunityData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
  chat_enabled: boolean;
  is_online: boolean;
  website: string | null;
  join_link: string | null;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  avatar_key: string | null;
  owner_user_id: string;
  owner_name: string | null;
  owner_username: string | null;
  owner_avatar_url: string | null;
  member_count: number;
  /** Number of upcoming non-QA plans linked to this community. Exposed on
   *  the restricted (non-member, private-community) response so the locked
   *  preview can surface a real count without leaking plan details. */
  upcoming_plan_count?: number;
  created_at: string;
  status?: string;
  hobbies?: { name: string; slug: string }[];
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

type ApiEvent = Record<string, unknown>;

type JoinRequest = {
  id: string;
  user_id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  message: string | null;
  created_at: string;
};

export default function CommunityDetailClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Initial tab param from the URL (e.g. `?tab=requests` from the
  // community-join-request email CTA). Read once on mount so the user
  // lands on the right tab, then ignored so manual tab clicks aren't
  // fought by the URL state.
  const initialTabParam = searchParams.get("tab");
  const hasAppliedInitialTab = useRef(false);
  const toast = useToast();
  const slug = params.slug as string;

  const [community, setCommunity] = useState<CommunityData | null>(null);
  const [viewerMembership, setViewerMembership] = useState<{ role: string; status: string } | null>(null);
  const [viewerPendingRequest, setViewerPendingRequest] = useState(false);
  // All pending-request display strings and flags are computed server-side
  // so the client doesn't have to do time math during render (keeps the
  // component pure and avoids coupling copy to the local clock).
  const [viewerPendingRequestSentLabel, setViewerPendingRequestSentLabel] = useState<string | null>(null);
  const [viewerPendingRequestRefreshable, setViewerPendingRequestRefreshable] = useState(false);
  const [viewerPendingRequestDaysUntilRefreshable, setViewerPendingRequestDaysUntilRefreshable] = useState<number | null>(null);
  const [viewerDeclinedRequest, setViewerDeclinedRequest] = useState(false);
  const [viewerDeclinedDaysUntilRetriable, setViewerDeclinedDaysUntilRetriable] = useState<number | null>(null);
  const viewerDeclinedRetriable = viewerDeclinedRequest && viewerDeclinedDaysUntilRetriable === null;
  const [restricted, setRestricted] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  // True once the plans fetch has resolved at least once. Gates the empty
  // state so it cannot paint during the one-render gap between the tab
  // mounting and the useEffect kicking off the fetch.
  const [eventsFetched, setEventsFetched] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersFetched, setMembersFetched] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [joinRequestMessage, setJoinRequestMessage] = useState("");
  const [isClosed, setIsClosed] = useState(false);
  const [viewerHobbyItems, setViewerHobbyItems] = useState<{ slug: string; name: string; category?: string | null }[]>([]);

  const mapApiEvent = useCallback((ev: ApiEvent): PlanEvent => {
    const hostUsername = (ev.hostUsername as string)?.replace(/^@/, "");
    const hostName = hostUsername ? `@${hostUsername}` : ((ev.hostName as string) || "Someone");
    const hobbiesRaw = ev.hobbies;
    const hobbies: Array<{ name: string; slug: string }> = typeof hobbiesRaw === "string"
      ? JSON.parse(hobbiesRaw)
      : Array.isArray(hobbiesRaw) ? hobbiesRaw : [];
    const locationType = String(ev.locationType ?? "in_person");
    const locationDisplay = locationType === "online"
      ? ((ev.onlineLink as string) || "Online")
      : ((ev.locationName as string) || (ev.locationAddress as string) || (ev.locationArea as string) || "TBD");
    return {
      id: String(ev.id),
      title: String(ev.title ?? ""),
      description: (ev.description as string) ?? null,
      startsAt: String(ev.startsAt ?? ""),
      locationType,
      locationDisplay,
      locationName: (ev.locationName as string) ?? null,
      locationAddress: (ev.locationAddress as string) ?? null,
      onlineLink: (ev.onlineLink as string) ?? null,
      maxSeats: ev.maxSeats != null ? Number(ev.maxSeats) : null,
      visibility: String(ev.visibility ?? "public"),
      status: String(ev.status ?? "published"),
      hobby: hobbies[0]?.name ?? (ev.hobbyNames as string)?.split(", ")[0] ?? null,
      hobbySlug: hobbies[0]?.slug ?? null,
      hobbies,
      hostName,
      isHost: ev.isHost === true,
      myRsvpStatus: (ev.myRsvpStatus as string) ?? null,
      goingCount: Number(ev.goingCount ?? 0),
      maybeCount: Number(ev.maybeCount ?? 0),
      bannerKey: (ev.bannerKey as string) ?? null,
      community: (ev.community as { id: string; slug: string; name: string }) ?? null,
      hasPrefMismatch: ev.hasPrefMismatch === true,
      isQa: ev.isQa === true,
    };
  }, []);

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${slug}`, { auth: true });
      const data = await res.json();
      if (data.ok) {
        if (data.community?.status === "closed") {
          setCommunity(data.community);
          setIsClosed(true);
        } else {
          setCommunity(data.community);
          setViewerMembership(data.viewerMembership);
          setViewerPendingRequest(data.viewerPendingRequest ?? false);
          setViewerPendingRequestSentLabel(data.viewerPendingRequestSentLabel ?? null);
          setViewerPendingRequestRefreshable(data.viewerPendingRequestRefreshable ?? false);
          setViewerPendingRequestDaysUntilRefreshable(
            typeof data.viewerPendingRequestDaysUntilRefreshable === "number"
              ? data.viewerPendingRequestDaysUntilRefreshable
              : null
          );
          setViewerDeclinedRequest(data.viewerDeclinedRequest ?? false);
          setViewerDeclinedDaysUntilRetriable(
            typeof data.viewerDeclinedDaysUntilRetriable === "number"
              ? data.viewerDeclinedDaysUntilRetriable
              : null
          );
          setRestricted(data.restricted ?? false);
          setShareToken(data.shareToken ?? null);
          setPendingRequests(data.pendingRequests ?? []);
        }
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
      if (data.ok) setEvents((data.events as ApiEvent[]).map(mapApiEvent));
    } catch { /* noop */ }
    setEventsLoading(false);
    setEventsFetched(true);
  }, [community, mapApiEvent]);

  const fetchMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/members`, { auth: true });
      const data = await res.json();
      if (data.ok) setMembers(data.members);
    } catch { /* noop */ }
    setMembersLoading(false);
    setMembersFetched(true);
  }, [community]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (res.ok) {
          const d = await res.json();
          setViewerHobbyItems(d.profile?.interest_items ?? []);
        }
      } catch { /* noop */ }
    })();
  }, []);

  const viewerHobbyCategories = useMemo(() => {
    if (!viewerHobbyItems.length) return undefined;
    return effectiveCategorySet(viewerHobbyItems);
  }, [viewerHobbyItems]);

  useEffect(() => {
    if (!community || restricted) return;
    if (tabIndex === 0) fetchEvents();
    else if (tabIndex === 1) fetchMembers();
  }, [community, restricted, tabIndex, fetchEvents, fetchMembers]);

  // Apply an incoming ?tab=<name> query param to tabIndex exactly once, the
  // first time we know enough about the viewer to evaluate eligibility
  // (community loaded + viewerMembership resolved). The main caller is the
  // community-join-request email's "Review request" CTA, which deep-links
  // to ?tab=requests. Non-owner viewers who somehow land on that URL (e.g.
  // share) silently fall back to Plans instead of showing a broken tab.
  //
  // setState-in-effect is intentional here: the initial tabIndex depends
  // on async data (community + membership) and a URL param that aren't
  // available at mount, and the ref guard ensures this runs exactly once
  // so manual tab clicks are not fought on subsequent renders.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (hasAppliedInitialTab.current) return;
    if (!community) return;
    if (!initialTabParam) {
      hasAppliedInitialTab.current = true;
      return;
    }
    const viewerIsOwner = viewerMembership?.role === "owner";
    if (initialTabParam === "requests" && viewerIsOwner && community.visibility === "private") {
      setTabIndex(2);
    } else if (initialTabParam === "members") {
      setTabIndex(1);
    }
    // `plans` or any unrecognized value falls through to the default of 0.
    hasAppliedInitialTab.current = true;
  }, [community, viewerMembership, initialTabParam]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleJoin = async () => {
    if (!community) return;
    setJoining(true);
    try {
      const msgBody = joinRequestMessage.trim() ? { message: joinRequestMessage.trim() } : {};
      const res = await apiFetch(`/communities/${community.id}/join`, {
        auth: true, method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msgBody),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.status === "joined") {
          toast.success("You've joined!");
          fetchCommunity();
        } else if (data.status === "pending") {
          toast.success("Request sent! The owner will review it.");
          setJoinRequestMessage("");
          // Re-fetch so the UI picks up the new pending timestamp and
          // cooldown state instead of guessing.
          fetchCommunity();
        } else if (data.status === "refreshed") {
          toast.success("Request re-sent. The owner will be notified again.");
          setJoinRequestMessage("");
          fetchCommunity();
        } else if (data.status === "already_pending") {
          // Cooldown not yet met. Server returns daysRemaining; surface it.
          const days = typeof data.daysRemaining === "number" ? data.daysRemaining : null;
          toast.info(
            days
              ? `You can send another request in ${days} ${days === 1 ? "day" : "days"}.`
              : "You already have a pending request."
          );
        } else if (data.status === "declined_cooldown") {
          const days = typeof data.daysRemaining === "number" ? data.daysRemaining : null;
          toast.info(
            days
              ? `You can request to join again in ${days} ${days === 1 ? "day" : "days"}.`
              : "You can't request to join this community yet."
          );
          fetchCommunity();
        } else if (data.status === "already_member") {
          toast.info("You're already a member");
        }
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

  const createPlanHref = useMemo(() => {
    if (!community) return "/events/create";
    return `/events/create?community_id=${community.id}`;
  }, [community]);

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

  if (isClosed) {
    return (
      <Stack spacing={{ xs: 3, sm: 4 }}>
        <AppCard>
          <Stack spacing={2.5} alignItems="center" sx={{ py: { xs: 4, sm: 5 } }}>
            <BlockRoundedIcon sx={{ fontSize: 56, color: "text.disabled", opacity: 0.5 }} />
            <Box sx={{ textAlign: "center" }}>
              <Typography
                component="h1"
                sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", mb: 0.5 }}
              >
                {community.name}
              </Typography>
              <Typography variant="body1" color="text.secondary">
                This community has been closed by its owner.
              </Typography>
            </Box>
            <Button
              component={Link}
              href="/communities"
              variant="outlined"
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, borderColor: "divider", color: "text.secondary" }}
            >
              Browse communities
            </Button>
          </Stack>
        </AppCard>
      </Stack>
    );
  }

  const isOwner = viewerMembership?.role === "owner";
  const isMember = !!viewerMembership;

  if (restricted) {
    return (
      <Stack spacing={{ xs: 3, sm: 4 }}>
        {/* Preview header */}
        <AppCard>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "flex-start" }}>
            <Avatar
              variant="rounded"
              src={community.avatar_key ? `${getAvatarBaseUrl()}/communities/${community.id}/avatar` : undefined}
              sx={{
                width: 64, height: 64,
                borderRadius: 2.5,
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
                <Chip
                  icon={<LockRoundedIcon sx={{ fontSize: "13px !important" }} />}
                  label="Private"
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1.5, borderColor: "divider", color: "text.secondary" }}
                />
              </Stack>

              {/* Hobby chips */}
              {community.hobbies && community.hobbies.length > 0 && (
                <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                  {community.hobbies.map((h) => {
                    const isMatch = viewerHobbyCategories?.has(h.name.toLowerCase()) || viewerHobbyCategories?.has(h.slug.toLowerCase());
                    return (
                      <Chip
                        key={h.slug}
                        label={h.name}
                        size="small"
                        color={isMatch ? "primary" : "default"}
                        variant={isMatch ? "filled" : "outlined"}
                        sx={{
                          height: 24, fontSize: "0.75rem", fontWeight: 500, borderRadius: 1.5,
                          ...(isMatch ? { bgcolor: "primary.light", color: "primary.dark" } : { borderColor: "divider", color: "text.secondary" }),
                        }}
                      />
                    );
                  })}
                </Stack>
              )}

              {community.description && (
                <Typography
                  variant="body1"
                  color="text.secondary"
                  sx={{ mb: 1.5, lineHeight: 1.6, "& p": { m: 0 }, "& a": { color: "primary.main" } }}
                  dangerouslySetInnerHTML={{ __html: community.description }}
                />
              )}

              {(community.is_online || community.location_name || community.website) && (
                <Stack direction="row" spacing={1.5} flexWrap="wrap" alignItems="center" useFlexGap>
                  {community.is_online ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <LanguageRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>Online</Typography>
                    </Stack>
                  ) : community.location_name ? (
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <PlaceRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>{community.location_name}</Typography>
                    </Stack>
                  ) : null}
                  {community.website && (
                    <Stack
                      component="a"
                      href={community.website.startsWith("http") ? community.website : `https://${community.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        px: 1, py: 0.375, borderRadius: 1.5,
                        border: "1px solid",
                        borderColor: "divider",
                        color: "primary.main",
                        textDecoration: "none",
                        transition: "background-color 120ms, border-color 120ms",
                        "&:hover": { bgcolor: "primary.light", borderColor: "primary.light" },
                      }}
                    >
                      <LinkRoundedIcon sx={{ fontSize: 14 }} />
                      <Typography component="span" variant="body2" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        Visit website
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              )}
            </Box>
          </Stack>
        </AppCard>

        {/* Non-numeric preview so a low member/plan count doesn't deflate the page */}
        <AppCard>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box
                sx={{
                  width: 40, height: 40, borderRadius: 2,
                  bgcolor: "primary.light",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <LockRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  Inside this community
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Approved members unlock everything below.
                </Typography>
              </Box>
            </Stack>

            <Stack spacing={1.25}>
              <MemberBenefitRow
                tone="primary"
                icon={<EventNoteRoundedIcon sx={{ fontSize: 18 }} />}
                title="Upcoming plans"
                subtitle="See and RSVP to community plans as they&rsquo;re scheduled."
              />
              <MemberBenefitRow
                tone="success"
                icon={<PeopleRoundedIcon sx={{ fontSize: 18 }} />}
                title="Member directory"
                subtitle="Browse profiles and connect with people who share your interests."
              />
              <MemberBenefitRow
                tone="warning"
                icon={<MailOutlineRoundedIcon sx={{ fontSize: 18 }} />}
                title="Community updates"
                subtitle="Get notified when new plans open up or members join."
              />
            </Stack>
          </Stack>
        </AppCard>

        {viewerPendingRequest ? (
          <PendingRequestStatusBlock
            sentLabel={viewerPendingRequestSentLabel}
            refreshable={viewerPendingRequestRefreshable}
            daysUntilRefreshable={viewerPendingRequestDaysUntilRefreshable}
            joinRequestMessage={joinRequestMessage}
            onChangeMessage={setJoinRequestMessage}
            onRefresh={handleJoin}
            refreshing={joining}
          />
        ) : (viewerDeclinedRequest && !viewerDeclinedRetriable) ? (
          <Box
            sx={{
              p: 2.5, borderRadius: 2,
              border: "1px solid", borderColor: "divider",
              bgcolor: "action.hover",
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <BlockRoundedIcon sx={{ color: "text.secondary", mt: "2px" }} />
              <Box>
                <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
                  Your request wasn&rsquo;t accepted
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  The community owner chose not to approve this request.
                </Typography>
                {viewerDeclinedDaysUntilRetriable !== null && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 1, lineHeight: 1.6, fontStyle: "italic" }}
                  >
                    You&rsquo;ll be able to request to join again in{" "}
                    {viewerDeclinedDaysUntilRetriable}{" "}
                    {viewerDeclinedDaysUntilRetriable === 1 ? "day" : "days"}.
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
        ) : (
          <AppCard>
            <Stack spacing={2}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 40, height: 40, borderRadius: 2,
                    bgcolor: "primary.light",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <AssignmentIndRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                    {viewerDeclinedRequest ? "Try again" : "Request to join"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {viewerDeclinedRequest
                      ? "Your previous request wasn\u2019t accepted, but the cooldown has passed. You can send a new request now."
                      : "The owner reviews every request. You\u2019ll get an email once they respond."}
                  </Typography>
                </Box>
              </Stack>
              <TextField
                value={joinRequestMessage}
                onChange={(e) => setJoinRequestMessage(e.target.value.slice(0, 500))}
                placeholder="Add a note to the community owner (optional)"
                multiline
                maxRows={3}
                size="small"
                fullWidth
                variant="outlined"
                inputProps={{ maxLength: 500 }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
              <Box>
                <Button
                  variant="contained"
                  onClick={handleJoin}
                  disabled={joining}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
                >
                  {joining ? <CircularProgress size={18} color="inherit" /> : "Request to join"}
                </Button>
              </Box>
            </Stack>
          </AppCard>
        )}
      </Stack>
    );
  }

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header card */}
      <AppCard>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems={{ sm: "flex-start" }}>
          <Avatar
            variant="rounded"
            src={community.avatar_key ? `${getAvatarBaseUrl()}/communities/${community.id}/avatar` : undefined}
            sx={{
              width: 64, height: 64,
              borderRadius: 2.5,
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
              {community.visibility === "private" && (
                <Chip
                  icon={<LockRoundedIcon sx={{ fontSize: "13px !important" }} />}
                  label="Private"
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1.5, borderColor: "divider", color: "text.secondary" }}
                />
              )}
            </Stack>
            {/* Hobby chips */}
            {community.hobbies && community.hobbies.length > 0 && (
              <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                {community.hobbies.map((h) => {
                  const isMatch = viewerHobbyCategories?.has(h.name.toLowerCase()) || viewerHobbyCategories?.has(h.slug.toLowerCase());
                  return (
                    <Chip
                      key={h.slug}
                      label={h.name}
                      size="small"
                      color={isMatch ? "primary" : "default"}
                      variant={isMatch ? "filled" : "outlined"}
                      sx={{
                        height: 24,
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        borderRadius: 1.5,
                        ...(isMatch
                          ? { bgcolor: "primary.light", color: "primary.dark" }
                          : { borderColor: "divider", color: "text.secondary" }),
                      }}
                    />
                  );
                })}
              </Stack>
            )}

            {community.description && (
              <Typography
                variant="body1"
                color="text.secondary"
                sx={{ mb: 1.5, lineHeight: 1.6, "& p": { m: 0 }, "& a": { color: "primary.main" } }}
                dangerouslySetInnerHTML={{ __html: community.description }}
              />
            )}
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <PeopleRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                  {community.member_count} {community.member_count === 1 ? "member" : "members"}
                </Typography>
              </Stack>
              {community.is_online ? (
                <>
                  <Typography variant="body2" color="text.disabled">·</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <LanguageRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      Online
                    </Typography>
                  </Stack>
                </>
              ) : community.location_name ? (
                <>
                  <Typography variant="body2" color="text.disabled">·</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <PlaceRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      {community.location_name}
                    </Typography>
                  </Stack>
                </>
              ) : null}
              {community.website && (
                <>
                  <Typography variant="body2" color="text.disabled">·</Typography>
                  <Typography
                    component="a"
                    href={community.website.startsWith("http") ? community.website : `https://${community.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{ fontSize: "0.8125rem", color: "primary.main", fontWeight: 500, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Website
                  </Typography>
                </>
              )}
              {community.is_online && community.join_link && (
                <>
                  <Typography variant="body2" color="text.disabled">·</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <LinkRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography
                      component="a"
                      href={community.join_link.startsWith("http") ? community.join_link : `https://${community.join_link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="body2"
                      sx={{ fontSize: "0.8125rem", color: "primary.main", fontWeight: 500, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Join link
                    </Typography>
                  </Stack>
                </>
              )}
            </Stack>
          </Box>
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
          {isMember && (
            <Button
              component={Link}
              href={createPlanHref}
              variant="contained"
              startIcon={<AddCircleRoundedIcon />}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
            >
              Start a plan
            </Button>
          )}
          <Button
            variant="outlined"
            size="small"
            startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={handleShare}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "divider", color: "text.secondary" }}
          >
            Share link
          </Button>
          {isOwner && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={() => router.push(`/communities/${slug}/edit`)}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, borderColor: "divider", color: "text.secondary" }}
            >
              Edit
            </Button>
          )}
          {isMember && !isOwner && (
            <Button
              variant="text" size="small" onClick={handleLeave} disabled={leaving}
              sx={{ textTransform: "none", fontWeight: 500, color: "text.secondary", fontSize: "0.8125rem", ml: "auto !important" }}
            >
              {leaving ? <CircularProgress size={16} color="inherit" /> : "Leave"}
            </Button>
          )}
        </Stack>
      </AppCard>

      {/* Tabs */}
      <Box>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => {
            setTabIndex(v);
            // Keep the URL in sync with the active tab so a refresh lands
            // on the same surface and a copy-pasted link matches what the
            // sharer was looking at. router.replace keeps this out of the
            // browser history so the back button doesn't tab-walk.
            const next = v === 2 ? "requests" : v === 1 ? "members" : null;
            const url = new URL(window.location.href);
            if (next) url.searchParams.set("tab", next);
            else url.searchParams.delete("tab");
            const nextHref = url.pathname + (url.search || "") + (url.hash || "");
            router.replace(nextHref, { scroll: false });
          }}
          sx={{ mb: 2.5 }}
        >
          <Tab
            label={`Plans${events.length > 0 ? ` (${events.length})` : ""}`}
            icon={<EventNoteRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{ textTransform: "none", minHeight: 48, fontWeight: 600 }}
          />
          <Tab
            label={`Members${community.member_count > 0 ? ` (${community.member_count})` : ""}`}
            icon={<PeopleRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{ textTransform: "none", minHeight: 48, fontWeight: 600 }}
          />
          {isOwner && community.visibility === "private" && (
            <Tab
              label={`Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`}
              icon={<AssignmentIndRoundedIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{ textTransform: "none", minHeight: 48, fontWeight: 600 }}
            />
          )}
        </Tabs>

        {/* Plans tab */}
        {tabIndex === 0 && (
          <>
            {(!eventsFetched || eventsLoading) && events.length === 0 ? (
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
                      href={createPlanHref}
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
              <Grid container spacing={2.5}>
                {events.map((ev) => (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={ev.id}>
                    <EventCard event={ev} viewerHobbyCategories={viewerHobbyCategories} />
                  </Grid>
                ))}
              </Grid>
            )}
          </>
        )}

        {/* Members tab */}
        {tabIndex === 1 && (
          <>
            {(!membersFetched || membersLoading) && members.length === 0 ? (
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
                          sx={{ flex: 1, minWidth: 0, cursor: handle ? "pointer" : "default" }}
                          onClick={() => { if (handle) router.push(`/u/${handle}`); }}
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

        {/* Requests tab (owner of private community) */}
        {tabIndex === 2 && isOwner && community.visibility === "private" && (
          <>
            {pendingRequests.length === 0 ? (
              <AppCard>
                <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 } }}>
                  <AssignmentIndRoundedIcon sx={{ fontSize: 56, color: "text.disabled", opacity: 0.5 }} />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                      No pending requests
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      When someone requests to join, they will appear here for your review.
                    </Typography>
                  </Box>
                </Stack>
              </AppCard>
            ) : (
              <Stack spacing={1.5}>
                {pendingRequests.map((req) => {
                  const handle = req.username?.replace(/^@/, "") ?? null;
                  const requestDate = new Date(req.created_at);
                  const timeAgo = (() => {
                    const diffMs = Date.now() - requestDate.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    if (diffMins < 1) return "just now";
                    if (diffMins < 60) return `${diffMins}m ago`;
                    const diffHrs = Math.floor(diffMins / 60);
                    if (diffHrs < 24) return `${diffHrs}h ago`;
                    const diffDays = Math.floor(diffHrs / 24);
                    if (diffDays < 7) return `${diffDays}d ago`;
                    return requestDate.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  })();
                  return (
                    <AppCard key={req.id}>
                      <Stack spacing={1.5}>
                        <Stack direction="row" alignItems="center" spacing={2}>
                          <Avatar
                            src={req.avatar_url ? `${getAvatarBaseUrl()}${req.avatar_url}` : undefined}
                            sx={{ width: 40, height: 40, bgcolor: "grey.300", fontSize: "0.9rem" }}
                          >
                            {(req.name || req.username || "?").charAt(0).toUpperCase()}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>{req.name || req.username || "Unknown"}</Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                              {handle && <Typography variant="caption" color="text.secondary">@{handle}</Typography>}
                              {handle && <Typography variant="caption" color="text.disabled">·</Typography>}
                              <Typography variant="caption" color="text.disabled">{timeAgo}</Typography>
                            </Stack>
                          </Box>
                          <Stack direction="row" spacing={0.75}>
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              onClick={() => handleJoinRequestAction(req.id, "approve")}
                              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, minWidth: 80, boxShadow: "none", "&:hover": { boxShadow: "none" } }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleJoinRequestAction(req.id, "decline")}
                              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, minWidth: 80 }}
                            >
                              Decline
                            </Button>
                          </Stack>
                        </Stack>
                        {req.message && (
                          <Box sx={{ ml: 7, pl: 1.5, borderLeft: "2px solid", borderColor: "divider" }}>
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", lineHeight: 1.5 }}>
                              &ldquo;{req.message}&rdquo;
                            </Typography>
                          </Box>
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

type PendingRequestStatusBlockProps = {
  /** Pre-formatted "Sent N days ago" label from the server. Null when we
   *  don't have a createdAt (shouldn't happen in practice given this
   *  component only renders when viewerPendingRequest is true). */
  sentLabel: string | null;
  refreshable: boolean;
  /** Whole days remaining before the viewer may re-submit. Null when the
   *  request is already refreshable or when the data is missing. */
  daysUntilRefreshable: number | null;
  joinRequestMessage: string;
  onChangeMessage: (value: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
};

/** Replaces the previous "Request pending" mini-chip with a status card that
 *  actually explains what is happening, that the owner will be emailed, and
 *  (once the cooldown is up) lets the requester re-submit without having to
 *  contact someone out of band. All time math is done server-side and
 *  passed in as pre-formatted strings / numbers so the component stays
 *  pure and doesn't depend on the client clock. */
function PendingRequestStatusBlock({
  sentLabel,
  refreshable,
  daysUntilRefreshable,
  joinRequestMessage,
  onChangeMessage,
  onRefresh,
  refreshing,
}: PendingRequestStatusBlockProps) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "warning.light",
        bgcolor: "rgba(255, 167, 38, 0.08)",
      }}
    >
      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 1 }}>
        <HourglassEmptyRoundedIcon sx={{ color: "warning.main", mt: "2px" }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            Your request is awaiting review
          </Typography>
          {sentLabel && (
            <Typography variant="caption" color="text.secondary">
              {sentLabel}
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ pl: { xs: 0, sm: 4.5 }, mb: refreshable ? 2 : 1 }}>
        <MailOutlineRoundedIcon sx={{ fontSize: 16, color: "text.secondary", mt: "3px" }} />
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          The community owner will review your request. You&rsquo;ll receive an email when it&rsquo;s
          approved or declined.
        </Typography>
      </Stack>

      {refreshable ? (
        <Stack spacing={1.5} sx={{ pl: { xs: 0, sm: 4.5 } }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Still waiting? You can send another request to nudge the owner.
          </Typography>
          <TextField
            value={joinRequestMessage}
            onChange={(e) => onChangeMessage(e.target.value.slice(0, 500))}
            placeholder="Add a note to the community owner (optional)"
            multiline
            maxRows={3}
            size="small"
            fullWidth
            variant="outlined"
            inputProps={{ maxLength: 500 }}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, bgcolor: "background.paper" } }}
          />
          <Box>
            <Button
              variant="outlined"
              startIcon={refreshing ? undefined : <RefreshRoundedIcon sx={{ fontSize: 18 }} />}
              onClick={onRefresh}
              disabled={refreshing}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
            >
              {refreshing ? <CircularProgress size={16} color="inherit" /> : "Send another request"}
            </Button>
          </Box>
        </Stack>
      ) : daysUntilRefreshable !== null ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", pl: { xs: 0, sm: 4.5 }, fontStyle: "italic" }}
        >
          Still no response? You&rsquo;ll be able to send another request in{" "}
          {daysUntilRefreshable} {daysUntilRefreshable === 1 ? "day" : "days"}.
        </Typography>
      ) : null}
    </Box>
  );
}

/** Deliberately avoids raw counts so a quiet community doesn't feel empty
 *  to a prospective member. */
function MemberBenefitRow({
  icon,
  title,
  subtitle,
  tone = "primary",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  tone?: "primary" | "success" | "warning";
}) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ py: 0.25 }}>
      <Box
        sx={{
          width: 28, height: 28, borderRadius: 1.5,
          bgcolor: `${tone}.light`,
          color: `${tone}.main`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, mt: "2px",
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
          {subtitle}
        </Typography>
      </Box>
    </Stack>
  );
}
