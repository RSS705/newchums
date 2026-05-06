"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Box, Typography, Stack, Button, Chip, Avatar, AvatarGroup, CircularProgress,
  Divider, IconButton, Tooltip, Tab, Tabs, Grid, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem, ListItemIcon, ListItemText,
} from "@mui/material";
import ArchiveRoundedIcon from "@mui/icons-material/ArchiveRounded";
import AssignmentIndRoundedIcon from "@mui/icons-material/AssignmentIndRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
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
import RecentlyHappenedSection from "@/components/events/RecentlyHappenedSection";
import { apiFetch, communityAvatarUrl, communityBannerUrl, getAuthToken, getAvatarBaseUrl } from "@/lib/apiClient";
import { effectiveCategorySet } from "@/lib/interestUtils";
import {
  CommunityAnnouncementsTab,
  OperatingHoursInline,
  type CommunityAnnouncement,
  type OperatingHours,
} from "@/components/communities";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";

type CommunityData = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
  chat_enabled: boolean;
  is_online: boolean;
  /** Omitted from the response for non-members of private communities. */
  website?: string | null;
  /** Omitted from the response for non-members of private communities. */
  discord_url?: string | null;
  location_name: string | null;
  location_address: string | null;
  location_lat: number | null;
  location_lng: number | null;
  avatar_key: string | null;
  /** Wide hero image, available on every plan. May appear on every detail
   *  surface (public, restricted, logged-in) when set. */
  banner_key: string | null;
  /** Day-by-day open/close times, free for all communities. Omitted from
   *  the restricted (private non-member) response so private operational
   *  details don't leak publicly. */
  operating_hours?: OperatingHours | null;
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
  status?: string;
  removed_at?: string | null;
  removal_reason?: string | null;
};

type ApiEvent = Record<string, unknown>;

type LocalSignal = { hobbyName: string; count: number };

// Collapses the community description to 3 lines with a Show more/less
// toggle. Only surfaces the toggle when the text actually overflows the
// clamp, so short descriptions render unchanged. We observe size changes so
// images loading in or the column reflowing doesn't strand us in a stale
// overflow verdict.
function ExpandableDescription({ html, sx }: { html: string; sx?: object }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (expanded) return;
      setOverflows(el.scrollHeight - el.clientHeight > 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [html, expanded]);

  return (
    <Box sx={sx}>
      <Typography
        ref={ref}
        component="div"
        variant="body1"
        color="text.secondary"
        sx={{
          lineHeight: 1.6,
          "& p": { m: 0 },
          "& a": { color: "primary.main" },
          ...(expanded
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }),
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows && (
        <Typography
          component="button"
          type="button"
          variant="body2"
          onClick={() => setExpanded((v) => !v)}
          sx={{
            mt: 0.5,
            p: 0,
            border: 0,
            bgcolor: "transparent",
            cursor: "pointer",
            color: "primary.main",
            fontSize: "0.8125rem",
            fontWeight: 600,
            "&:hover": { textDecoration: "underline" },
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </Typography>
      )}
    </Box>
  );
}

type JoinRequest = {
  id: string;
  user_id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
  message: string | null;
  created_at: string;
  reviewed_at?: string | null;
};

type CommunityDetailClientProps = {
  /** Server-resolved auth state. When `false`, the client skips the
   *  initial `getAuthToken()` call (which would 401 for logged-out
   *  viewers) and goes straight into the unauthenticated fetch path,
   *  keeping the canonical public community URL quiet in the console. */
  isAuthenticatedFromServer?: boolean;
};

export default function CommunityDetailClient({
  isAuthenticatedFromServer,
}: CommunityDetailClientProps = {}) {
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
  const [viewerRemoved, setViewerRemoved] = useState(false);
  const [viewerRemovedReason, setViewerRemovedReason] = useState<string | null>(null);
  const [viewerDeclinedDaysUntilRetriable, setViewerDeclinedDaysUntilRetriable] = useState<number | null>(null);
  const viewerDeclinedRetriable = viewerDeclinedRequest && viewerDeclinedDaysUntilRetriable === null;
  const [restricted, setRestricted] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [declinedRequests, setDeclinedRequests] = useState<JoinRequest[]>([]);
  const [undoDeclineTarget, setUndoDeclineTarget] = useState<JoinRequest | null>(null);
  const [undoDeclineSubmitting, setUndoDeclineSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  // Announcements tab indicator. Server returns this on `GET /communities/:slug`
  // for authenticated viewers (logged-out viewers always see false). The badge
  // is on the tab strip; the tab body owns the mark-seen call and pings back
  // through `onListChanged` so this flag clears without a full refresh.
  const [hasUnseenAnnouncements, setHasUnseenAnnouncements] = useState(false);
  // Prefetch announcements alongside plans and members so clicking the
  // Announcements tab paints with cards on first frame instead of a brief
  // spinner. The tab body uses these as initial seed data and skips its
  // own first fetch when seeded.
  const [announcementsSeed, setAnnouncementsSeed] = useState<CommunityAnnouncement[] | null>(null);
  const [announcementsCanManageSeed, setAnnouncementsCanManageSeed] = useState(false);

  const [events, setEvents] = useState<PlanEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  // True once the plans fetch has resolved at least once. Gates the empty
  // state so it cannot paint during the one-render gap between the tab
  // mounting and the useEffect kicking off the fetch.
  const [eventsFetched, setEventsFetched] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [removedMembers, setRemovedMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersFetched, setMembersFetched] = useState(false);
  // Confirmation dialog state for member removal.
  const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);
  const [removeMemberReason, setRemoveMemberReason] = useState("");
  const [removeMemberSubmitting, setRemoveMemberSubmitting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Leave action is tucked into a member-actions overflow menu rather than
  // sitting in the primary button row, and gated behind a confirmation
  // dialog so it can't be triggered by an accidental click.
  const [memberActionsAnchor, setMemberActionsAnchor] = useState<HTMLElement | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [joinRequestMessage, setJoinRequestMessage] = useState("");
  const [isClosed, setIsClosed] = useState(false);
  const [viewerHobbyItems, setViewerHobbyItems] = useState<{ slug: string; name: string; category?: string | null }[]>([]);
  // null until the first auth probe resolves, then true/false. The slug URL
  // is the canonical public / shareable destination for a community, so
  // logged-out viewers are expected, we branch on this flag to render a
  // sign-in CTA instead of member-only actions (join/leave/start plan/edit).
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [localSignal, setLocalSignal] = useState<LocalSignal | null>(null);

  const mapApiEvent = useCallback((ev: ApiEvent): PlanEvent => {
    const hostUsername = (ev.hostUsername as string)?.replace(/^@/, "");
    const hostName = hostUsername ? `@${hostUsername}` : ((ev.hostName as string) || "Someone");
    const hobbiesRaw = ev.hobbies;
    const hobbies: Array<{ name: string; slug: string }> = typeof hobbiesRaw === "string"
      ? JSON.parse(hobbiesRaw)
      : Array.isArray(hobbiesRaw) ? hobbiesRaw : [];
    const locationType = String(ev.locationType ?? "in_person");
    // Prefer the server-provided `locationDisplay`. The community plan feed
    // computes a privacy-safe display string (approximate area for
    // unauthenticated viewers, "Online" for online plans) so the same card
    // never reveals an exact address to a logged-out visitor regardless of
    // what local fallbacks would do.
    const locationDisplay = (ev.locationDisplay as string | undefined)
      ?? (locationType === "online"
        ? ((ev.onlineLink as string) || "Online")
        : ((ev.locationName as string) || (ev.locationAddress as string) || (ev.locationArea as string) || "TBD"));
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
      communities: (ev.communities as Array<{ id: string; slug: string; name: string }>) ?? [],
      hasPrefMismatch: ev.hasPrefMismatch === true,
      isQa: ev.isQa === true,
    };
  }, []);

  const fetchCommunity = useCallback(async () => {
    try {
      // Resolve auth state once up front so every follow-up fetch (plans,
      // members, profile) can skip the token probe when logged out. The
      // server already told us whether there's a session (via the
      // `isAuthenticatedFromServer` prop), so a definitively-logged-out
      // viewer skips `getAuthToken()` entirely. Without that short-circuit,
      // the canonical public community URL fires a 401 against
      // `/api/auth/api-token` and pollutes the browser console. For
      // logged-in viewers we still resolve a fresh token here so the
      // Bearer header is current and reused by follow-up calls.
      let useAuth = false;
      if (isAuthenticatedFromServer !== false) {
        const token = await getAuthToken();
        useAuth = !!token;
      }
      setIsAuthenticated(useAuth);
      const res = await apiFetch(`/communities/${slug}`, { auth: useAuth });
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
          setViewerRemoved(data.viewerRemoved === true);
          setViewerRemovedReason(typeof data.viewerRemovedReason === "string" ? data.viewerRemovedReason : null);
          setViewerDeclinedDaysUntilRetriable(
            typeof data.viewerDeclinedDaysUntilRetriable === "number"
              ? data.viewerDeclinedDaysUntilRetriable
              : null
          );
          setRestricted(data.restricted ?? false);
          setPendingRequests(data.pendingRequests ?? []);
          setDeclinedRequests(Array.isArray(data.declinedRequests) ? data.declinedRequests : []);
          setHasUnseenAnnouncements(data.hasUnseenAnnouncements === true);
        }
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [slug, isAuthenticatedFromServer]);

  // Clear the announcements badge in-memory after the tab successfully
  // stamps the viewer's `last_seen_at`. Local-only, no API round trip,
  // since the tab body is the source of truth for "I just opened this
  // tab". A subsequent full slug refetch will reconfirm via
  // `hasUnseenAnnouncements` if the user navigates away and back.
  const clearUnseenAnnouncementsBadge = useCallback(() => {
    setHasUnseenAnnouncements(false);
  }, []);

  // Stable callback so the announcements tab's internal `fetchList`, which
  // lists this in its deps, keeps a stable identity across parent renders.
  // An inline arrow here would recreate on every render, refire the tab's
  // mount-effect, and cause a refetch loop. Pulling it into useCallback
  // keeps the child's hook deps quiet and avoids the kind of churn that
  // occasionally surfaces as a "more hooks than during the previous
  // render" error under Next.js Fast Refresh.
  const handleAnnouncementsListSynced = useCallback(
    (items: CommunityAnnouncement[], canManage: boolean) => {
      setAnnouncementsSeed(items);
      setAnnouncementsCanManageSeed(canManage);
    },
    [],
  );

  const fetchEvents = useCallback(async () => {
    if (!community) return;
    setEventsLoading(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/events`, { auth: isAuthenticated === true });
      const data = await res.json();
      if (data.ok) setEvents((data.events as ApiEvent[]).map(mapApiEvent));
    } catch { /* noop */ }
    setEventsLoading(false);
    setEventsFetched(true);
  }, [community, isAuthenticated, mapApiEvent]);

  const fetchMembers = useCallback(async () => {
    if (!community) return;
    setMembersLoading(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/members`, { auth: isAuthenticated === true });
      const data = await res.json();
      if (data.ok) {
        setMembers(data.members);
        setRemovedMembers(Array.isArray(data.removedMembers) ? data.removedMembers : []);
      }
    } catch { /* noop */ }
    setMembersLoading(false);
    setMembersFetched(true);
  }, [community, isAuthenticated]);

  // Prefetch the announcements list once the community resolves, so the
  // first click on the Announcements tab paints with real cards rather
  // than a spinner. A 403 response (logged-out viewer on a private
  // community whose tab won't render anyway) is silently swallowed; the
  // tab body falls back to its own fetch in that edge case. Mutations
  // performed inside the tab also notify back via `onListSynced` so this
  // cache stays warm if the user closes and re-opens the tab.
  const fetchAnnouncementsSeed = useCallback(async () => {
    if (!community) return;
    try {
      const res = await apiFetch(`/communities/${community.id}/announcements`, {
        auth: isAuthenticated === true,
      });
      if (!res.ok) {
        setAnnouncementsSeed([]);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        announcements?: CommunityAnnouncement[];
        viewerCanManage?: boolean;
      };
      if (data.ok) {
        setAnnouncementsSeed(Array.isArray(data.announcements) ? data.announcements : []);
        setAnnouncementsCanManageSeed(data.viewerCanManage === true);
      }
    } catch { /* non-fatal; the tab body will retry on its own */ }
  }, [community, isAuthenticated]);

  // fetchCommunity flips loading=true synchronously; legitimate fetch-on-
  // mount pattern. Same suppression style used elsewhere in this file for
  // the plans/members and view-tracker effects.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  useEffect(() => {
    // /profile is authed-only; the hobby chip match highlight is a logged-in
    // affordance, so skip the call entirely when signed out.
    if (isAuthenticated !== true) return;
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (res.ok) {
          const d = await res.json();
          setViewerHobbyItems(d.profile?.interest_items ?? []);
        }
      } catch { /* noop */ }
    })();
  }, [isAuthenticated]);

  const viewerHobbyCategories = useMemo(() => {
    if (!viewerHobbyItems.length) return undefined;
    return effectiveCategorySet(viewerHobbyItems);
  }, [viewerHobbyItems]);

  // Mirror the explore feed's local-interest signal so the community detail
  // ends with the same "N active people near you are into X" line. Kept
  // community-agnostic: we pass no hobby filter, so the backend picks based
  // on the viewer's own hobbies (same as the unfiltered explore feed).
  useEffect(() => {
    if (isAuthenticated !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/explore/local-signal", { auth: true });
        if (cancelled) return;
        const data = (await res.json()) as { ok: boolean; signal: LocalSignal | null };
        if (data.ok) setLocalSignal(data.signal);
      } catch { /* degrade silently */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!community || restricted) return;
    // Plans and members are both needed up-front, plans for the default tab,
    // members for the inline public member preview above the tabs. Fetching
    // both on mount means tab switches feel instant and the page renders a
    // lived-in snapshot immediately instead of waiting for a tab click.
    // Both fetchers flip loading=true synchronously; legitimate fetch-on-
    // ready pattern.
    /* eslint-disable react-hooks/set-state-in-effect */
    fetchEvents();
    fetchMembers();
    fetchAnnouncementsSeed();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [community, restricted, fetchEvents, fetchMembers, fetchAnnouncementsSeed]);

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
    // Tab order: 0 plans, 1 announcements, 2 members, 3 requests (owner+private only).
    if (initialTabParam === "requests" && viewerIsOwner && community.visibility === "private") {
      setTabIndex(3);
    } else if (initialTabParam === "members") {
      setTabIndex(2);
    } else if (initialTabParam === "announcements") {
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
        } else if (data.status === "removed") {
          toast.info("You've been removed from this community and can't rejoin.");
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
      if (data.ok) {
        setLeaveConfirmOpen(false);
        toast.success("You've left the community");
        fetchCommunity();
      } else {
        toast.error(data.message || "Cannot leave");
      }
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
        // Decline: refetch the community so the "Previously denied" section
        // picks up the new row without requiring a manual refresh.
        if (action === "decline") fetchCommunity();
      }
    } catch { toast.error("Something went wrong"); }
  };

  const handleShare = async () => {
    // The slug URL is the canonical public / shareable destination for a
    // community. Any viewer (logged in or not) can open it and see either
    // the full detail page (public) or a restricted preview (private), so
    // the raw URL is all we need, no share_token appended.
    const url = `${window.location.origin}/communities/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleConfirmRemoveMember = async () => {
    if (!community || !removeMemberTarget) return;
    setRemoveMemberSubmitting(true);
    try {
      const reason = removeMemberReason.trim();
      const res = await apiFetch(`/communities/${community.id}/members/${removeMemberTarget.user_id}/remove`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason.length > 0 ? { reason } : {}),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Member removed");
        setRemoveMemberTarget(null);
        setRemoveMemberReason("");
        fetchMembers();
        fetchCommunity();
      } else {
        toast.error("Could not remove member");
      }
    } catch { toast.error("Something went wrong"); }
    setRemoveMemberSubmitting(false);
  };

  const [unblockMemberTarget, setUnblockMemberTarget] = useState<Member | null>(null);
  const [unblockSubmitting, setUnblockSubmitting] = useState(false);
  const handleConfirmUnblockMember = async () => {
    if (!community || !unblockMemberTarget) return;
    setUnblockSubmitting(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/members/${unblockMemberTarget.user_id}/unblock`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success("Member unblocked");
        setUnblockMemberTarget(null);
        fetchMembers();
        fetchCommunity();
      } else {
        toast.error("Could not unblock member");
      }
    } catch { toast.error("Something went wrong"); }
    setUnblockSubmitting(false);
  };

  const handleConfirmUndoDecline = async () => {
    if (!community || !undoDeclineTarget) return;
    setUndoDeclineSubmitting(true);
    try {
      const res = await apiFetch(`/communities/${community.id}/join-requests/${undoDeclineTarget.id}/undo-decline`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast.success("Denial undone. The user can request to join again.");
        setUndoDeclineTarget(null);
        setDeclinedRequests((prev) => prev.filter((r) => r.id !== undoDeclineTarget.id));
      } else {
        toast.error("Could not undo the denial");
      }
    } catch { toast.error("Something went wrong"); }
    setUndoDeclineSubmitting(false);
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
    // Deliberate end-state for a community whose owner soft-closed it.
    // Composed as a full-page empty state rather than a floating card so
    // it reads as "this is the page" instead of "this is a modal on top
    // of the page." Server response is intentionally minimal
    // (id/slug/name/status only, see GET /communities/:slug) so no plan,
    // member, hobby, or link data is reachable here. Typography rhythm,
    // icon-badge treatment, and motion follow docs/UI_Patterns.md.
    return (
      <Box
        sx={{
          maxWidth: 560,
          mx: "auto",
          px: { xs: 2, sm: 3 },
          py: { xs: 5, sm: 9 },
          textAlign: "center",
        }}
      >
        <Stack spacing={3} alignItems="center">
          <Box
            sx={{
              width: { xs: 84, sm: 96 },
              height: { xs: 84, sm: 96 },
              borderRadius: "50%",
              bgcolor: "action.hover",
              color: "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow:
                "0 2px 10px rgba(0,0,0,0.04), inset 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          >
            <ArchiveRoundedIcon sx={{ fontSize: { xs: 38, sm: 44 } }} />
          </Box>

          <Chip
            label="No longer active"
            size="small"
            sx={{
              height: 22,
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              bgcolor: "action.hover",
              color: "text.secondary",
              borderRadius: 1.5,
            }}
          />

          <Stack spacing={1.25} alignItems="center" sx={{ width: "100%" }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.5rem", sm: "1.875rem" },
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                wordBreak: "break-word",
                maxWidth: 480,
              }}
            >
              {community.name}
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ lineHeight: 1.6, maxWidth: 420, fontSize: { xs: "0.9375rem", sm: "1rem" } }}
            >
              The owner closed this community. Its plans and members are no longer available.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.25}
            sx={{ pt: 1, width: { xs: "100%", sm: "auto" } }}
          >
            <Button
              component={Link}
              href="/communities"
              variant="contained"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2.5,
                px: 3,
                py: 1,
                boxShadow: "none",
                transition: "opacity 140ms ease, transform 140ms ease",
                "&:hover": {
                  boxShadow: "none",
                  opacity: 0.94,
                  transform: "translateY(-1px)",
                },
              }}
            >
              Browse communities
            </Button>
            <Button
              component={Link}
              href="/"
              variant="text"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2.5,
                px: 2,
                color: "text.secondary",
                transition: "color 140ms ease, background-color 140ms ease",
                "&:hover": { color: "text.primary", bgcolor: "action.hover" },
              }}
            >
              Back home
            </Button>
          </Stack>
        </Stack>
      </Box>
    );
  }

  const isOwner = viewerMembership?.role === "owner";
  const isMember = !!viewerMembership;

  if (restricted) {
    return (
      <Stack spacing={{ xs: 2, sm: 3 }}>
        {/* Banner hero renders on the restricted landing too; it's visual
            only and never carries plan/member info, so it respects the
            privacy contract. Omitted when no banner is set. */}
        {community.banner_key && (
          <CommunityBannerHero
            communityId={community.id}
            name={community.name}
            bannerKey={community.banner_key}
          />
        )}

        {/* Preview header. Same CSS-grid structure as the full detail
         *  header so the mobile layout (body spans full width below the
         *  avatar + title row) stays consistent across both views. The
         *  warm-wash + primary.light border treatment matches the full
         *  detail view's no-banner header so the page feels like the same
         *  product whether the viewer is approved or still locked out. */}
        <AppCard
          sx={community.banner_key ? undefined : {
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
            border: "1px solid",
            borderColor: "primary.light",
            boxShadow: "none",
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gridTemplateAreas: {
                xs: '"avatar title" "body body"',
                sm: '"avatar title" "avatar body"',
              },
              columnGap: { xs: 1.75, sm: 2.5 },
              rowGap: { xs: 1.75, sm: 1 },
            }}
          >
            <Avatar
              variant="rounded"
              src={communityAvatarUrl(community.id, community.avatar_key) ?? undefined}
              sx={{
                gridArea: "avatar",
                alignSelf: "flex-start",
                width: { xs: 60, sm: 72 }, height: { xs: 60, sm: 72 },
                borderRadius: 2.5,
                bgcolor: community.avatar_key ? "grey.100" : "primary.main",
                color: "primary.contrastText",
                fontWeight: 700, fontSize: { xs: "1.5rem", sm: "1.75rem" },
                flexShrink: 0,
                border: "3px solid #fff",
                boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
              }}
            >
              {community.name.charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ gridArea: "title", minWidth: 0, alignSelf: "flex-start" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
                <Typography
                  component="h1"
                  sx={{
                    fontSize: { xs: "1.625rem", sm: "2.125rem" },
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: "-0.025em",
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {community.name}
                </Typography>
                <Chip
                  icon={<LockRoundedIcon sx={{ fontSize: "13px !important" }} />}
                  label="Private"
                  size="small"
                  variant="outlined"
                  sx={{ flexShrink: 0, height: 22, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1.5, borderColor: "divider", color: "text.secondary" }}
                />
              </Stack>

              {/* "Run by" owner identity row. Same trust signal as the full
                  detail header; suppressed when owner data is missing. */}
              {community.owner_username && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.875}
                  sx={{ mb: 1 }}
                >
                  <Avatar
                    src={community.owner_avatar_url ? `${getAvatarBaseUrl()}${community.owner_avatar_url}` : undefined}
                    sx={{ width: 22, height: 22, fontSize: "0.6875rem", bgcolor: "grey.300" }}
                  >
                    {(community.owner_name || community.owner_username || "?").charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.8125rem", lineHeight: 1.4 }}
                  >
                    Run by{" "}
                    <Typography
                      component={Link}
                      href={`/u/${community.owner_username.replace(/^@/, "")}`}
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        fontSize: "0.8125rem",
                        fontWeight: 600,
                        color: "primary.dark",
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      @{community.owner_username.replace(/^@/, "")}
                    </Typography>
                  </Typography>
                </Stack>
              )}

              {/* Hobby chips */}
              {community.hobbies && community.hobbies.length > 0 && (
                <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
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
                          ...(isMatch ? { bgcolor: "primary.light", color: "primary.dark" } : { borderColor: "divider", color: "text.secondary", bgcolor: "background.paper" }),
                        }}
                      />
                    );
                  })}
                </Stack>
              )}
            </Box>
            <Box sx={{ gridArea: "body", minWidth: 0 }}>
              {community.description && (
                <ExpandableDescription html={community.description} sx={{ mb: 1.5 }} />
              )}

              {/* Meta stack: members (always visible, hint of life on a
                  locked card), location/online on its own line, external
                  links below. website and discord_url are omitted by the
                  API for non-members of private communities, so those
                  conditional checks act as the privacy gate. */}
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <PeopleRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {community.member_count} {community.member_count === 1 ? "member" : "members"}
                    {(community.upcoming_plan_count ?? 0) > 0 && (
                      <>
                        {" "}<Box component="span" sx={{ color: "text.disabled" }}>·</Box>{" "}
                        {community.upcoming_plan_count} upcoming {community.upcoming_plan_count === 1 ? "plan" : "plans"}
                      </>
                    )}
                  </Typography>
                </Stack>
                {community.is_online ? (
                  <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
                    <LanguageRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>Online</Typography>
                  </Stack>
                ) : community.location_name ? (
                  <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
                    <PlaceRoundedIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      {community.location_name}
                    </Typography>
                  </Stack>
                ) : null}
                  {(community.website || community.discord_url) && (
                    // Website + Discord share a row so two short labels don't
                    // consume two whole meta lines. Matches the pattern used
                    // in the full detail header.
                    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
                            color: "primary.main",
                            textDecoration: "none",
                            "&:hover .visit-label": { textDecoration: "underline" },
                          }}
                        >
                          <LinkRoundedIcon sx={{ fontSize: 14 }} />
                          <Typography className="visit-label" component="span" variant="body2" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                            Visit website
                          </Typography>
                        </Stack>
                      )}
                      {community.discord_url && (
                        <Stack
                          component="a"
                          href={community.discord_url.startsWith("http") ? community.discord_url : `https://${community.discord_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          direction="row"
                          spacing={0.5}
                          alignItems="center"
                          onClick={(e) => e.stopPropagation()}
                          sx={{
                            color: "primary.main",
                            textDecoration: "none",
                            "&:hover .discord-label": { textDecoration: "underline" },
                          }}
                        >
                          <LinkRoundedIcon sx={{ fontSize: 14 }} />
                          <Typography className="discord-label" component="span" variant="body2" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                            Discord Server
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  )}
                </Stack>
            </Box>
          </Box>
        </AppCard>

        {/* Non-numeric preview so a low member/plan count doesn't deflate the
            page. Suppressed for removed viewers, they're not being asked to
            join, so "what's inside" reads as rubbing it in. */}
        {!viewerRemoved && (
          <AppCard
            sx={{
              border: "1px solid",
              borderColor: "grey.200",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <Stack spacing={2.5}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box
                  sx={{
                    width: 44, height: 44, borderRadius: 2,
                    bgcolor: "primary.light",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <LockRoundedIcon sx={{ fontSize: 22, color: "primary.main" }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: "1.0625rem" }}>
                    Inside this community
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
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
        )}

        {isAuthenticated === false ? (
          <SignInToJoinCard slug={slug} variant="request" />
        ) : viewerRemoved ? (
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
                  You&rsquo;ve been removed from this community
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  You can&rsquo;t rejoin.
                </Typography>
                {viewerRemovedReason && (
                  <Box sx={{ mt: 1.25, pl: 1.25, borderLeft: "2px solid", borderColor: "divider" }}>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.25, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, fontSize: "0.6875rem" }}
                    >
                      Reason from the community owner
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", lineHeight: 1.55, fontStyle: "italic" }}
                    >
                      &ldquo;{viewerRemovedReason}&rdquo;
                    </Typography>
                  </Box>
                )}
              </Box>
            </Stack>
          </Box>
        ) : viewerPendingRequest ? (
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
    <Stack spacing={{ xs: 2, sm: 3 }}>
      {/* Community Pro banner hero. Renders above the header card on the
          full detail view; hidden when no banner is set so non-Pro
          communities keep their existing look. */}
      {community.banner_key && (
        <CommunityBannerHero
          communityId={community.id}
          name={community.name}
          bannerKey={community.banner_key}
        />
      )}

      {/* Header card.
       *
       *  Layout is a 2-column CSS grid:
       *    - Desktop (sm+): avatar in column 1 (spanning both rows), title +
       *      chips in column 2 row 1, description + meta stack in column 2
       *      row 2. Matches the prior flex layout visually.
       *    - Mobile (xs): avatar in column 1 row 1, title + chips in column 2
       *      row 1, but the body row spans both columns so the description
       *      and meta rows use the full card width instead of being pinned
       *      to the right of a 48px avatar column on narrow screens.
       *
       *  When no banner is set above, the card gets a soft warm-wash
       *  background + primary.light border so the page has a clear hero
       *  moment instead of opening on a flat white card. When a banner IS
       *  set, the card stays neutral so the banner above carries the
       *  hero moment by itself.
       */}
      <AppCard
        sx={community.banner_key ? undefined : {
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          border: "1px solid",
          borderColor: "primary.light",
          boxShadow: "none",
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gridTemplateAreas: '"avatar title" "body body"',
            columnGap: { xs: 1.75, sm: 2.5 },
            rowGap: { xs: 1.75, sm: 2 },
          }}
        >
          <Avatar
            variant="rounded"
            src={communityAvatarUrl(community.id, community.avatar_key) ?? undefined}
            sx={{
              gridArea: "avatar",
              alignSelf: "flex-start",
              width: { xs: 60, sm: 72 }, height: { xs: 60, sm: 72 },
              borderRadius: 2.5,
              bgcolor: community.avatar_key ? "grey.100" : "primary.main",
              color: "primary.contrastText",
              fontWeight: 700, fontSize: { xs: "1.5rem", sm: "1.75rem" },
              flexShrink: 0,
              border: "3px solid #fff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            }}
          >
            {community.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ gridArea: "title", minWidth: 0, alignSelf: "flex-start" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: "1.625rem", sm: "2.125rem" },
                  fontWeight: 700,
                  lineHeight: 1.15,
                  letterSpacing: "-0.025em",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {community.name}
              </Typography>
              {community.visibility === "private" && (
                <Chip
                  icon={<LockRoundedIcon sx={{ fontSize: "13px !important" }} />}
                  label="Private"
                  size="small"
                  variant="outlined"
                  sx={{ flexShrink: 0, height: 22, fontSize: "0.6875rem", fontWeight: 500, borderRadius: 1.5, borderColor: "divider", color: "text.secondary" }}
                />
              )}
            </Stack>
            {/* "Run by" owner identity row. Surfaces the community lead at
                the top of the page so the community feels lived in, not a
                disembodied page. Tap-target leads to the public profile
                when a handle is available. Suppressed when owner data is
                missing or the viewer is themselves the owner (the Owner
                state is communicated by the action row instead). */}
            {community.owner_username && !isOwner && (
              <Stack
                direction="row"
                alignItems="center"
                spacing={0.875}
                sx={{ mb: 1 }}
              >
                <Avatar
                  src={community.owner_avatar_url ? `${getAvatarBaseUrl()}${community.owner_avatar_url}` : undefined}
                  sx={{ width: 22, height: 22, fontSize: "0.6875rem", bgcolor: "grey.300" }}
                >
                  {(community.owner_name || community.owner_username || "?").charAt(0).toUpperCase()}
                </Avatar>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: "0.8125rem", lineHeight: 1.4 }}
                >
                  Run by{" "}
                  <Typography
                    component={Link}
                    href={`/u/${community.owner_username.replace(/^@/, "")}`}
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "primary.dark",
                      textDecoration: "none",
                      "&:hover": { textDecoration: "underline" },
                    }}
                  >
                    @{community.owner_username.replace(/^@/, "")}
                  </Typography>
                </Typography>
              </Stack>
            )}
            {/* Hobby chips */}
            {community.hobbies && community.hobbies.length > 0 && (
              <Stack direction="row" gap={0.5} flexWrap="wrap" useFlexGap>
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
                          : { borderColor: "divider", color: "text.secondary", bgcolor: "background.paper" }),
                      }}
                    />
                  );
                })}
              </Stack>
            )}
          </Box>
          <Box sx={{ gridArea: "body", minWidth: 0 }}>
            {community.description && (
              <ExpandableDescription html={community.description} sx={{ mb: 1 }} />
            )}
            {/* Meta stack: info row (member count + online/location) on top,
                actionable links (website / join link) on their own lines below
                so a long address doesn't push them off to the right. */}
            <Stack spacing={0.5}>
              {/* Member count + online/location. Horizontal on desktop with
                  a middot separator; on mobile we switch to a column so a
                  long address can't wrap and leave a dangling separator at
                  the end of the member-count line. */}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 0.5, sm: 1 }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                flexWrap="wrap"
                useFlexGap
              >
                <Stack direction="row" spacing={0.5} alignItems="center">
                  <PeopleRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                    {community.member_count} {community.member_count === 1 ? "member" : "members"}
                  </Typography>
                </Stack>
                {community.is_online ? (
                  // useFlexGap uses CSS `gap` instead of sibling-margin for
                  // spacing, which is the only way a `display: none` dot on
                  // xs doesn't leave a ghost 4px margin in front of the icon
                  // and offset it relative to the members icon above.
                  <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
                    <Typography variant="body2" color="text.disabled" sx={{ display: { xs: "none", sm: "inline" } }}>·</Typography>
                    <LanguageRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      Online
                    </Typography>
                  </Stack>
                ) : community.location_name ? (
                  <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
                    <Typography variant="body2" color="text.disabled" sx={{ display: { xs: "none", sm: "inline" } }}>·</Typography>
                    <PlaceRoundedIcon sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                      {community.location_name}
                    </Typography>
                  </Stack>
                ) : null}
              </Stack>
              {/* Operating hours: one small meta row with a popover for the
                  full schedule. Keeps hours discoverable without letting
                  them push plans below the fold. Renders nothing when no
                  hours are set, and is unreachable on restricted private-
                  community responses (API omits `operating_hours`). */}
              <OperatingHoursInline hours={community.operating_hours} />
              {(community.website || community.discord_url) && (
                // Website + Discord on a shared row so two short link labels
                // don't waste a whole meta line each. flexWrap + useFlexGap
                // keeps them gracefully stacking when the labels or viewport
                // don't allow both inline.
                <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
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
                        color: "primary.main",
                        textDecoration: "none",
                        "&:hover .visit-label": { textDecoration: "underline" },
                      }}
                    >
                      <LinkRoundedIcon sx={{ fontSize: 14 }} />
                      <Typography className="visit-label" component="span" variant="body2" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        Visit website
                      </Typography>
                    </Stack>
                  )}
                  {community.discord_url && (
                    <Stack
                      component="a"
                      href={community.discord_url.startsWith("http") ? community.discord_url : `https://${community.discord_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        color: "primary.main",
                        textDecoration: "none",
                        "&:hover .discord-label": { textDecoration: "underline" },
                      }}
                    >
                      <LinkRoundedIcon sx={{ fontSize: 14 }} />
                      <Typography className="discord-label" component="span" variant="body2" sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
                        Discord Server
                      </Typography>
                    </Stack>
                  )}
                </Stack>
              )}
              {/* Inline member preview: folded into the meta stack instead
                  of living as its own AppCard above the tabs, keeps the
                  top-of-page stack shorter without losing the lived-in
                  signal. Same privacy contract as before (usernames only
                  for logged-out viewers, never rendered on the restricted
                  private-community branch). */}
              {members.length > 0 && (
                <CommunityMemberPreview
                  members={members}
                  totalCount={community.member_count}
                  hideRealName={isAuthenticated === false}
                  onSeeAll={() => setTabIndex(2)}
                  onOpenProfile={(handle) => router.push(`/u/${handle}`)}
                />
              )}
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ my: { xs: 2, sm: 2.25 }, borderColor: "rgba(0,0,0,0.06)" }} />

        {/* Action row. Primary action (Join / Start a plan / sign-in CTA)
            sits on the left at full visual weight; secondary actions
            (Share link, Edit, Leave overflow) cluster on the right with
            quieter styling. The flex `1` spacer between them keeps the
            two clusters anchored on desktop while letting them collapse
            naturally on mobile. */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 1.25, sm: 1.5 }}
          alignItems={{ xs: "stretch", sm: "center" }}
          useFlexGap
        >
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap sx={{ flex: 1, minWidth: 0 }}>
            {!isMember && viewerRemoved && (
              <Tooltip title="You can't rejoin this community. Contact the community owner if you believe this was a mistake.">
                <Chip
                  icon={<BlockRoundedIcon />}
                  label="You were removed from this community"
                  variant="outlined"
                  size="small"
                  sx={{ borderColor: "divider", color: "text.secondary" }}
                />
              </Tooltip>
            )}
            {!isMember && !viewerPendingRequest && !viewerRemoved && isAuthenticated === false && (
              // Welcoming CTA for cold / QR traffic: the button invites the
              // viewer in rather than assuming they already have an account.
              // Clicking still routes through `/login?next=...` so the
              // underlying auth flow and return destination are unchanged.
              <Button
                component={Link}
                href={`/login?next=${encodeURIComponent(`/communities/${slug}`)}`}
                variant="contained"
                size="large"
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: 3.5,
                  py: 1.125,
                  fontSize: "0.9375rem",
                  boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
                  "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
                }}
              >
                {community.join_mode === "approval_required" ? "Request to join" : "Join this community"}
              </Button>
            )}
            {!isMember && !viewerPendingRequest && !viewerRemoved && isAuthenticated !== false && (
              <Button
                variant="contained"
                size="large"
                onClick={handleJoin}
                disabled={joining}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: 3.5,
                  py: 1.125,
                  fontSize: "0.9375rem",
                  boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
                  "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
                }}
              >
                {joining ? <CircularProgress size={18} color="inherit" /> : community.join_mode === "approval_required" ? "Request to join" : "Join this community"}
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
                size="large"
                startIcon={<AddCircleRoundedIcon />}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2.5,
                  px: 3.5,
                  py: 1.125,
                  fontSize: "0.9375rem",
                  boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
                  "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
                }}
              >
                Start a plan
              </Button>
            )}
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            useFlexGap
            sx={{
              flexShrink: 0,
              justifyContent: { xs: "flex-start", sm: "flex-end" },
            }}
          >
            <Tooltip title="Copy a link to this community">
              <Button
                variant="text"
                size="small"
                startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={handleShare}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  color: "text.secondary",
                  "&:hover": { bgcolor: "action.hover", color: "text.primary" },
                }}
              >
                Share
              </Button>
            </Tooltip>
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
              // Overflow menu (three-dot icon) for the member-level destructive
              // action. Keeps the primary action row focused on Start a plan
              // while still giving members a discoverable path to leave.
              <Tooltip title="More actions">
                <IconButton
                  aria-label="More community actions"
                  onClick={(e) => setMemberActionsAnchor(e.currentTarget)}
                  size="small"
                  sx={{
                    color: "text.secondary",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                    width: 32,
                    height: 32,
                    "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                  }}
                >
                  <MoreVertRoundedIcon sx={{ fontSize: "1.125rem" }} />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </AppCard>

      {/* Member overflow menu (non-owner members). Currently only hosts the
       *  Leave action; structured as a menu so future member-level actions
       *  can land here without re-doing the layout.
       */}
      <Menu
        anchorEl={memberActionsAnchor}
        open={Boolean(memberActionsAnchor)}
        onClose={() => setMemberActionsAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { minWidth: 200, borderRadius: 2.5, mt: 0.5 },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setMemberActionsAnchor(null);
            setLeaveConfirmOpen(true);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Leave community</ListItemText>
        </MenuItem>
      </Menu>

      {/* Leave-community confirmation */}
      <Dialog
        open={leaveConfirmOpen}
        onClose={() => {
          if (!leaving) setLeaveConfirmOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ px: { xs: 2, sm: 3 } }}>
          Leave {community?.name ?? "this community"}?
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 0, sm: 1.5 } }}>
          <Stack spacing={1.25} sx={{ mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Any plans you&apos;ve RSVP&apos;d to will stay on your
              schedule.
            </Typography>
            {community?.visibility === "private" ? (
              <Typography variant="body2" color="text.secondary">
                Because this is a private community, rejoining later means
                sending a new request to the owner.
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                You can rejoin any time from this page.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: { xs: "stretch", sm: "flex-end" },
            gap: { xs: 1, sm: 1 },
            pt: { xs: 1, sm: 1.5 },
            px: { xs: 2, sm: 3 },
            pb: { xs: 2, sm: 3 },
          }}
        >
          <Button
            variant="outlined"
            onClick={() => setLeaveConfirmOpen(false)}
            disabled={leaving}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2.5,
              width: { xs: "100%", sm: "auto" },
            }}
          >
            Stay
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleLeave}
            disabled={leaving}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2.5,
              boxShadow: "none",
              width: { xs: "100%", sm: "auto" },
              "&:hover": { boxShadow: "none", opacity: 0.92 },
            }}
            startIcon={
              leaving ? <CircularProgress size={16} color="inherit" /> : <LogoutRoundedIcon />
            }
          >
            {leaving ? "Leaving…" : "Leave community"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tabs. Custom indicator (3px primary bar) and elevated active
          state so the section navigation reads as a real navigation
          surface rather than a thin underline. The bottom hairline gives
          the tab strip a clear baseline against the tab content below. */}
      <Box>
        <Tabs
          value={tabIndex}
          onChange={(_, v) => {
            setTabIndex(v);
            // Keep the URL in sync with the active tab so a refresh lands
            // on the same surface and a copy-pasted link matches what the
            // sharer was looking at. router.replace keeps this out of the
            // browser history so the back button doesn't tab-walk.
            // `scroll: false` keeps the viewer at the tab section instead
            // of jumping to the page top on every tab switch.
            const next = v === 3 ? "requests"
              : v === 2 ? "members"
              : v === 1 ? "announcements"
              : null;
            const url = new URL(window.location.href);
            if (next) url.searchParams.set("tab", next);
            else url.searchParams.delete("tab");
            const nextHref = url.pathname + (url.search || "") + (url.hash || "");
            router.replace(nextHref, { scroll: false });
          }}
          variant="scrollable"
          scrollButtons={false}
          sx={{
            mb: { xs: 2, sm: 2.5 },
            borderBottom: "1px solid",
            borderColor: "divider",
            minHeight: 52,
            "& .MuiTabs-indicator": {
              height: 3,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              backgroundColor: "primary.main",
            },
          }}
        >
          <Tab
            label={`Plans${events.length > 0 ? ` (${events.length})` : ""}`}
            icon={<EventNoteRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              textTransform: "none",
              minHeight: 52,
              fontWeight: 600,
              fontSize: "0.9375rem",
              color: "text.secondary",
              "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
              "&:hover": { color: "text.primary", bgcolor: "action.hover" },
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              transition: "color 0.15s ease, background-color 0.15s ease",
            }}
          />
          {/* Announcements tab. The unseen indicator (`hasUnseenAnnouncements`)
              is only ever true for authenticated viewers; logged-out viewers
              see the tab without a badge. The badge is a small primary-color
              dot rendered next to the label so the visual treatment matches
              the existing unread-chat dot on plan cards. */}
          <Tab
            label={
              <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
                <span>Announcements</span>
                {hasUnseenAnnouncements && tabIndex !== 1 && (
                  <Box
                    aria-label="New announcements"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: "primary.main",
                      boxShadow: "0 0 0 3px rgba(230, 91, 19, 0.18)",
                      flexShrink: 0,
                    }}
                  />
                )}
              </Box>
            }
            icon={<CampaignRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              textTransform: "none",
              minHeight: 52,
              fontWeight: 600,
              fontSize: "0.9375rem",
              color: "text.secondary",
              "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
              "&:hover": { color: "text.primary", bgcolor: "action.hover" },
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              transition: "color 0.15s ease, background-color 0.15s ease",
            }}
          />
          <Tab
            label={`Members${community.member_count > 0 ? ` (${community.member_count})` : ""}`}
            icon={<PeopleRoundedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            sx={{
              textTransform: "none",
              minHeight: 52,
              fontWeight: 600,
              fontSize: "0.9375rem",
              color: "text.secondary",
              "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
              "&:hover": { color: "text.primary", bgcolor: "action.hover" },
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              transition: "color 0.15s ease, background-color 0.15s ease",
            }}
          />
          {isOwner && community.visibility === "private" && (
            <Tab
              label={`Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ""}`}
              icon={<AssignmentIndRoundedIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
              sx={{
                textTransform: "none",
                minHeight: 52,
                fontWeight: 600,
                fontSize: "0.9375rem",
                color: "text.secondary",
                "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
                "&:hover": { color: "text.primary", bgcolor: "action.hover" },
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                transition: "color 0.15s ease, background-color 0.15s ease",
              }}
            />
          )}
        </Tabs>

        {/* Plans tab */}
        {tabIndex === 0 && (
          <Stack spacing={{ xs: 2, sm: 2.5 }}>
            {events.length > 0 && (
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ px: 0.25 }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: { xs: "1.0625rem", sm: "1.125rem" },
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    Upcoming plans
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", mt: 0.125 }}>
                    {events.length === 1
                      ? "1 plan from this community"
                      : `${events.length} plans from this community`}
                  </Typography>
                </Box>
                {isMember && (
                  <Button
                    component={Link}
                    href={createPlanHref}
                    variant="text"
                    size="small"
                    startIcon={<AddCircleRoundedIcon sx={{ fontSize: 18 }} />}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      borderRadius: 2,
                      color: "primary.main",
                      display: { xs: "none", sm: "inline-flex" },
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    New plan
                  </Button>
                )}
              </Stack>
            )}

            {(!eventsFetched || eventsLoading) && events.length === 0 ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress size={28} /></Box>
            ) : events.length === 0 ? (
              <AppCard>
                <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 }, px: { xs: 2, sm: 3 } }}>
                  <Box
                    sx={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      bgcolor: "primary.light",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <EventNoteRoundedIcon sx={{ fontSize: 32, color: "primary.main" }} />
                  </Box>
                  <Box sx={{ textAlign: "center", maxWidth: 420 }}>
                    <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                      No plans posted yet
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {isMember
                        ? "Be the first to start a plan. Members get notified as soon as something is on the calendar."
                        : "Upcoming plans from this community will appear here."}
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

            {/* Recently happened section. Renders below the upcoming list
                with its own heading so past gatherings can never be
                mistaken for joinable plans. The endpoint already enforces
                community privacy + the same visibility matrix as the
                upcoming feed (private communities require active
                membership / super admin to see anything; chums-only is
                still scoped to host/chums/RSVP'd; invite-only never
                appears). Useful especially for store / community pages
                with few upcoming plans, since a stretch of recent
                gatherings makes the page feel inhabited. */}
            {community && !restricted && (
              <RecentlyHappenedSection
                variant="community"
                communityId={community.id}
                viewerHobbyCategories={viewerHobbyCategories}
                isAuthenticated={isAuthenticated === true}
              />
            )}
          </Stack>
        )}

        {/* Announcements tab. v1: tab-only surface, no email blast, no
            in-app bell. The component owns its own create / edit / delete
            / pin flow and pings `refreshUnseenAnnouncements` so the tab
            badge clears after the user opens this tab or posts. */}
        {tabIndex === 1 && community && (
          <CommunityAnnouncementsTab
            communityId={community.id}
            isAuthenticated={isAuthenticated === true}
            canManageHint={isOwner}
            initialAnnouncements={announcementsSeed}
            initialCanManage={announcementsCanManageSeed}
            onMarkedSeen={clearUnseenAnnouncementsBadge}
            onListSynced={handleAnnouncementsListSynced}
          />
        )}

        {/* Members tab */}
        {tabIndex === 2 && (
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
            ) : (() => {
              // Logged-out viewers only see handles. Real names stay
              // scoped to signed-in members so the public slug URL
              // doesn't become a name-scraping surface for anyone who
              // shares or scans a community QR code.
              const hideRealName = isAuthenticated === false;
              const owner = members.find((m) => m.role === "owner") ?? null;
              const others = members.filter((m) => m.role !== "owner");
              return (
                <Stack spacing={{ xs: 2, sm: 2.5 }}>
                  {owner && (
                    // Owner spotlight. Lifts the community lead out of the
                    // grid below so the page reads as "this is who runs the
                    // community" before the rest of the roster, with a
                    // subtle warm wash + primary.light border that ties
                    // back to the page header treatment.
                    (() => {
                      const handle = owner.username?.replace(/^@/, "") ?? null;
                      const primaryLabel = hideRealName
                        ? (handle ? `@${handle}` : "NewChums member")
                        : (owner.name || owner.username || "Unknown");
                      const avatarInitial = hideRealName
                        ? ((handle || "?").charAt(0).toUpperCase())
                        : ((owner.name || owner.username || "?").charAt(0).toUpperCase());
                      return (
                        <Box
                          sx={{
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: 3,
                            border: "1px solid",
                            borderColor: "primary.light",
                            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
                          }}
                        >
                          <Stack direction="row" alignItems="center" spacing={{ xs: 1.75, sm: 2 }}>
                            <Avatar
                              src={owner.avatar_url ? `${getAvatarBaseUrl()}${owner.avatar_url}` : undefined}
                              sx={{
                                width: { xs: 48, sm: 56 },
                                height: { xs: 48, sm: 56 },
                                bgcolor: "primary.main",
                                color: "primary.contrastText",
                                fontSize: { xs: "1.125rem", sm: "1.25rem" },
                                fontWeight: 700,
                                border: "2px solid #fff",
                                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                              }}
                            >
                              {avatarInitial}
                            </Avatar>
                            <Box
                              sx={{ flex: 1, minWidth: 0, cursor: handle ? "pointer" : "default" }}
                              onClick={() => { if (handle) router.push(`/u/${handle}`); }}
                            >
                              <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                                <Typography
                                  sx={{
                                    fontSize: "0.6875rem",
                                    fontWeight: 700,
                                    letterSpacing: "0.1em",
                                    textTransform: "uppercase",
                                    color: "primary.dark",
                                  }}
                                >
                                  Community lead
                                </Typography>
                              </Stack>
                              <Typography
                                sx={{
                                  fontSize: { xs: "1rem", sm: "1.0625rem" },
                                  fontWeight: 700,
                                  lineHeight: 1.3,
                                  color: "text.primary",
                                }}
                                noWrap
                              >
                                {primaryLabel}
                              </Typography>
                              {!hideRealName && handle && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                                  @{handle}
                                </Typography>
                              )}
                            </Box>
                          </Stack>
                        </Box>
                      );
                    })()
                  )}

                  {others.length > 0 && (
                    <Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{
                          display: "block",
                          mb: 1.25,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          fontWeight: 700,
                          fontSize: "0.6875rem",
                        }}
                      >
                        Members ({others.length})
                      </Typography>
                      <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                        {others.map((m) => {
                          const handle = m.username?.replace(/^@/, "") ?? null;
                          const primaryLabel = hideRealName
                            ? (handle ? `@${handle}` : "NewChums member")
                            : (m.name || m.username || "Unknown");
                          const avatarInitial = hideRealName
                            ? ((handle || "?").charAt(0).toUpperCase())
                            : ((m.name || m.username || "?").charAt(0).toUpperCase());
                          return (
                            <Grid key={m.id} size={{ xs: 12, sm: 6 }}>
                              <Box
                                sx={{
                                  p: { xs: 1.5, sm: 1.75 },
                                  borderRadius: 2.5,
                                  border: "1px solid",
                                  borderColor: "grey.200",
                                  bgcolor: "background.paper",
                                  height: "100%",
                                  transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s",
                                  "&:hover": {
                                    borderColor: "primary.light",
                                    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                                    transform: "translateY(-1px)",
                                  },
                                }}
                              >
                                <Stack direction="row" alignItems="center" spacing={1.5}>
                                  <Avatar
                                    src={m.avatar_url ? `${getAvatarBaseUrl()}${m.avatar_url}` : undefined}
                                    sx={{ width: 40, height: 40, bgcolor: "grey.300", fontSize: "0.9rem", fontWeight: 600 }}
                                  >
                                    {avatarInitial}
                                  </Avatar>
                                  <Box
                                    sx={{ flex: 1, minWidth: 0, cursor: handle ? "pointer" : "default" }}
                                    onClick={() => { if (handle) router.push(`/u/${handle}`); }}
                                  >
                                    <Typography variant="body2" fontWeight={600} noWrap sx={{ fontSize: "0.9375rem" }}>
                                      {primaryLabel}
                                    </Typography>
                                    {!hideRealName && handle && (
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                                        @{handle}
                                      </Typography>
                                    )}
                                  </Box>
                                  {isOwner && (
                                    <Tooltip title="Remove and block this member">
                                      <Button
                                        size="small"
                                        variant="text"
                                        color="error"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRemoveMemberTarget(m);
                                          setRemoveMemberReason("");
                                        }}
                                        sx={{
                                          textTransform: "none",
                                          fontSize: "0.75rem",
                                          fontWeight: 600,
                                          borderRadius: 1.5,
                                          minWidth: "auto",
                                          px: 1.25,
                                          flexShrink: 0,
                                        }}
                                      >
                                        Remove
                                      </Button>
                                    </Tooltip>
                                  )}
                                </Stack>
                              </Box>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Box>
                  )}
                </Stack>
              );
            })()}

            {/* Removed members, visible to owner/super admin only. Separated
                from the active list so the primary roster stays clean. */}
            {isOwner && removedMembers.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}
                >
                  Blocked ({removedMembers.length})
                </Typography>
                <Stack spacing={1.5}>
                  {removedMembers.map((m) => {
                    const handle = m.username?.replace(/^@/, "") ?? null;
                    return (
                      <AppCard key={m.id} sx={{ opacity: 0.75, bgcolor: "action.hover" }}>
                        <Stack direction="row" alignItems="flex-start" spacing={2}>
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
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                              <Typography variant="body2" fontWeight={600} noWrap sx={{ textDecoration: "line-through" }}>
                                {m.name || m.username || "Unknown"}
                              </Typography>
                              <Chip label="Blocked" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem", borderColor: "divider" }} />
                            </Stack>
                            {handle && <Typography variant="caption" color="text.secondary">@{handle}</Typography>}
                            {m.removal_reason && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: "block", mt: 0.5, fontStyle: "italic", lineHeight: 1.5 }}
                              >
                                &ldquo;{m.removal_reason}&rdquo;
                              </Typography>
                            )}
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => { e.stopPropagation(); setUnblockMemberTarget(m); }}
                            sx={{ textTransform: "none", fontSize: "0.75rem", borderRadius: 1.5, flexShrink: 0 }}
                          >
                            Unblock
                          </Button>
                        </Stack>
                      </AppCard>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </>
        )}

        {/* Requests tab (owner of private community) */}
        {tabIndex === 3 && isOwner && community.visibility === "private" && (
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

            {/* Previously denied, declines still inside the 30-day cooldown
                window. Owner can undo a denial here if it was a mistake. */}
            {declinedRequests.length > 0 && (
              <Box sx={{ mt: 4 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 1, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}
                >
                  Previously denied ({declinedRequests.length})
                </Typography>
                <Stack spacing={1.5}>
                  {declinedRequests.map((req) => {
                    const handle = req.username?.replace(/^@/, "") ?? null;
                    const declinedAt = req.reviewed_at ? new Date(req.reviewed_at) : null;
                    const timeAgo = declinedAt ? (() => {
                      const diffMs = Date.now() - declinedAt.getTime();
                      const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
                      if (diffDays < 1) return "today";
                      if (diffDays === 1) return "1 day ago";
                      if (diffDays < 30) return `${diffDays} days ago`;
                      return declinedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                    })() : null;
                    return (
                      <AppCard key={req.id} sx={{ opacity: 0.85, bgcolor: "action.hover" }}>
                        <Stack spacing={1.25}>
                          <Stack direction="row" alignItems="center" spacing={2}>
                            <Avatar
                              src={req.avatar_url ? `${getAvatarBaseUrl()}${req.avatar_url}` : undefined}
                              sx={{ width: 40, height: 40, bgcolor: "grey.300", fontSize: "0.9rem" }}
                            >
                              {(req.name || req.username || "?").charAt(0).toUpperCase()}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                                <Typography variant="body2" fontWeight={600} noWrap>
                                  {req.name || req.username || "Unknown"}
                                </Typography>
                                <Chip label="Denied" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.6875rem", borderColor: "divider" }} />
                              </Stack>
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                {handle && <Typography variant="caption" color="text.secondary">@{handle}</Typography>}
                                {handle && timeAgo && <Typography variant="caption" color="text.disabled">·</Typography>}
                                {timeAgo && <Typography variant="caption" color="text.disabled">denied {timeAgo}</Typography>}
                              </Stack>
                            </Box>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={(e) => { e.stopPropagation(); setUndoDeclineTarget(req); }}
                              sx={{ textTransform: "none", fontSize: "0.75rem", borderRadius: 1.5, flexShrink: 0 }}
                            >
                              Undo denial
                            </Button>
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
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Local interest signal. Same copy/layout as the explore feed's
          footer: surfaces one hobby the viewer shares with active people
          in their area. Community-agnostic for now; the backend picks
          the hobby from the viewer's own interests. */}
      {localSignal && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            pt: 2,
            pb: 1,
          }}
        >
          <PeopleRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
          >
            {localSignal.count} active {localSignal.count === 1 ? "person" : "people"} near you{" "}
            {localSignal.count === 1 ? "is" : "are"} into {localSignal.hobbyName}
          </Typography>
        </Box>
      )}

      {/* Logged-out signup footer. Mirrors the calm warm-wash CTA on the
          /communities discovery page so a public visitor lands on a clear
          sign-up nudge whether they entered through discovery, a QR
          poster, or a direct share link. Suppressed for authed viewers
          (the action row above already handles their state). */}
      {isAuthenticated === false && (
        <CommunitySignupFooter slug={slug} communityName={community.name} />
      )}

      {/* Remove member confirmation */}
      <Dialog
        open={!!removeMemberTarget}
        onClose={() => { if (!removeMemberSubmitting) { setRemoveMemberTarget(null); setRemoveMemberReason(""); } }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Remove and block member</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            This will remove{" "}
            <strong>
              {removeMemberTarget?.name || (removeMemberTarget?.username ? `@${removeMemberTarget.username.replace(/^@/, "")}` : "this member")}
            </strong>{" "}
            from <strong>{community.name}</strong> and <strong>block them from rejoining</strong>. They&rsquo;ll lose access to the community&rsquo;s plans and members, and will receive an email letting them know. You can unblock them later from the Blocked list.
          </Typography>
          <TextField
            label="Reason (optional)"
            placeholder="Shared with the removed member in their email"
            value={removeMemberReason}
            onChange={(e) => setRemoveMemberReason(e.target.value.slice(0, 500))}
            fullWidth
            multiline
            rows={2}
            size="small"
            inputProps={{ maxLength: 500 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setRemoveMemberTarget(null); setRemoveMemberReason(""); }}
            disabled={removeMemberSubmitting}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmRemoveMember}
            disabled={removeMemberSubmitting}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {removeMemberSubmitting ? <CircularProgress size={18} color="inherit" /> : "Remove & Block"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unblock member confirmation */}
      <Dialog
        open={!!unblockMemberTarget}
        onClose={() => { if (!unblockSubmitting) setUnblockMemberTarget(null); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Unblock member</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will unblock{" "}
            <strong>
              {unblockMemberTarget?.name || (unblockMemberTarget?.username ? `@${unblockMemberTarget.username.replace(/^@/, "")}` : "this member")}
            </strong>{" "}
            from <strong>{community.name}</strong>. They&rsquo;ll be able to request to join again, but they <strong>won&rsquo;t be re-added automatically</strong>. They&rsquo;ll receive an email letting them know they can rejoin.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setUnblockMemberTarget(null)}
            disabled={unblockSubmitting}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmUnblockMember}
            disabled={unblockSubmitting}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {unblockSubmitting ? <CircularProgress size={18} color="inherit" /> : "Unblock member"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Undo-denial confirmation */}
      <Dialog
        open={!!undoDeclineTarget}
        onClose={() => { if (!undoDeclineSubmitting) setUndoDeclineTarget(null); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Undo denial</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This will undo your earlier denial of{" "}
            <strong>
              {undoDeclineTarget?.name || (undoDeclineTarget?.username ? `@${undoDeclineTarget.username.replace(/^@/, "")}` : "this person")}
            </strong>
            &rsquo;s request to join <strong>{community.name}</strong>. They&rsquo;ll be able to request to join again, but they <strong>won&rsquo;t be added automatically</strong>. They&rsquo;ll receive an email letting them know.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setUndoDeclineTarget(null)}
            disabled={undoDeclineSubmitting}
            sx={{ textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleConfirmUndoDecline}
            disabled={undoDeclineSubmitting}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {undoDeclineSubmitting ? <CircularProgress size={18} color="inherit" /> : "Undo denial"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/** Calm, end-of-page sign-up nudge for logged-out viewers reaching the
 *  community detail page (slug URL is the public share destination, so
 *  cold/QR traffic is expected). Mirrors the warm-wash footer on the
 *  /communities discovery page so the two surfaces feel like one
 *  product. The CTA buttons route through `/login?next=...` so the
 *  viewer lands back on this community after authenticating. */
function CommunitySignupFooter({ slug, communityName }: { slug: string; communityName: string }) {
  const next = `/communities/${slug}`;
  const loginHref = `/login?next=${encodeURIComponent(next)}`;
  return (
    <Box
      sx={{
        mt: { xs: 2, sm: 3 },
        p: { xs: 2.75, sm: 3.25 },
        borderRadius: 3,
        border: "1px solid",
        borderColor: "primary.light",
        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "flex-start", sm: "center" },
        gap: { xs: 1.5, sm: 2.5 },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          bgcolor: "primary.main",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(230, 91, 19, 0.18)",
        }}
      >
        <PeopleRoundedIcon sx={{ color: "primary.contrastText", fontSize: 22 }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25, fontSize: "1rem" }}>
          Join {communityName} on NewChums
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Sign up free to RSVP to plans, meet other members, and get notified when something is on the calendar.
        </Typography>
      </Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
      >
        <Button
          component={Link}
          href={`/signup?next=${encodeURIComponent(next)}`}
          variant="contained"
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2.5,
            boxShadow: "none",
            flex: { xs: 1, sm: "0 0 auto" },
            "&:hover": { boxShadow: "none", opacity: 0.92 },
          }}
        >
          Sign up
        </Button>
        <Button
          component={Link}
          href={loginHref}
          variant="outlined"
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2.5,
            flex: { xs: 1, sm: "0 0 auto" },
          }}
        >
          Sign in
        </Button>
      </Stack>
    </Box>
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

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ pl: { xs: 0, sm: 4.5 }, mb: refreshable ? 2 : 1, lineHeight: 1.6 }}
      >
        The community owner will review your request. You&rsquo;ll receive an email when it&rsquo;s
        approved or declined.
      </Typography>

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

/** Sign-in CTA rendered in place of the join / request-to-join card when a
 *  logged-out viewer reaches the slug URL (the canonical public / shareable
 *  destination for a community). `variant` picks the copy, "request" for
 *  private communities that gate membership behind approval, "join" for
 *  open communities. `next` carries the viewer back to this page after
 *  sign-in so the post-login landing feels intentional. */
function SignInToJoinCard({
  slug,
  variant,
}: {
  slug: string;
  variant: "request" | "join";
}) {
  const next = `/communities/${slug}`;
  const href = `/login?next=${encodeURIComponent(next)}`;
  // Calm, account-agnostic copy. Cold / QR traffic may not have a NewChums
  // account yet, the subtitle frames sign-up as the natural next step without
  // selling the value of membership on top of it.
  const title = variant === "request" ? "Request to join this community" : "Join this community";
  const subtitle = "Sign in or create a free NewChums account to continue.";
  const buttonLabel = variant === "request" ? "Request to join" : "Join this community";
  return (
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
              {title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
        </Stack>
        <Box>
          <Button
            component={Link}
            href={href}
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
          >
            {buttonLabel}
          </Button>
        </Box>
      </Stack>
    </AppCard>
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

/** Compact "signs of life" strip now folded inline into the header card's
 *  meta stack. Surfaces up to four overlapping avatars + a short handle
 *  list + a "See all" link to the Members tab. Tighter than the old
 *  standalone AppCard version so the top-of-page stack stays short.
 *  Privacy contract unchanged: logged-out viewers (hideRealName) only
 *  ever see `@username`, never the real `name` field. Never renders on
 *  the restricted preview; the API doesn't expose members there. */
function CommunityMemberPreview({
  members,
  totalCount,
  hideRealName,
  onSeeAll,
  onOpenProfile,
}: {
  members: Member[];
  totalCount: number;
  hideRealName: boolean;
  onSeeAll: () => void;
  onOpenProfile: (handle: string) => void;
}) {
  const shown = members.slice(0, 4);
  const handles = shown
    .map((m) => m.username?.replace(/^@/, ""))
    .filter((h): h is string => !!h);
  const remaining = Math.max(0, totalCount - shown.length);
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
      <AvatarGroup
        max={4}
        sx={{
          "& .MuiAvatar-root": {
            width: 24, height: 24,
            fontSize: "0.7rem", fontWeight: 600,
            borderColor: "background.paper",
            borderWidth: 1.5,
          },
        }}
      >
        {shown.map((m) => {
          const handle = m.username?.replace(/^@/, "") ?? null;
          const initialSource = hideRealName
            ? (handle || "?")
            : (m.name || m.username || "?");
          return (
            <Avatar
              key={m.id}
              src={m.avatar_url ? `${getAvatarBaseUrl()}${m.avatar_url}` : undefined}
              onClick={() => { if (handle) onOpenProfile(handle); }}
              sx={{
                bgcolor: "grey.300",
                cursor: handle ? "pointer" : "default",
              }}
            >
              {initialSource.charAt(0).toUpperCase()}
            </Avatar>
          );
        })}
      </AvatarGroup>
      {handles.length > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: "0.8125rem", lineHeight: 1.5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {handles.slice(0, 2).map((h) => `@${h}`).join(", ")}
          {remaining > 0 && ` and ${remaining} other${remaining === 1 ? "" : "s"}`}
        </Typography>
      )}
      <Typography
        component="button"
        type="button"
        variant="body2"
        onClick={onSeeAll}
        sx={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          color: "primary.main",
          bgcolor: "transparent",
          border: 0,
          p: 0,
          cursor: "pointer",
          "&:hover": { textDecoration: "underline" },
        }}
      >
        See all
      </Typography>
    </Stack>
  );
}

/** Wide hero image above the header card. Rendered on every detail surface
 *  (public, restricted, logged-in) whenever a banner is set, it's visual
 *  only and carries no plan/member info, so the privacy contract is
 *  preserved.
 *
 *  The server sends the banner bytes with `Cache-Control: public,
 *  max-age=86400`, so without a cache-buster the browser keeps serving a
 *  stale image after the owner replaces their banner. `bannerKey` is the
 *  R2 object key (which bakes in a timestamp) and changes on every new
 *  upload, so using its tail as a `?v=` query param gives every viewer a
 *  fresh URL exactly when (and only when) the banner actually changes.
 *  The API route ignores the query string, it resolves the banner from
 *  the community row in the DB. */
function CommunityBannerHero({
  communityId,
  name,
  bannerKey,
}: {
  communityId: string;
  name: string;
  bannerKey: string | null;
}) {
  const src = communityBannerUrl(communityId, bannerKey)
    ?? `${getAvatarBaseUrl()}/communities/${encodeURIComponent(communityId)}/banner`;
  return (
    <Box
      sx={{
        width: "100%",
        // 5:1 keeps the banner reading as a hero strip without swallowing
        // the top of the page; matches the crop aspect the editor now
        // produces so new uploads render exactly as the user framed them.
        aspectRatio: "5 / 1",
        borderRadius: { xs: 2, sm: 2.5 },
        overflow: "hidden",
        bgcolor: "action.hover",
        position: "relative",
      }}
    >
      {/* Raw <img> is intentional: the URL is an authenticated backend
          media route; Next.js Image would need remotePatterns config for
          the API worker and adds nothing at this size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`${name} banner`}
        loading="lazy"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    </Box>
  );
}
