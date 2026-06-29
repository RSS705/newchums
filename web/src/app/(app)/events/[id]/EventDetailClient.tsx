"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { pickerFieldTabKeyDown } from "@/components/fields/pickerTabNav";
import IconButton from "@mui/material/IconButton";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Checkbox from "@mui/material/Checkbox";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import Paper from "@mui/material/Paper";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import EmailRoundedIcon from "@mui/icons-material/EmailRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import BookmarkAddRoundedIcon from "@mui/icons-material/BookmarkAddRounded";
import BookmarkRemoveRoundedIcon from "@mui/icons-material/BookmarkRemoveRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import UserAvatar from "@/components/common/UserAvatar";
import { AppButton, AppCard, useToast } from "@/components/ui";
import RichTextContent from "@/components/ui/RichTextContent";
import {
  apiFetch,
  clearAuthTokenCache,
  getAuthToken,
  getAvatarBaseUrl,
  getImageFallbackBaseUrl,
  getChatWebSocketUrl,
} from "@/lib/apiClient";
import { isDuplicate, nameToSlug } from "@/lib/interestUtils";
import { notifyObjectivesChanged } from "@/components/objectives/NextStepNudge";
import PlanFeedback from "@/components/events/PlanFeedback";
import PlanSignupCard from "@/components/events/PlanSignupCard";
import AvailabilityPicker, {
  type AvailabilitySelection,
} from "@/components/events/AvailabilityPicker";

/** Meeting URLs pasted without a scheme should still open in the browser. */
function normalizeMeetingLinkHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type HobbyInfo = { name: string; slug: string; category?: string | null };

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
  altTimesMode?: string;
  availabilityDeadlineAt?: string | null;
  allowAttendeeInvites: boolean;
  requireReconfirmation: boolean;
  canceledAt: string | null;
  cancellationReason?: string | null;
  bannerKey: string | null;
  hobby: string | null;
  hobbySlug: string | null;
  hobbies: HobbyInfo[];
  hostName: string;
  hostUserId: string;
  isHost: boolean;
  lockedAt: string | null;
  requireApproval: boolean;
  reserveSeats: boolean;
  isInvited: boolean;
  hasRsvp: boolean;
  goingCount?: number;
  maybeCount?: number;
  // Attendance assurance
  minConfirmedAttendees: number | null;
  fallbackPolicy: string | null;
  // Optional RSVP-based threshold; distinct from the 24-hour attendance check.
  // If set, the cron auto-cancels the plan 2 hours before start when fewer
  // than this many "going" RSVPs exist (host included).
  minAttendeesRequired?: number | null;
  confirmationWindowOpen: boolean;
  // True once the confirmation cycle has been issued for this plan (Phase 1
  // ran). Stays true after the window closes or the plan is canceled, so the
  // UI can keep surfacing who confirmed and who didn't.
  confirmationsIssued?: boolean;
  confirmationCutoffAt: string | null;
  confirmedCount: number;
  pendingConfirmationCount: number;
  myConfirmationStatus: string | null;
  planViability: string | null;
  communities?: Array<{ id: string; slug: string; name: string }>;
  hideFromExplore?: boolean;
  isQa?: boolean;
};

type RsvpEntry = {
  userId: string;
  name: string;
  handle: string | null;
  status: string;
  note: string | null;
  avatarUrl?: string | null;
  confirmationStatus?: string | null;
  prefNotes?: string[] | null;
  isChumSaved?: boolean;
  hideName?: boolean;
};
type AltTimeEntry = {
  id: string;
  userId: string;
  name: string;
  handle: string | null;
  suggestedAt: string;
  endsAt: string | null;
};
type InviteEntry = {
  userId: string | null;
  email: string | null;
  name: string;
  handle?: string | null;
};
type RemoveTarget =
  | { type: "rsvp"; userId: string; name: string }
  | { type: "invite"; userId: string | null; email: string | null; name: string };
type SearchResult = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl?: string | null;
};
type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderHandle: string | null;
  avatarUrl: string | null;
};

type JoinRequest = {
  id: string;
  userId: string;
  status: string;
  message: string | null;
  hostMessage: string | null;
  decidedAt: string | null;
  createdAt: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
};

type PlanAccessState = "public" | "invite" | "authenticated" | "attending";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WS_RECONNECT_BASE = 2_000;
const WS_RECONNECT_MAX = 30_000;
const WS_FALLBACK_POLL_INTERVAL = 30_000;

function formatChatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffHrs < 48) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function visibilityLabel(v: string): string {
  if (v === "invite_only") return "Invite only";
  if (v === "chums_only") return "Chums only";
  return "Public";
}

const VALID_RSVP_PARAMS = ["going", "maybe", "cant_make_it"] as const;

// Sections from email deep-links (?section=...) that require an authenticated
// viewer. Logged-out visitors hitting these are redirected through /login first
// and returned to the same plan + section after signing in. Keep in sync with
// AUTH_REQUIRED_EVENT_SECTIONS in web/src/app/(app)/layout.tsx (the layout
// short-circuits on the server before any HTML renders; this client-side list
// is the safety net + scroll-target gate).
//
// "join-requests" is the host-side "Review request" deep-link target; when a
// logged-out host (often a super admin for QA plans, where the public-preview
// path 404s) clicks the email, this routes them through /login first instead
// of letting them land on a "Plan not found" message.
//
// "attendees" is the requester-side "approved" email deep-link; after login
// the viewer scrolls to the Who's in card where they can confirm their RSVP.
const AUTH_REQUIRED_SECTIONS: readonly string[] = [
  "feedback",
  "chat",
  "confirmation",
  "join-requests",
  "attendees",
];

const PREF_NOTE_LABELS: Record<string, string> = {
  reliability: "reliability",
  sociability: "sociability",
  presentation: "cleanliness & consideration",
  hosting_skills: "hosting quality",
  age: "age range",
};

type EventDetailClientProps = {
  /** Server-resolved auth state. When `false`, the client skips its
   *  initial `getAuthToken()` call (which would 401 for logged-out
   *  viewers) and goes straight into the unauthenticated fetch path,
   *  keeping the public plan URL quiet in the console. Logged-in
   *  flows (RSVP, chat WebSocket, refresh-after-action) still call
   *  `getAuthToken()` directly when needed. */
  isAuthenticatedFromServer?: boolean;
};

export default function EventDetailClient({
  isAuthenticatedFromServer,
}: EventDetailClientProps = {}) {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [accessState, setAccessState] = useState<PlanAccessState>("public");
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);
  const [altTimes, setAltTimes] = useState<AltTimeEntry[]>([]);
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [viewerEmail, setViewerEmail] = useState<string | null>(null);
  // Email the invite_token was issued for, exposed by GET /events/:id only to
  // unauthenticated viewers so the lightweight signup card can prefill the
  // email field. Keeps the new account's address aligned with the invite row
  // so post-signup adoption attaches the user to the correct invite.
  const [inviteeEmail, setInviteeEmail] = useState<string | null>(null);
  const [prefNote, setPrefNote] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpDialogOpen, setRsvpDialogOpen] = useState(false);
  const [rsvpDialogStatus, setRsvpDialogStatus] = useState<string>("");
  const [rsvpDialogMessage, setRsvpDialogMessage] = useState("");
  // Attendance assurance
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  // Local override for confirmation status, provides immediate UI feedback before refresh() completes
  const [localConfirmStatus, setLocalConfirmStatus] = useState<string | null>(null);
  // Edit-form state. The new picker manages its own multi-date state internally;
  // these are only used while editing an existing alt-time entry inline.
  const [altEditDate, setAltEditDate] = useState<Dayjs | null>(null);
  const [altEditStartTime, setAltEditStartTime] = useState<Dayjs | null>(null);
  const [altEditEndTime, setAltEditEndTime] = useState<Dayjs | null>(null);
  const [altEditAnytime, setAltEditAnytime] = useState(false);
  const [altEditingId, setAltEditingId] = useState<string | null>(null);
  const [altSubmitting, setAltSubmitting] = useState(false);
  const [altDeleting, setAltDeleting] = useState<string | null>(null);
  const [promoteConfirmTime, setPromoteConfirmTime] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const altEditFormRef = useRef<HTMLDivElement>(null);

  // Invite people state
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

  // Cancel confirmation dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // Remove attendee dialog
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<RemoveTarget | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removing, setRemoving] = useState(false);

  // Attendee overflow menu state
  const [attendeeMenuAnchor, setAttendeeMenuAnchor] = useState<HTMLElement | null>(null);
  const [attendeeMenuTarget, setAttendeeMenuTarget] = useState<RsvpEntry | null>(null);
  const [chumToggling, setChumToggling] = useState(false);

  // Invite overflow menu state
  const [inviteMenuAnchor, setInviteMenuAnchor] = useState<HTMLElement | null>(null);
  const [inviteMenuTarget, setInviteMenuTarget] = useState<InviteEntry | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLastReadAt, setChatLastReadAt] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Share token from API response, used by Copy Link to build share-access URLs
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLinkModalDismissed, setShareLinkModalDismissed] = useState(false);
  const [shareLinkModalOpen, setShareLinkModalOpen] = useState(false);
  const [shareLinkDontShowAgain, setShareLinkDontShowAgain] = useState(false);

  const [bannerFailed, setBannerFailed] = useState(false);
  const [bannerUseFallback, setBannerUseFallback] = useState(false);
  const handleBannerError = useCallback(() => {
    if (!bannerUseFallback && getImageFallbackBaseUrl()) {
      setBannerUseFallback(true);
    } else {
      setBannerFailed(true);
    }
  }, [bannerUseFallback]);

  // Copy link, builds a share URL with the share token so recipients see
  // full plan detail + the lightweight signup card (not just the public preview).
  const handleCopyLink = useCallback(async () => {
    const base = `${window.location.origin}/events/${eventId}`;
    const url = shareToken ? `${base}?share_token=${encodeURIComponent(shareToken)}` : base;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.cssText = "position:fixed;top:-9999px;left:-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      if (shareLinkModalDismissed) {
        toast.success("Link copied to clipboard");
      } else {
        setShareLinkModalOpen(true);
      }
    } catch {
      toast.error("Could not copy link, please copy it from your browser's address bar");
    }
  }, [eventId, shareToken, toast, shareLinkModalDismissed]);

  const handleShareLinkModalClose = useCallback(async () => {
    setShareLinkModalOpen(false);
    if (shareLinkDontShowAgain) {
      setShareLinkModalDismissed(true);
      try {
        await apiFetch("/share-link-modal-dismiss", { auth: true, method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      } catch { /* non-critical */ }
    }
    setShareLinkDontShowAgain(false);
  }, [shareLinkDontShowAgain]);

  // Lock state
  const [lockToggling, setLockToggling] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  // Auth detection for logged-out user handling (set by load())
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Prefetched feedback payload, populated in load() when the visitor arrived
  // via ?section=feedback. Lets <PlanFeedback> mount with data already in
  // hand so the form is visible on first paint instead of popping in after a
  // second round-trip.
  const [prefetchedFeedback, setPrefetchedFeedback] = useState<unknown>(null);

  // Restore invite token for this event from localStorage (survives page reloads)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`nc_inv_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) inviteTokenRef.current = parsed.token;
      }
    } catch {
      /* noop */
    }
  }, [eventId]);

  // Restore share token for this event from localStorage. Required so the
  // host-generated Copy Link grant survives the lightweight-signup round-trip
  // (the URL is scrubbed of `?share_token=...` after first capture and is no
  // longer present when the user lands back on the plan after authenticating).
  // Mirrors the invite_token path above. The server-side gates (invite_only
  // and require_approval) re-verify the token on every RSVP, so persisting
  // it client-side never weakens the access check.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`nc_share_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) shareTokenRef.current = parsed.token;
      }
    } catch {
      /* noop */
    }
  }, [eventId]);

  // Join request state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestMessage, setJoinRequestMessage] = useState("");
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState(false);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [approveDeclineLoading, setApproveDeclineLoading] = useState<string | null>(null);
  const [hostResponseMessage, setHostResponseMessage] = useState<Record<string, string>>({});

  const applyEventData = useCallback(
    (data: {
      ok: boolean;
      accessState?: PlanAccessState;
      shareToken?: string;
      prefNote?: string[] | null;
      viewerUserId?: string | null;
      viewerEmail?: string | null;
      inviteeEmail?: string | null;
      shareLinkModalDismissed?: boolean;
      event: EventDetail;
      rsvps: RsvpEntry[];
      altTimes: AltTimeEntry[];
      invites: InviteEntry[];
      joinRequests: JoinRequest[];
    }) => {
      setEvent(data.event);
      if (data.accessState) setAccessState(data.accessState);
      if (data.shareToken) setShareToken(data.shareToken);
      setPrefNote(data.prefNote ?? null);
      setRsvps(data.rsvps);
      setAltTimes(data.altTimes);
      setInvites(data.invites ?? []);
      setJoinRequests(data.joinRequests ?? []);
      if (data.viewerUserId) setViewerUserId(data.viewerUserId);
      if (data.viewerEmail) setViewerEmail(data.viewerEmail);
      setInviteeEmail(data.inviteeEmail ?? null);
      if (data.shareLinkModalDismissed != null) setShareLinkModalDismissed(data.shareLinkModalDismissed);
      // Clear local confirmation override once server state arrives
      setLocalConfirmStatus(null);
    },
    []
  );

  const buildTokenSuffix = useCallback(() => {
    const tok = inviteTokenRef.current ?? shareTokenRef.current;
    if (!tok) return "";
    const key = inviteTokenRef.current ? "invite_token" : "share_token";
    return `?${key}=${encodeURIComponent(tok)}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch the auth token once up front so we can decide whether to send
      // authenticated requests without hitting /api/auth/api-token repeatedly
      // (each call produces a visible 401 console error for logged-out users).
      // The server has already resolved auth state via the
      // `isAuthenticatedFromServer` prop; when it's definitively false (no
      // session cookie), skip the token fetch entirely so the public plan
      // URL never fires a 401 against `/api/auth/api-token`.
      const authToken = isAuthenticatedFromServer === false
        ? null
        : await getAuthToken();
      const useAuth = !!authToken;

      // Email deep-links to auth-required sections (e.g. ?section=feedback in
      // the post-plan feedback email): if the visitor is logged out, route
      // them through /login first so they return to the correct plan and
      // section after signing in. This avoids hitting the public preview path
      // (which has no feedback form) or a "Plan not found" fallback.
      let sectionParam: string | null = null;
      try {
        sectionParam = new URL(window.location.href).searchParams.get("section");
      } catch {
        /* noop */
      }
      if (sectionParam && AUTH_REQUIRED_SECTIONS.includes(sectionParam)) {
        if (!authToken) {
          const target = `/events/${eventId}?section=${encodeURIComponent(sectionParam)}`;
          router.replace(`/login?next=${encodeURIComponent(target)}`);
          return;
        }
      }

      // When the visitor was deep-linked into the feedback section we already
      // know <PlanFeedback> will be rendered, so kick its data fetch off in
      // parallel with the event request. The result is handed to the child
      // via a prop so it can paint the form on first render instead of doing
      // a second round-trip and flickering content into view.
      const feedbackPromise =
        sectionParam === "feedback" && useAuth
          ? apiFetch(`/events/${eventId}/feedback`, { auth: true })
              .then(async (r) => (r.ok ? await r.json() : null))
              .catch(() => null)
          : Promise.resolve(null);

      const res = await apiFetch(`/events/${eventId}${buildTokenSuffix()}`, { auth: useAuth });
      if (!res.ok) {
        // Safety net: if the plan endpoint refuses for any reason and the
        // viewer was deep-linked to an auth-required section without a token,
        // still send them to login instead of "Plan not found".
        if (sectionParam && AUTH_REQUIRED_SECTIONS.includes(sectionParam) && !authToken) {
          const target = `/events/${eventId}?section=${encodeURIComponent(sectionParam)}`;
          router.replace(`/login?next=${encodeURIComponent(target)}`);
          return;
        }
        setError("Plan not found");
        setLoading(false);
        return;
      }
      const data = await res.json();
      // If the API returned "public" despite having a token, that token is
      // expired/invalid (or simply for a different plan). Clear it from
      // local state and storage so a stale value can't keep masking the
      // public-preview path. Same logic for invite_token and share_token.
      if (data.accessState === "public" && inviteTokenRef.current) {
        inviteTokenRef.current = null;
        try {
          localStorage.removeItem(`nc_inv_${eventId}`);
        } catch {
          /* noop */
        }
      }
      if (data.accessState === "public" && shareTokenRef.current) {
        shareTokenRef.current = null;
        try {
          localStorage.removeItem(`nc_share_${eventId}`);
        } catch {
          /* noop */
        }
      }
      applyEventData(data);
      setIsAuthenticated(useAuth);

      // Wait for the parallel feedback fetch (if any) before flipping
      // loading=false. This is the small delta that lets <PlanFeedback>
      // render its content on first paint instead of after a follow-up
      // round-trip, eliminating the form pop-in flicker on email links.
      if (sectionParam === "feedback") {
        try {
          const fb = await feedbackPromise;
          if (fb) setPrefetchedFeedback(fb);
        } catch {
          /* fall back to child-side fetch */
        }
      }
    } catch {
      setError("Failed to load plan");
    }
    setLoading(false);
  }, [eventId, applyEventData, buildTokenSuffix, router, isAuthenticatedFromServer]);

  const refresh = useCallback(async () => {
    try {
      // Same server-hint short-circuit as `load` above: definitively
      // logged-out viewers skip `getAuthToken()` so the public refresh
      // path doesn't fire a 401 against the auth-token endpoint.
      const authToken = isAuthenticatedFromServer === false
        ? null
        : await getAuthToken();
      const res = await apiFetch(`/events/${eventId}${buildTokenSuffix()}`, { auth: !!authToken });
      if (res.ok) {
        const data = await res.json();
        applyEventData(data);
      }
    } catch {
      /* silent */
    }
  }, [eventId, applyEventData, buildTokenSuffix, isAuthenticatedFromServer]);

  useEffect(() => {
    load();
  }, [load]);

  // Persistent invite token, survives for the component lifecycle so an
  // unauthenticated invitee can view the plan (including invite-only /
  // chums-only ones) and carry the invite context through the lightweight
  // signup flow. After signup + magic-link sign-in, the matching
  // event_invites row is adopted by their new user_id.
  // Initialized from URL so the first data fetch includes it.
  const inviteTokenRef = useRef<string | null>(searchParams.get("invite_token"));

  // Share token, from Copy Link share URLs. Grants view access to non-public
  // plans without an invite. RSVPing still requires authentication (via the
  // lightweight signup card shown to logged-out visitors).
  const shareTokenRef = useRef<string | null>(searchParams.get("share_token"));

  // Email link context hint (?context=host_review or ?context=request_approved)
  const [emailContext, setEmailContext] = useState<string | null>(null);

  // Deep-link to a section from email CTAs (?section=feedback|chat|availability|attendees)
  const pendingSectionRef = useRef<string | null>(null);

  // Auto-RSVP from email link (?rsvp=going&invite_token=xxx)
  const pendingRsvpRef = useRef<string | null>(null);
  useEffect(() => {
    const rsvpParam = searchParams.get("rsvp");
    const inviteTokenParam = searchParams.get("invite_token");
    const shareTokenParam = searchParams.get("share_token");
    const contextParam = searchParams.get("context");
    const sectionParam = searchParams.get("section");
    if (inviteTokenParam) {
      inviteTokenRef.current = inviteTokenParam;
      try {
        localStorage.setItem(`nc_inv_${eventId}`, JSON.stringify({ token: inviteTokenParam }));
      } catch {
        /* noop */
      }
    }
    if (shareTokenParam) {
      shareTokenRef.current = shareTokenParam;
      // Persist so the grant survives the lightweight-signup round-trip
      // (URL is cleaned a few lines below; without persistence the ref
      // would reset to null when the user returns after authenticating).
      try {
        localStorage.setItem(`nc_share_${eventId}`, JSON.stringify({ token: shareTokenParam }));
      } catch {
        /* noop */
      }
    }
    if (rsvpParam && VALID_RSVP_PARAMS.includes(rsvpParam as (typeof VALID_RSVP_PARAMS)[number])) {
      pendingRsvpRef.current = rsvpParam;
    }
    if (contextParam) setEmailContext(contextParam);
    if (sectionParam) pendingSectionRef.current = sectionParam;
    if (
      rsvpParam ||
      inviteTokenParam ||
      shareTokenParam ||
      contextParam ||
      sectionParam
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete("rsvp");
      url.searchParams.delete("invite_token");
      url.searchParams.delete("share_token");
      url.searchParams.delete("context");
      url.searchParams.delete("section");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams]);

  // Section deep-linking: scroll or show login nudge
  const [sectionLoginNudge, setSectionLoginNudge] = useState<string | null>(null);
  useEffect(() => {
    if (!event || !pendingSectionRef.current) return;
    const section = pendingSectionRef.current;
    pendingSectionRef.current = null;
    if (AUTH_REQUIRED_SECTIONS.includes(section) && isAuthenticated === false) {
      setSectionLoginNudge(section);
      return;
    }
    const sectionId = `plan-section-${section}`;
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, isAuthenticated]);

  useEffect(() => {
    if (!event || !pendingRsvpRef.current) return;
    if (event.status === "canceled") {
      pendingRsvpRef.current = null;
      return;
    }
    const rsvpStatus = pendingRsvpRef.current;

    // All RSVPs require authentication post-guest-removal. Two cases:
    //   1. Viewer is already logged in → fire the RSVP automatically so the
    //      "Going" button from the invite email lands immediately.
    //   2. Viewer is logged out → do nothing here. Leave the pending status
    //      in `pendingRsvpRef` so the lightweight-signup card (rendered
    //      below when isAuthenticated === false) can fold the `?rsvp=...`
    //      back into its magic-link `next` URL. After the magic-link click
    //      returns the user to `/events/[id]?invite_token=...&rsvp=...` as
    //      an authenticated user, this effect re-fires via the fresh
    //      searchParams and runs the authenticated branch. No redirect to
    //      /login, that was the pre-guest-removal path and it flickered
    //      the plan page away from invitees who don't yet have an account.
    getAuthToken().then((token) => {
      if (token) {
        pendingRsvpRef.current = null;
        handleRsvp(rsvpStatus);
        // Focus the RSVP / "You're going" confirmation card so the user
        // lands directly on their response state rather than at the top
        // of the plan. Matches the deep-link behaviour of ?section=... on
        // other transactional emails (24h check, feedback, chat).
        requestAnimationFrame(() => {
          setTimeout(() => {
            document
              .getElementById("plan-section-confirmation")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        });
      }
      // else: keep pendingRsvpRef set; the signup card reads it below.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  // Invite search
  useEffect(() => {
    if (!showInviteForm) return;
    const q = inviteSearch.trim();
    setSearchResults([]);
    setHasSearched(false);
    if (q.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/chums/search?q=${encodeURIComponent(q)}`, { auth: true });
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; users?: SearchResult[] };
          setSearchResults(data.users ?? []);
        }
      } catch {
        /* ignore */
      }
      setSearching(false);
      setHasSearched(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteSearch, showInviteForm]);

  // --- Chat helpers ---
  const [chatAccessible, setChatAccessible] = useState<boolean | null>(null);
  // Chat access: host or "going" RSVP only (API rejects maybe/cant_make_it)
  const chatEligible = !!event && event.status !== "canceled" && (
    event.isHost || (viewerUserId ? rsvps.some((r) => r.userId === viewerUserId && r.status === "going") : false)
  );
  const wsRef = useRef<WebSocket | null>(null);

  const markChatRead = useCallback(async () => {
    try {
      await apiFetch(`/events/${eventId}/chat/read`, { auth: true, method: "POST" });
      setChatLastReadAt(new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, [eventId]);

  const loadChat = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/chat`, { auth: true });
      if (res.status === 403 || res.status === 404) {
        setChatAccessible(false);
        setChatLoading(false);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        messages: ChatMessage[];
        lastReadAt: string | null;
      };
      if (data.ok) {
        setChatAccessible(true);
        setChatMessages(data.messages);
        setChatLastReadAt(data.lastReadAt);
      }
    } catch {
      /* ignore */
    }
    setChatLoading(false);
  }, [eventId]);

  // WebSocket connection with reconnection + polling fallback
  useEffect(() => {
    if (!chatEligible) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectDelay = WS_RECONNECT_BASE;
    let disposed = false;

    const stopFallbackPolling = () => {
      if (fallbackPollTimer) {
        clearInterval(fallbackPollTimer);
        fallbackPollTimer = null;
      }
    };

    const startFallbackPolling = () => {
      stopFallbackPolling();
      fallbackPollTimer = setInterval(loadChat, WS_FALLBACK_POLL_INTERVAL);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      reconnectTimer = setTimeout(() => {
        if (!disposed) connect();
      }, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, WS_RECONNECT_MAX);
    };

    const connect = async () => {
      if (disposed) return;
      try {
        const token = await getAuthToken();
        if (!token || disposed) {
          startFallbackPolling();
          return;
        }

        const url = getChatWebSocketUrl(eventId, token);
        ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectDelay = WS_RECONNECT_BASE;
          stopFallbackPolling();
          loadChat();
        };

        ws.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data) as { type: string; message: ChatMessage };
            if (data.type === "chat_message" && data.message) {
              setChatMessages((prev) => {
                if (prev.some((m) => m.id === data.message.id)) return prev;
                return [...prev, data.message];
              });
              markChatRead();
            }
          } catch {
            /* ignore malformed messages */
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!disposed) {
            startFallbackPolling();
            scheduleReconnect();
          }
        };

        ws.onerror = () => {
          // onclose will fire after onerror, so reconnect is handled there
        };
      } catch {
        startFallbackPolling();
        scheduleReconnect();
      }
    };

    // Initial load via REST (gets history + sets chatAccessible), then open WebSocket
    loadChat().then(() => {
      if (!disposed) connect();
    });

    // When the user returns to a tab that was idle, the WS may have disconnected and the
    // backoff timer may be sitting at its max delay. Skip the wait, clear the stale token
    // cache, and reconnect immediately so the chat works right away.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || disposed) return;
      // Cancel any pending backoff timer so we don't double-connect
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      // Close any half-open socket before reconnecting
      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.onclose = null;
        ws.close();
        ws = null;
        wsRef.current = null;
      }
      // Reset backoff and force a fresh token on next connect()
      reconnectDelay = WS_RECONNECT_BASE;
      clearAuthTokenCache();
      connect();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      stopFallbackPolling();
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatEligible, eventId]);

  const prevChatLenRef = useRef(0);
  useEffect(() => {
    if (chatMessages.length > prevChatLenRef.current && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
    prevChatLenRef.current = chatMessages.length;
    if (chatAccessible && chatMessages.length > 0) {
      markChatRead();
    }
  }, [chatMessages.length, chatAccessible, markChatRead]);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatSending(true);
    try {
      const res = await apiFetch(`/events/${eventId}/chat`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json()) as { ok: boolean; message?: ChatMessage };
      if (data.ok) {
        setChatInput("");
        notifyObjectivesChanged();
        // Message will arrive via WebSocket broadcast.
        // If WebSocket is disconnected, append locally as fallback.
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (data.message) {
            setChatMessages((prev) => {
              if (prev.some((m) => m.id === data.message!.id)) return prev;
              return [...prev, data.message!];
            });
          }
        }
      }
    } catch {
      /* ignore */
    }
    setChatSending(false);
  };

  const performLockToggle = async () => {
    setLockToggling(true);
    try {
      const res = await apiFetch(`/events/${eventId}/lock`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok: boolean; locked: boolean };
      if (data.ok) {
        setEvent((prev) =>
          prev ? { ...prev, lockedAt: data.locked ? new Date().toISOString() : null } : prev
        );
        toast.success(data.locked ? "Plan locked" : "Plan unlocked");
        setLockDialogOpen(false);
      }
    } catch {
      toast.error("Failed to update lock status");
    }
    setLockToggling(false);
  };

  const [inviteMessage, setInviteMessage] = useState("");

  const handleInvite = async (userId?: string, email?: string) => {
    setInviteSubmitting(true);
    setInvitingUserId(userId ?? null);
    try {
      const res = await apiFetch(`/events/${eventId}/invite`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitees: [{ user_id: userId ?? null, email: email ?? null }],
          message: inviteMessage || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        added?: number;
        alreadyInvited?: number;
      };
      if (data.ok) {
        // Single-invitee call: distinguish "actually invited" from "the API
        // recognized this person was already on the invite list and skipped
        // them" so the inviter knows nothing is broken when the second toast
        // appears.
        if ((data.added ?? 0) === 0 && (data.alreadyInvited ?? 0) > 0) {
          toast.info("This person is already invited to this plan");
        } else {
          toast.success("Invite sent!");
        }
        setInviteSearch("");
        setInviteMessage("");
        setSearchResults([]);
        setHasSearched(false);
        // Update the invited list locally without a full page reload. Even
        // when the server reported alreadyInvited we still want the row to
        // appear in the local state if it was missing (e.g. because the
        // initial fetch raced ahead of an attendee-sent invite).
        const match = userId ? searchResults.find((r) => r.userId === userId) : undefined;
        const name = match?.displayName ?? email ?? "Invited user";
        const handle = match?.handle ?? null;
        setInvites((prev) => {
          if (prev.some((i) => (userId ? i.userId === userId : i.email === email))) return prev;
          return [...prev, { userId: userId ?? null, email: email ?? null, name, handle }];
        });
      } else {
        toast.error(data.message ?? "Failed to send invite");
      }
    } catch {
      toast.error("Network error");
    }
    setInviteSubmitting(false);
    setInvitingUserId(null);
  };

  const handleRsvp = async (status: string) => {
    setRsvpSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          // Pass through whichever access token brought the viewer here so the
          // server's invite-only gate can confirm legitimate access even when
          // GET-side adoption hasn't run (or didn't link the row, e.g. a
          // post-signup email mismatch).
          ...(shareTokenRef.current ? { share_token: shareTokenRef.current } : {}),
          ...(inviteTokenRef.current ? { invite_token: inviteTokenRef.current } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        status?: string;
      };
      if (data.ok) {
        toast.success(
          status === "going"
            ? "You're going!"
            : status === "maybe"
              ? "Marked as maybe"
              : "Response recorded"
        );
        notifyObjectivesChanged();
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
  };

  const handleConfirmAction = async (action: "confirm" | "decline") => {
    setConfirmSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/confirm`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        setLocalConfirmStatus(action === "confirm" ? "confirmed" : "declined");
        toast.success(action === "confirm" ? "Attendance confirmed!" : "Response recorded");
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setConfirmSubmitting(false);
  };

  const openRsvpDialog = (status: string) => {
    setRsvpDialogStatus(status);
    setRsvpDialogMessage("");
    setRsvpDialogOpen(true);
  };

  const handleRsvpConfirm = async () => {
    const status = rsvpDialogStatus;
    const note = rsvpDialogMessage.trim() || null;
    setRsvpDialogOpen(false);
    setRsvpSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/rsvp`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          note,
          // Mirrors handleRsvp: pass through the invite/share token so the
          // server can verify legitimate access without requiring GET-side
          // adoption to have linked the user yet.
          ...(shareTokenRef.current ? { share_token: shareTokenRef.current } : {}),
          ...(inviteTokenRef.current ? { invite_token: inviteTokenRef.current } : {}),
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        message?: string;
        status?: string;
      };
      if (data.ok) {
        toast.success(
          status === "going"
            ? "You're going!"
            : status === "maybe"
              ? "Marked as maybe"
              : "Response recorded"
        );
        refresh();
      } else if (data.error === "EVENT_LOCKED") {
        toast.error("This plan is locked and not accepting new participants");
      } else if (data.error === "APPROVAL_REQUIRED") {
        toast.error('This plan requires host approval, use "Request to join" instead');
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
    setRsvpDialogMessage("");
  };

  const handleJoinRequest = async () => {
    setJoinRequestSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/join-request`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: joinRequestMessage.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        toast.success("Request sent! The host will review it.");
        setJoinRequestMessage("");
        refresh();
      } else if (data.error === "DUPLICATE_REQUEST") {
        toast.error("You already have a pending request for this plan");
      } else if (data.error === "EVENT_LOCKED") {
        toast.error("This plan is locked and not accepting new participants");
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setJoinRequestSubmitting(false);
  };

  const handleWithdrawRequest = async (requestId: string) => {
    setWithdrawSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/join-request/${requestId}/withdraw`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        toast.success("Request withdrawn");
        setWithdrawConfirmId(null);
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setWithdrawSubmitting(false);
  };

  const handleApproveRequest = async (requestId: string) => {
    setApproveDeclineLoading(requestId);
    try {
      const res = await apiFetch(`/events/${eventId}/join-request/${requestId}/approve`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: hostResponseMessage[requestId]?.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        toast.success("Request approved, they've been added as Going");
        setHostResponseMessage((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        refresh();
      } else if (data.error === "EVENT_FULL") {
        toast.error("This plan is full, cannot approve more participants");
      } else {
        toast.error(data.message ?? "Failed to approve");
      }
    } catch {
      toast.error("Network error");
    }
    setApproveDeclineLoading(null);
  };

  const handleDeclineRequest = async (requestId: string) => {
    setApproveDeclineLoading(requestId);
    try {
      const res = await apiFetch(`/events/${eventId}/join-request/${requestId}/decline`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: hostResponseMessage[requestId]?.trim() || null }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        toast.success("Request declined");
        setHostResponseMessage((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        refresh();
      } else {
        toast.error(data.message ?? "Failed to decline");
      }
    } catch {
      toast.error("Network error");
    }
    setApproveDeclineLoading(null);
  };

  const [quickConfirming, setQuickConfirming] = useState(false);

  const handleQuickConfirm = async () => {
    if (!event) return;
    setQuickConfirming(true);
    try {
      const res = await apiFetch(`/events/${eventId}/alt-time`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggested_at: event.startsAt }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Response recorded!");
        refresh();
      } else {
        toast.error(data.message ?? "Error");
      }
    } catch {
      toast.error("Network error");
    }
    setQuickConfirming(false);
  };

  const resetAltEditForm = () => {
    setAltEditDate(null);
    setAltEditStartTime(null);
    setAltEditEndTime(null);
    setAltEditAnytime(false);
    setAltEditingId(null);
  };

  /**
   * Send one POST per selected date. "Start anytime" is encoded as a 24h
   * window from local-midnight to next-day local-midnight, which is a valid
   * payload under the existing API contract and renders cleanly in the
   * existing list/overlap logic. A range passes start/end as-is. A single
   * filled time is sent as a point-in-time entry (ends_at: null).
   */
  const handleAvailabilityShare = async (entries: AvailabilitySelection[]) => {
    if (entries.length === 0 || !event) return;
    setAltSubmitting(true);
    let created = 0;
    try {
      for (const entry of entries) {
        const day = entry.date.startOf("day");
        const atTimeOnDay = (t: import("dayjs").Dayjs) =>
          day.hour(t.hour()).minute(t.minute()).second(0).millisecond(0).toISOString();
        let suggestedAt: string;
        let endsAt: string | null;
        if (entry.start && entry.end) {
          suggestedAt = atTimeOnDay(entry.start);
          endsAt = atTimeOnDay(entry.end);
        } else if (entry.start) {
          suggestedAt = atTimeOnDay(entry.start);
          endsAt = null;
        } else {
          suggestedAt = day.toISOString();
          endsAt = day.add(1, "day").toISOString();
        }
        const res = await apiFetch(`/events/${eventId}/alt-time`, {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggested_at: suggestedAt, ends_at: endsAt }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        if (!data.ok) {
          toast.error(data.message ?? "Error");
          break;
        }
        created++;
      }
      if (created > 0) {
        const addedLabel =
          event.altTimesMode === "availability" ? "Availability" : "Alternate time";
        toast.success(
          created === 1
            ? `${addedLabel} shared`
            : `${created} ${addedLabel.toLowerCase()} entries shared`
        );
        // Await the refresh so the picker's parent has the new entries
        // committed before AvailabilityPicker.submit clears its selection;
        // otherwise the empty-state caption flickers in for one render.
        await refresh();
      }
    } catch {
      toast.error("Network error");
    }
    setAltSubmitting(false);
  };

  const handleAltEditSave = async () => {
    if (!altEditingId || !altEditDate) return;
    if (!altEditAnytime && !altEditStartTime) {
      toast.error("Pick an earliest start, or switch to Anytime");
      return;
    }
    if (
      !altEditAnytime &&
      altEditStartTime &&
      altEditEndTime &&
      altEditEndTime.hour() * 60 + altEditEndTime.minute() <=
        altEditStartTime.hour() * 60 + altEditStartTime.minute()
    ) {
      toast.error("Latest start must be after earliest start");
      return;
    }
    setAltSubmitting(true);
    try {
      const day = altEditDate.startOf("day");
      const atTimeOnDay = (t: import("dayjs").Dayjs) =>
        day.hour(t.hour()).minute(t.minute()).second(0).millisecond(0).toISOString();
      let suggestedAt: string;
      let endsAt: string | null;
      if (altEditAnytime) {
        suggestedAt = day.toISOString();
        endsAt = day.add(1, "day").toISOString();
      } else if (altEditStartTime && altEditEndTime) {
        suggestedAt = atTimeOnDay(altEditStartTime);
        endsAt = atTimeOnDay(altEditEndTime);
      } else {
        suggestedAt = atTimeOnDay(altEditStartTime!);
        endsAt = null;
      }
      const res = await apiFetch(`/events/${eventId}/alt-time/${altEditingId}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggested_at: suggestedAt, ends_at: endsAt }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success(
          event?.altTimesMode === "availability" ? "Availability updated" : "Alternate time updated"
        );
        resetAltEditForm();
        refresh();
      } else toast.error(data.message ?? "Error");
    } catch {
      toast.error("Network error");
    }
    setAltSubmitting(false);
  };

  const handleAltTimeDelete = async (id: string) => {
    setAltDeleting(id);
    try {
      const res = await apiFetch(`/events/${eventId}/alt-time/${id}`, {
        auth: true,
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        toast.success(
          event?.altTimesMode === "availability" ? "Availability removed" : "Alternate time removed"
        );
        refresh();
      } else toast.error("Could not remove");
    } catch {
      toast.error("Network error");
    }
    setAltDeleting(null);
  };

  const handleAltTimeEdit = (entry: AltTimeEntry) => {
    const start = dayjs(entry.suggestedAt);
    const end = entry.endsAt ? dayjs(entry.endsAt) : null;
    const isAnytime = !!end && end.diff(start, "hour", true) >= 23;
    setAltEditDate(start.startOf("day"));
    setAltEditAnytime(isAnytime);
    setAltEditStartTime(isAnytime ? null : start);
    setAltEditEndTime(isAnytime ? null : end);
    setAltEditingId(entry.id);
    // Scroll handled by an effect on altEditingId so the form has mounted
    // before we scrollIntoView; the previous scrollTo({top:0}) was a no-op
    // because the wrapper Box is not a scroll container.
  };

  // Scroll the inline edit form into view when entering edit mode. Without
  // this the form mounts above the entries list and the user often misses
  // that anything happened, especially on mobile.
  useEffect(() => {
    if (!altEditingId) return;
    const el = altEditFormRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [altEditingId]);

  const handlePromoteAltTime = async () => {
    if (!promoteConfirmTime) return;
    setPromoting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/promote-alt-time`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starts_at: promoteConfirmTime }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Plan time updated");
        setPromoteConfirmTime(null);
        refresh();
      } else toast.error(data.message ?? "Error");
    } catch {
      toast.error("Network error");
    }
    setPromoting(false);
  };

  const handleCancelConfirm = async () => {
    setCanceling(true);
    try {
      const res = await apiFetch(`/events/${eventId}/cancel`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setCancelDialogOpen(false);
        toast.success("Plan canceled");
        refresh();
      } else {
        toast.error("Couldn't cancel. Please try again.");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setCanceling(false);
    }
  };

  const handleRemoveAttendee = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const endpoint =
        removeTarget.type === "invite"
          ? `/events/${eventId}/remove-invite`
          : `/events/${eventId}/remove-attendee`;
      const body =
        removeTarget.type === "invite"
          ? {
              user_id: removeTarget.userId,
              email: removeTarget.email,
              reason: removeReason.trim() || null,
            }
          : { user_id: removeTarget.userId, reason: removeReason.trim() || null };
      const res = await apiFetch(endpoint, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        if (removeTarget.type === "rsvp") {
          setRsvps((prev) => prev.filter((r) => r.userId !== removeTarget.userId));
        } else {
          setInvites((prev) =>
            prev.filter((inv) =>
              removeTarget.userId
                ? inv.userId !== removeTarget.userId
                : inv.email !== removeTarget.email
            )
          );
        }
        setRemoveDialogOpen(false);
        setRemoveTarget(null);
        setRemoveReason("");
        toast.success(removeTarget.type === "invite" ? "Invite removed" : "Attendee removed");
      } else {
        toast.error("Couldn't remove this person. Please try again.");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRemoving(false);
    }
  };

  // Toggle save/remove chum from the attendee overflow menu
  const handleToggleChum = async (r: RsvpEntry) => {
    if (!viewerUserId || r.userId === viewerUserId) return;
    setChumToggling(true);
    try {
      if (r.isChumSaved) {
        // Remove chum, DELETE /chums/:userId removes by linked_user_id
        const res = await apiFetch(`/chums/${r.userId}`, { auth: true, method: "DELETE" });
        const data = (await res.json()) as { ok: boolean };
        if (data.ok) {
          setRsvps((prev) => prev.map((x) => x.userId === r.userId ? { ...x, isChumSaved: false } : x));
          toast.success("Removed from Chums");
        } else {
          toast.error("Couldn't update Chums. Please try again.");
        }
      } else {
        // Add to Chums, POST /chums/:userId
        const res = await apiFetch(`/chums/${r.userId}`, { auth: true, method: "POST" });
        const data = (await res.json()) as { ok: boolean };
        if (data.ok) {
          setRsvps((prev) => prev.map((x) => x.userId === r.userId ? { ...x, isChumSaved: true } : x));
          toast.success("Added to Chums");
          notifyObjectivesChanged();
        } else {
          toast.error("Couldn't update Chums. Please try again.");
        }
      }
    } catch {
      toast.error("Network error");
    } finally {
      setChumToggling(false);
      setAttendeeMenuAnchor(null);
      setAttendeeMenuTarget(null);
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
            {error ?? "We couldn't find that plan"}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            It may have been removed, the link might be incorrect, or you may not
            have access to it.
          </Typography>
        </Stack>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          justifyContent="center"
          alignItems="center"
        >
          <AppButton onClick={() => router.push("/")} startIcon={<ArrowBackRoundedIcon />}>
            Back to home
          </AppButton>
          {isAuthenticated === false && (
            <AppButton
              variant="outlined"
              onClick={() => router.push("/login?next=/")}
            >
              Sign in
            </AppButton>
          )}
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

  // --- Public access view ---
  // Limited preview for anonymous visitors with no invite/participation token.
  if (accessState === "public") {
    const pubGoingCount = event.goingCount ?? 0;
    const pubMaybeCount = event.maybeCount ?? 0;
    const pubIsCanceled = event.status === "canceled";
    const pubIsPast = new Date(event.startsAt) < new Date();
    const pubBannerBase = bannerUseFallback
      ? (getImageFallbackBaseUrl() ?? getAvatarBaseUrl())
      : getAvatarBaseUrl();
    const pubBannerSrc = event.bannerKey
      ? `${pubBannerBase}/events/${event.id}/banner?v=${Date.now()}`
      : null;
    const pubBannerUrl = pubBannerSrc && !bannerFailed ? pubBannerSrc : null;
    const pubHobbies =
      event.hobbies?.length > 0
        ? event.hobbies
        : event.hobby
          ? [{ name: event.hobby, slug: event.hobbySlug ?? "" }]
          : [];

    const pubLocationDisplay =
      event.locationDisplay ??
      (event.locationType === "online" ? event.onlineLink || "Online" : "TBD");

    return (
      <Stack spacing={{ xs: 3, sm: 4 }}>
        {pubBannerUrl && (
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
              src={pubBannerUrl}
              alt={`${event.title} banner`}
              onError={handleBannerError}
              sx={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Box>
        )}

        {/* Hero header. Adapts the Participant hero card pattern from
            `docs/UI_Patterns.md` (gradient wash + primary.light border)
            to an event-level hero: title, hobby chips, host / community
            line. Gives the page a confident top section rather than a
            bare stack of text, matching the warmth the logged-in view
            carries via its attendee and chat cards. */}
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            borderColor: "primary.light",
            p: { xs: 2.5, sm: 3 },
            backgroundImage: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          }}
        >
          {pubHobbies.length > 0 && (
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 1.25, gap: 0.75 }}
            >
              {pubHobbies.map((h) => (
                <Chip
                  key={h.slug}
                  label={h.name}
                  size="small"
                  sx={{
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    height: 24,
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    border: "1px solid",
                    borderColor: "primary.light",
                  }}
                />
              ))}
            </Stack>
          )}
          <Typography
            variant="h4"
            component="h1"
            fontWeight={700}
            sx={{ mb: 0.75, lineHeight: 1.15, letterSpacing: "-0.01em" }}
          >
            {event.title}
          </Typography>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ columnGap: 0.75, rowGap: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              Hosted by <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{event.hostName}</Box>
            </Typography>
            {event.communities && event.communities.length > 0 && (
              <>
                <Typography variant="body2" color="text.disabled">·</Typography>
                {event.communities.map((c) => (
                  <Chip
                    key={c.id}
                    label={c.name}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 22,
                      fontSize: "0.6875rem",
                      fontWeight: 500,
                      borderRadius: 1.5,
                      borderColor: "divider",
                      color: "text.secondary",
                      cursor: "pointer",
                      "&:hover": { borderColor: "primary.main", color: "primary.main" },
                    }}
                    onClick={() => router.push(`/communities/${c.slug}`)}
                  />
                ))}
              </>
            )}
          </Stack>
        </Paper>

        {pubIsCanceled && (
          <Paper
            variant="outlined"
            sx={{ p: 2, borderColor: "error.main", borderRadius: 2.5, bgcolor: "error.50" }}
          >
            <Typography variant="subtitle2" color="error.main" fontWeight={600}>
              This plan has been canceled
            </Typography>
            {event.cancellationReason === "min_attendees_not_met" && (
              <Typography variant="body2" color="error.main" sx={{ mt: 0.5, opacity: 0.85 }}>
                The minimum number of confirmed attendees wasn&apos;t reached.
              </Typography>
            )}
            {event.cancellationReason === "no_attendees" && (
              <Typography variant="body2" color="error.main" sx={{ mt: 0.5, opacity: 0.85 }}>
                No one else was able to join this time around.
              </Typography>
            )}
          </Paper>
        )}

        {/* Overview card. Icons sit inside small primary-tinted badges so
            the meta rows have a consistent anchor on the left and read as
            "at a glance" items, not a bulleted list. Description gets its
            own subtle divider for a sharper hierarchy. */}
        <AppCard>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
              </Box>
              <Typography variant="body1" fontWeight={500}>{formatDateTime(event.startsAt)}</Typography>
            </Stack>
            {event.locationType === "in_person" && (
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    mt: "2px",
                  }}
                >
                  <PlaceRoundedIcon sx={{ fontSize: 18 }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body1" fontWeight={500}>{pubLocationDisplay}</Typography>
                  {event.locationArea && (
                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                      <LockOutlinedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                      <Typography variant="caption" color="text.secondary">
                        Approximate area shown. Sign in to see the exact address.
                      </Typography>
                    </Stack>
                  )}
                </Box>
              </Stack>
            )}
            {event.locationType === "online" && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <LinkRoundedIcon sx={{ fontSize: 18 }} />
                </Box>
                {event.onlineLink?.trim() ? (
                  <MuiLink
                    href={normalizeMeetingLinkHref(event.onlineLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body1"
                    sx={{ wordBreak: "break-word", fontWeight: 500 }}
                  >
                    {pubLocationDisplay}
                  </MuiLink>
                ) : (
                  <Typography variant="body1" fontWeight={500}>{pubLocationDisplay}</Typography>
                )}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <PeopleOutlineRoundedIcon sx={{ fontSize: 18 }} />
              </Box>
              <Typography variant="body1" fontWeight={500}>
                {pubGoingCount} going{pubMaybeCount > 0 ? ` · ${pubMaybeCount} maybe` : ""}
                {event.maxSeats != null ? ` · ${event.maxSeats} max` : ""}
              </Typography>
            </Stack>
            {event.description && (
              <>
                <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
                <RichTextContent html={event.description} size="body2" />
              </>
            )}
          </Stack>
        </AppCard>

        {/* Approximate-area map for in-person plans. We only show this when
            the host has a real approximate area; the iframe pins a
            neighbourhood-level search rather than coords, so the exact
            venue is never revealed. The header row and lock-tagged
            caption give the card its own identity so it doesn't read as
            an anonymous iframe dropped onto the page. */}
        {event.locationType === "in_person" &&
          event.locationArea &&
          process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
            <AppCard sx={{ p: 0, overflow: "hidden" }}>
              <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <PlaceRoundedIcon sx={{ fontSize: 18, color: "primary.dark" }} />
                  <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: "0.875rem" }}>
                    Around the plan
                  </Typography>
                </Stack>
              </Box>
              <Box
                component="iframe"
                src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(event.locationArea)}&zoom=13`}
                title="Approximate event area"
                sx={{
                  width: "100%",
                  height: 240,
                  border: "none",
                  display: "block",
                }}
              />
              <Box
                sx={{
                  px: { xs: 2, sm: 2.5 },
                  py: 1.25,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  bgcolor: "grey.50",
                }}
              >
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
                  <LockOutlinedIcon sx={{ fontSize: 13, color: "text.disabled" }} />
                  <Typography variant="caption" color="text.secondary">
                    Neighbourhood only, exact venue shared after sign-in.
                  </Typography>
                </Stack>
              </Box>
            </AppCard>
          )}

        {/* Anonymized "Who's in" preview. Drives the count + a handful of
            role-labelled rows purely off `goingCount`, which is already
            a public field. No handles, names, avatars, or profile links
            are exposed; the rows deliberately read as a gated preview
            ("Host", "Attendee 1", ...) rather than a censored list with
            blurred identities.
            Avatars get the white-ring + soft-shadow treatment from the
            Participant hero card so the module feels human, the host
            avatar gets a deeper primary tint so it reads as the plan
            owner at a glance, and the sign-in hint sits in a soft well
            inside the card so it feels like a signed footer rather than
            a floating caption. */}
        {!pubIsCanceled && (() => {
          const pubMaxRows = 5;
          const pubExtraVisible = Math.max(0, Math.min(pubGoingCount, pubMaxRows - 1));
          const pubOverflow = Math.max(0, pubGoingCount - pubExtraVisible);
          return (
            <AppCard>
              <Stack spacing={2}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <GroupsRoundedIcon sx={{ fontSize: 20, color: "primary.dark" }} />
                    <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
                      Who&apos;s in
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
                    {pubGoingCount} going{pubMaybeCount > 0 ? ` · ${pubMaybeCount} maybe` : ""}
                  </Typography>
                </Stack>

                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Avatar
                      sx={{
                        width: 40,
                        height: 40,
                        bgcolor: "primary.light",
                        color: "primary.dark",
                        border: "2px solid #fff",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    >
                      <PersonRoundedIcon sx={{ fontSize: 22 }} />
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Host
                      </Typography>
                    </Box>
                    <Chip
                      label="Host"
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        borderRadius: 1,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                      }}
                    />
                  </Stack>

                  {Array.from({ length: pubExtraVisible }).map((_, i) => (
                    <Stack key={i} direction="row" spacing={1.5} alignItems="center">
                      <Avatar
                        sx={{
                          width: 40,
                          height: 40,
                          bgcolor: "grey.100",
                          color: "text.disabled",
                          border: "2px solid #fff",
                          boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                        }}
                      >
                        <PersonRoundedIcon sx={{ fontSize: 22 }} />
                      </Avatar>
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                        Attendee {i + 1}
                      </Typography>
                    </Stack>
                  ))}

                  {pubGoingCount === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ pl: 7 }}>
                      No one else has RSVP&apos;d yet. Be the first.
                    </Typography>
                  )}

                  {pubOverflow > 0 && (
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 7, fontWeight: 500 }}>
                      +{pubOverflow} more going
                    </Typography>
                  )}
                </Stack>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.5,
                    py: 1,
                    borderRadius: 2,
                    bgcolor: "grey.50",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <LockOutlinedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                    Sign in to see who&apos;s going, message attendees, and RSVP.
                  </Typography>
                </Box>
              </Stack>
            </AppCard>
          );
        })()}

        {/* Locked "Suggest a different time" preview. Shaped as a feature
            preview (icon badge + Preview chip + explainer + gated CTA)
            rather than a disabled module so a logged-out visitor can see
            this is a real capability the product offers, not an empty
            state. Hidden for canceled or past plans, and for plans where
            the host has disabled alternate-time suggestions, since
            advertising the feature on those plans would be misleading. */}
        {!pubIsCanceled && !pubIsPast && event.allowAltTimes && (
          <AppCard>
            <Stack spacing={1.75}>
              <Stack direction="row" spacing={1.75} alignItems="center">
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    bgcolor: "primary.light",
                    color: "primary.dark",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <ScheduleRoundedIcon sx={{ fontSize: 22 }} />
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
                    Can&apos;t make this time?
                  </Typography>
                  <Chip
                    label="Preview"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      borderRadius: 1,
                      bgcolor: "grey.100",
                      color: "text.secondary",
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  />
                </Stack>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Members can suggest alternative times that work better for them. Sign in to propose a new time, or RSVP as &quot;maybe&quot; to keep the host in the loop.
              </Typography>
            </Stack>
          </AppCard>
        )}

        {/* Final CTA. Uses the same warm gradient + primary.light border
            as the top hero so the page opens and closes with the same
            visual weight. Icon badge on the left matches the community
            nudge pattern on the logged-in communities page. */}
        {!pubIsCanceled && !pubIsPast && (
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              borderColor: "primary.light",
              p: { xs: 2.5, sm: 3 },
              backgroundImage: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "flex-start", sm: "center" },
              gap: { xs: 2, sm: 2.5 },
            }}
          >
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                boxShadow: "0 2px 10px rgba(234, 88, 12, 0.25)",
              }}
            >
              <GroupsRoundedIcon sx={{ fontSize: 26 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5, fontSize: "1.0625rem" }}>
                Interested in this plan?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {event.requireApproval
                  ? "Sign in or create a free account to request to join this plan."
                  : "Sign in or create a free account to RSVP, chat with attendees, and get updates."}
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "row", sm: "row" }}
              spacing={1}
              sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
            >
              <Button
                component={Link}
                href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
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
                Sign in
              </Button>
              <Button
                component={Link}
                href={`/signup?next=${encodeURIComponent(`/events/${eventId}`)}`}
                variant="outlined"
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  flex: { xs: 1, sm: "0 0 auto" },
                }}
              >
                Create an account
              </Button>
            </Stack>
          </Paper>
        )}
      </Stack>
    );
  }

  const goingCount = rsvps.filter((r) => r.status === "going").length;
  const maybeCount = rsvps.filter((r) => r.status === "maybe").length;
  const declinedCount = rsvps.filter((r) => r.status === "cant_make_it").length;
  const isCanceled = event.status === "canceled";
  const isPast = new Date(event.startsAt) < new Date();
  const isEditLocked = new Date(event.startsAt).getTime() + 60 * 60 * 1000 < Date.now();
  const chatLockDate = new Date(new Date(event.startsAt).getTime() + 3 * 24 * 60 * 60 * 1000);
  const isChatLocked = isPast && Date.now() >= chatLockDate.getTime();

  // Invitees who haven't RSVP'd yet (shown with "Invited" status in Who's in).
  // Visible to all participants (host, attendees, anyone with plan access)
  // so that an invite sent by an attendee shows up for the rest of the
  // group too, not just for the host. The set is the same regardless of
  // who created each invite; we no longer narrow by `invited_by` on the
  // client. Server-side access control on GET /events/:id is what
  // determines whether the viewer can see the plan at all.
  const rsvpUserIds = new Set(rsvps.map((r) => r.userId));
  const pendingInvites = invites.filter((inv) => inv.userId && !rsvpUserIds.has(inv.userId));
  // Reserved seats: pending invites + maybe RSVPs from invitees (maybe RSVPs
  // already appear in the RSVP list but their seat stays held when reserve_seats is on)
  const maybeInviteeCount = event.reserveSeats
    ? rsvps.filter((r) => r.status === "maybe" && invites.some((inv) => inv.userId === r.userId))
        .length
    : 0;
  const reservedSeatCount = event.reserveSeats ? pendingInvites.length + maybeInviteeCount : 0;
  const isFull = event.maxSeats != null && goingCount + reservedSeatCount >= event.maxSeats;

  // Request-to-join derived state
  const userJoinRequest = !event.isHost && joinRequests.length > 0 ? joinRequests[0] : null;
  const pendingJoinRequests = event.isHost
    ? joinRequests.filter((jr) => jr.status === "pending")
    : [];
  // Effective confirmation status: local override (immediate) takes priority over server state
  const effectiveConfirmStatus = localConfirmStatus ?? event.myConfirmationStatus;

  // Invite-only gate: logged-in users who are not invited and don't have a share/invite token
  // cannot RSVP. They see an informational message instead of RSVP buttons.
  const showInviteOnlyGate =
    event.visibility === "invite_only" &&
    !event.isHost &&
    !event.isInvited &&
    !event.hasRsvp &&
    !shareTokenRef.current &&
    isAuthenticated !== false;

  // Show request-to-join CTA instead of RSVP buttons when approval is required,
  // user is not the host, not invited, and has no existing RSVP.
  // Unauthenticated share-link visitors see the lightweight signup card instead.
  const showRequestToJoin =
    !showInviteOnlyGate &&
    event.requireApproval &&
    !event.isHost &&
    !event.isInvited &&
    !event.hasRsvp &&
    !shareTokenRef.current;

  const viewerRsvp = viewerUserId ? rsvps.find((r) => r.userId === viewerUserId) : null;
  const viewerRsvpStatus = viewerRsvp?.status ?? null;

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
      ? "Approximate area shown -- exact address revealed after joining"
      : "Approximate area shown -- exact address isn't shared for this plan"
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

  const mainBannerBase = bannerUseFallback
    ? (getImageFallbackBaseUrl() ?? getAvatarBaseUrl())
    : getAvatarBaseUrl();
  const bannerSrc = event.bannerKey
    ? `${mainBannerBase}/events/${event.id}/banner?v=${Date.now()}`
    : null;
  const bannerUrl = bannerSrc && !bannerFailed ? bannerSrc : null;

  const hobbies =
    event.hobbies?.length > 0
      ? event.hobbies
      : event.hobby
        ? [{ name: event.hobby, slug: event.hobbySlug ?? "" }]
        : [];

  const avatarBaseUrl = getAvatarBaseUrl();

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Login nudge for email deep-links that require authentication */}
      {sectionLoginNudge && (
        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2, borderColor: "primary.light", bgcolor: "action.hover" }}
        >
          <Typography variant="body2" sx={{ mb: 1 }}>
            {sectionLoginNudge === "feedback"
              ? "Sign in to share how it went."
              : sectionLoginNudge === "chat"
                ? "Sign in to view plan chat."
                : "Sign in to continue."}
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => router.push(`/login?next=${encodeURIComponent(`/events/${eventId}?section=${sectionLoginNudge}`)}`)}
            sx={{ textTransform: "none" }}
          >
            Sign in
          </Button>
        </Paper>
      )}
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
            onError={handleBannerError}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Box>
      )}

      {/* Header. Warm-wash hero matching the public preview and the
          rest of the logged-in surfaces (Explore, Your Plans,
          Communities, Your Chums, Profile). Adapts the participant-hero
          card pattern from docs/UI_Patterns.md to a plan-level hero so
          the page opens with a confident top section instead of a bare
          stack of text. Status / visibility chips sit above the title;
          host + community lines anchor below. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        }}
      >
        {/* Hobby tags + visibility / state badges in one intentional row */}
        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 1.25, gap: 0.75 }}
        >
          {hobbies.map((h) => (
            <Chip
              key={h.slug}
              label={h.name}
              size="small"
              sx={{
                bgcolor: "primary.light",
                color: "primary.dark",
                fontWeight: 600,
                fontSize: "0.75rem",
                borderRadius: 2,
                height: 24,
                border: "1px solid",
                borderColor: "primary.light",
              }}
            />
          ))}
          <Chip
            label={visibilityLabel(event.visibility)}
            size="small"
            variant="outlined"
            sx={{ height: 24, fontSize: "0.75rem", borderRadius: 2, bgcolor: "background.paper" }}
          />
          {event.lockedAt && !isCanceled && (
            <Chip
              icon={<LockRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
              label="Locked"
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: "0.75rem", height: 24, borderRadius: 2, bgcolor: "background.paper" }}
            />
          )}
          {event.requireApproval && !isCanceled && (
            <Tooltip
              title="The host must approve each person before they can join this plan."
              placement="top"
              arrow
            >
              <Chip
                icon={<PersonAddRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                label="Approval required"
                size="small"
                variant="outlined"
                color="info"
                sx={{ fontWeight: 600, fontSize: "0.75rem", cursor: "default", height: 24, borderRadius: 2, bgcolor: "background.paper" }}
              />
            </Tooltip>
          )}
          {isCanceled && (
            <Chip
              label="Canceled"
              size="small"
              color="error"
              sx={{ height: 24, fontSize: "0.75rem", borderRadius: 2 }}
            />
          )}
          {isPast && !isCanceled && (
            <Chip
              icon={<HistoryRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
              label="Past plan"
              size="small"
              variant="outlined"
              sx={{
                fontWeight: 600,
                fontSize: "0.75rem",
                borderColor: "grey.400",
                color: "text.secondary",
                height: 24,
                borderRadius: 2,
                bgcolor: "background.paper",
              }}
            />
          )}
        </Stack>
        <Typography
          component="h1"
          fontWeight={700}
          sx={{
            fontSize: { xs: "1.875rem", sm: "2.375rem" },
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            mb: 1,
            ...(isPast && !isCanceled ? { color: "text.secondary" } : {}),
          }}
        >
          {event.title}
          {event.isQa && (
            <Chip
              label="QA Plan"
              size="small"
              sx={{ ml: 1.5, bgcolor: "warning.light", color: "warning.dark", fontWeight: 700, fontSize: "0.75rem", verticalAlign: "middle" }}
            />
          )}
        </Typography>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ columnGap: 0.75, rowGap: 0.5 }}
        >
          <Typography variant="body2" color="text.secondary">
            {event.isHost
              ? isPast
                ? "You hosted this"
                : "You're hosting this"
              : (
                <>
                  Hosted by{" "}
                  <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
                    {event.hostName}
                  </Box>
                </>
              )}
          </Typography>
          {event.communities && event.communities.length > 0 && (
            <>
              <Typography variant="body2" color="text.disabled">·</Typography>
              {event.communities.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 22,
                    fontSize: "0.6875rem",
                    fontWeight: 500,
                    borderRadius: 1.5,
                    borderColor: "divider",
                    color: "text.secondary",
                    bgcolor: "background.paper",
                    cursor: "pointer",
                    "&:hover": { borderColor: "primary.main", color: "primary.main" },
                  }}
                  onClick={() => router.push(`/communities/${c.slug}`)}
                />
              ))}
            </>
          )}
        </Stack>
      </Paper>

      {/* Canceled banner */}
      {isCanceled && (
        <Box
          sx={{
            p: 2.5,
            borderRadius: 2.5,
            bgcolor: "error.main",
            color: "common.white",
            textAlign: "center",
          }}
        >
          <Stack spacing={0.75} alignItems="center">
            <CancelRoundedIcon sx={{ fontSize: 36 }} />
            <Typography variant="h6" fontWeight={700}>
              This plan has been canceled
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.85 }}>
              {event.cancellationReason === "host_canceled"
                ? "The host decided to cancel this plan."
                : event.cancellationReason === "min_attendees_not_met"
                  ? "The minimum number of confirmed attendees wasn't reached."
                  : event.cancellationReason === "min_attendees_required_not_met"
                    ? "Not enough people were going by the 2-hour cutoff, so NewChums automatically cancelled the plan."
                    : event.cancellationReason === "no_attendees"
                      ? "No one else was able to join this time around, but don't let that discourage you. The right plan is out there."
                      : null}
            </Typography>
            {event.cancellationReason === "min_attendees_not_met" && event.minConfirmedAttendees && (
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {event.confirmedCount} of {event.minConfirmedAttendees}{" "}
                {event.minConfirmedAttendees === 1 ? "person" : "people"} confirmed by the deadline.
              </Typography>
            )}
            {event.cancellationReason === "min_attendees_required_not_met" && event.minAttendeesRequired && (
              <Typography variant="body2" sx={{ opacity: 0.8 }}>
                {goingCount} of {event.minAttendeesRequired}{" "}
                {event.minAttendeesRequired === 1 ? "person" : "people"} going by the deadline.
              </Typography>
            )}
            {event.canceledAt && (
              <Typography variant="body2" sx={{ opacity: 0.7 }}>
                Canceled on{" "}
                {new Date(event.canceledAt).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* Compatibility note, shown when the host doesn't fully meet viewer's chum preferences */}
      {prefNote && prefNote.length > 0 && !event.isHost && (
        <Box
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "warning.light",
            bgcolor: "rgba(255, 167, 38, 0.06)",
            display: "flex",
            alignItems: "flex-start",
            gap: 1.5,
          }}
        >
          <InfoOutlinedIcon
            sx={{ color: "warning.main", mt: "2px", fontSize: 20, flexShrink: 0 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Based on your chum preferences, this plan may not fully match your expectations
            {prefNote.length === 1
              ? ` for ${PREF_NOTE_LABELS[prefNote[0]] ?? prefNote[0]}`
              : ` for ${prefNote.map((m) => PREF_NOTE_LABELS[m] ?? m).join(" and ")}`}
            . You can still join, this is just a heads-up.
          </Typography>
        </Box>
      )}

      {/* Post-plan feedback, shown prominently for past attended plans.
          Rendered without an outer wrapper so that, when PlanFeedback
          bails out (loading/dismissed/no attendees-or-issues to review),
          it doesn't leave an empty Box consuming a Stack gap slot between
          the header and the details card. */}
      {isPast && !isCanceled && accessState === "attending" &&
        (event.isHost || viewerRsvpStatus === "going" || viewerRsvpStatus === "maybe") && (
        <PlanFeedback
          id="plan-section-feedback"
          eventId={event.id}
          planTitle={event.title}
          planStartsAt={event.startsAt}
          planHobbies={event.hobbies?.map((h) => ({ name: h.name, slug: h.slug })) ?? []}
          initialData={prefetchedFeedback}
        />
      )}

      {/* Details card. Icon orbs mirror the public preview's overview
          card so logged-in and public viewers see the same "at a glance"
          treatment. Each meta row anchors on a 32px primary.light orb on
          the left and a body1 line on the right. */}
      <AppCard>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.dark",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body1" fontWeight={500}>{formatDateTime(event.startsAt)}</Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} alignItems="flex-start">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: event.locationType === "online" || !isLocationApprox ? "primary.light" : "grey.100",
                color: event.locationType === "online" || !isLocationApprox ? "primary.dark" : "text.secondary",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                mt: "2px",
              }}
            >
              {event.locationType === "online" ? (
                <LinkRoundedIcon sx={{ fontSize: 18 }} />
              ) : isLocationApprox ? (
                <LockOutlinedIcon sx={{ fontSize: 18 }} />
              ) : (
                <PlaceRoundedIcon sx={{ fontSize: 18 }} />
              )}
            </Box>
            <Stack spacing={0.4} sx={{ minWidth: 0, flex: 1 }}>
              {event.locationType === "online" && event.onlineLink?.trim() ? (
                <MuiLink
                  href={normalizeMeetingLinkHref(event.onlineLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body1"
                  sx={{ wordBreak: "break-word", fontWeight: 500 }}
                >
                  {locationDisplay}
                </MuiLink>
              ) : (
                <Typography variant="body1" fontWeight={500} sx={{ wordBreak: "break-word" }}>{locationDisplay}</Typography>
              )}
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
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.dark",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <PeopleOutlineRoundedIcon sx={{ fontSize: 18 }} />
            </Box>
            <Typography variant="body1" fontWeight={500}>
              {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
              {reservedSeatCount > 0 ? `, ${reservedSeatCount} reserved` : ""}
              {event.maxSeats
                ? ` · ${Math.max(0, event.maxSeats - goingCount - reservedSeatCount)} seat${event.maxSeats - goingCount - reservedSeatCount === 1 ? "" : "s"} remaining`
                : ""}
            </Typography>
          </Stack>
          {event.requireReconfirmation && !event.confirmationWindowOpen && (
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <NotificationsRoundedIcon sx={{ color: "text.secondary", fontSize: 22, mt: "1px" }} />
              <Stack spacing={0.25}>
                <Typography variant="body2" color="text.secondary">
                  24-hour attendance check is enabled for this plan
                </Typography>
                {event.fallbackPolicy === "auto_cancel" && event.minConfirmedAttendees && (
                  <Typography variant="caption" color="text.secondary">
                    This plan will be auto-canceled 2 hours before it starts if fewer than{" "}
                    {event.minConfirmedAttendees}{" "}
                    {event.minConfirmedAttendees === 1 ? "attendee confirms" : "attendees confirm"}
                  </Typography>
                )}
              </Stack>
            </Stack>
          )}
          {event.minAttendeesRequired != null && !isCanceled && (
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <NotificationsRoundedIcon sx={{ color: "text.secondary", fontSize: 22, mt: "1px" }} />
              <Typography variant="body2" color="text.secondary">
                This plan needs at least {event.minAttendeesRequired}{" "}
                {event.minAttendeesRequired === 1 ? "person" : "people"} going, or it will be
                automatically cancelled 2 hours before it starts.
              </Typography>
            </Stack>
          )}
          {event.requireReconfirmation && event.confirmationWindowOpen && (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <NotificationsRoundedIcon sx={{ color: "warning.main", fontSize: 22 }} />
                <Stack spacing={0.25}>
                  <Typography variant="body2" fontWeight={600}>
                    {event.confirmedCount} confirmed
                    {event.pendingConfirmationCount > 0
                      ? `, ${event.pendingConfirmationCount} pending`
                      : ""}
                    {event.minConfirmedAttendees
                      ? ` · ${event.minConfirmedAttendees} ${event.minConfirmedAttendees === 1 ? "person" : "people"} required`
                      : ""}
                  </Typography>
                  {event.confirmationCutoffAt && (
                    <Typography variant="caption" color="text.secondary">
                      Attendance check deadline:{" "}
                      {new Date(event.confirmationCutoffAt).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Typography>
                  )}
                  {event.fallbackPolicy === "auto_cancel" && event.minConfirmedAttendees && (
                    <Typography variant="caption" color="text.secondary">
                      This plan will be auto-canceled if fewer than {event.minConfirmedAttendees}{" "}
                      {event.minConfirmedAttendees === 1
                        ? "attendee confirms"
                        : "attendees confirm"}{" "}
                      by the deadline
                    </Typography>
                  )}
                </Stack>
              </Stack>
              {event.planViability && event.minConfirmedAttendees && (
                <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                  <Chip
                    size="small"
                    label={
                      event.planViability === "viable"
                        ? "Enough people confirmed"
                        : event.planViability === "at_risk"
                          ? "At risk"
                          : "Below minimum"
                    }
                    color={
                      event.planViability === "viable"
                        ? "success"
                        : event.planViability === "at_risk"
                          ? "warning"
                          : "error"
                    }
                    variant={event.planViability === "viable" ? "filled" : "outlined"}
                    sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                  />
                </Stack>
              )}
            </Stack>
          )}
          {event.description && (
            <>
              <Divider sx={{ borderColor: "divider", opacity: 0.6 }} />
              <RichTextContent html={event.description} />
            </>
          )}
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
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderTop: "1px solid",
              borderColor: "divider",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
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

      {/* RSVP / Request-to-join actions (non-hosts, non-canceled, not past).
          Once a plan has passed it can no longer be joined and attendance can
          no longer be changed, so the interactive card is hidden; the read-only
          status card below preserves the viewer's recorded RSVP in the normal
          past-plan view. */}
      {!event.isHost && !isCanceled && !isPast && (
        <AppCard>
          {isAuthenticated === false && emailContext === "host_review" ? (
            <Stack spacing={2} sx={{ py: 1 }}>
              <Typography variant="h6" fontWeight={600}>
                Review join requests
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Sign in to review join requests for your plan.
              </Typography>
              <Button
                component={Link}
                href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                variant="contained"
                color="primary"
                size="medium"
                sx={{
                  alignSelf: "flex-start",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Sign in
              </Button>
            </Stack>
          ) : isAuthenticated === false && emailContext === "request_approved" ? (
            <Stack spacing={2} sx={{ py: 1 }}>
              <Stack spacing={1.5} alignItems="center">
                <CheckCircleRoundedIcon sx={{ fontSize: 36, color: "success.main" }} />
                <Typography variant="h6" fontWeight={600}>
                  Your request was approved
                </Typography>
              </Stack>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", lineHeight: 1.6 }}
              >
                Sign in to see the full plan details, chat with participants, and manage your RSVP.
              </Typography>
              <Button
                component={Link}
                href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                variant="contained"
                color="primary"
                size="medium"
                sx={{
                  alignSelf: "center",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Sign in
              </Button>
            </Stack>
          ) : showRequestToJoin ? (
            <>
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
              >
                Want to join?
              </Typography>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 2, mt: 1, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary">
                  The host reviews each request before adding you to the plan.
                </Typography>
              </Stack>

              {event.lockedAt && (
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 2 }}
                >
                  <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary">
                    This plan is locked and not accepting new participants.
                  </Typography>
                </Stack>
              )}

              {userJoinRequest ? (
                withdrawConfirmId === userJoinRequest.id ? (
                  // Withdraw confirmation: a deliberately distinct, warning-tinted
                  // card so the user is unmistakably in a "confirm a destructive
                  // action" state, not just a slightly different version of the
                  // pending status. Kept inline (not a modal) to match the rest of
                  // the plan-detail UI which prefers in-card confirmations.
                  <Box
                    sx={{
                      p: 2.5,
                      border: "1px solid",
                      borderColor: "warning.main",
                      borderRadius: 2,
                      bgcolor: "warning.50",
                    }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="flex-start">
                      <WarningAmberRoundedIcon
                        sx={{ color: "warning.main", fontSize: 28, flexShrink: 0, mt: 0.25 }}
                      />
                      <Stack spacing={1.5} sx={{ flex: 1 }}>
                        <Typography variant="subtitle1" fontWeight={700}>
                          Withdraw your request?
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          This permanently withdraws your request to join &ldquo;{event.title}&rdquo;.
                          The host will be notified and you&apos;ll need to send a new request to
                          try again.
                        </Typography>
                        <Stack
                          direction={{ xs: "column-reverse", sm: "row" }}
                          spacing={1}
                          sx={{ pt: 0.5 }}
                        >
                          <Button
                            variant="outlined"
                            onClick={() => setWithdrawConfirmId(null)}
                            disabled={withdrawSubmitting}
                            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
                          >
                            Keep request
                          </Button>
                          <Button
                            variant="contained"
                            color="error"
                            onClick={() => handleWithdrawRequest(userJoinRequest.id)}
                            disabled={withdrawSubmitting}
                            startIcon={
                              withdrawSubmitting ? (
                                <CircularProgress size={14} color="inherit" />
                              ) : null
                            }
                            sx={{
                              textTransform: "none",
                              fontWeight: 600,
                              borderRadius: 2,
                              boxShadow: "none",
                              "&:hover": { boxShadow: "none", opacity: 0.92 },
                            }}
                          >
                            {withdrawSubmitting ? "Withdrawing…" : "Yes, withdraw"}
                          </Button>
                        </Stack>
                      </Stack>
                    </Stack>
                  </Box>
                ) : (
                  <Box sx={{ p: 2.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                      {userJoinRequest.status === "pending" && (
                        <Chip
                          icon={<HourglassEmptyRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                          label="Pending host review"
                          color="warning"
                          variant="filled"
                          sx={{ fontWeight: 600, height: 28, "& .MuiChip-icon": { color: "inherit" } }}
                        />
                      )}
                      {userJoinRequest.status === "approved" && (
                        <Chip
                          icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                          label="Approved"
                          color="success"
                          variant="filled"
                          sx={{ fontWeight: 600, height: 28 }}
                        />
                      )}
                      {userJoinRequest.status === "declined" && (
                        <Chip
                          label="Declined"
                          color="error"
                          variant="outlined"
                          sx={{ fontWeight: 600, height: 28 }}
                        />
                      )}
                      {userJoinRequest.status === "withdrawn" && (
                        <Chip
                          label="Withdrawn"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            height: 28,
                            color: "text.secondary",
                            borderColor: "grey.400",
                          }}
                        />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      {userJoinRequest.status === "pending" &&
                        "Your request is waiting for the host to review it. We'll let you know as soon as they decide."}
                      {userJoinRequest.status === "approved" &&
                        "You've been approved and added to this plan as Going."}
                      {userJoinRequest.status === "declined" &&
                        "The host has declined your request to join this plan."}
                      {userJoinRequest.status === "withdrawn" &&
                        "You withdrew your request to join this plan."}
                    </Typography>
                    {userJoinRequest.message && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          bgcolor: "grey.50",
                          borderRadius: 2,
                          borderLeft: "3px solid",
                          borderColor: "grey.300",
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                        >
                          Your message
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.6 }}>
                          {userJoinRequest.message}
                        </Typography>
                      </Box>
                    )}
                    {userJoinRequest.hostMessage && (
                      <Box
                        sx={{
                          mt: 1.5,
                          p: 1.5,
                          bgcolor: "grey.50",
                          borderRadius: 2,
                          borderLeft: "3px solid",
                          borderColor: "primary.light",
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                        >
                          Host message
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.6 }}>
                          {userJoinRequest.hostMessage}
                        </Typography>
                      </Box>
                    )}
                    {userJoinRequest.status === "pending" && (
                      <Box sx={{ mt: 2 }}>
                        <Button
                          variant="text"
                          color="error"
                          onClick={() => setWithdrawConfirmId(userJoinRequest.id)}
                          startIcon={<DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />}
                          sx={{
                            textTransform: "none",
                            fontWeight: 600,
                            px: 1,
                          }}
                        >
                          Withdraw request
                        </Button>
                      </Box>
                    )}
                  </Box>
                )
              ) : !event.lockedAt ? (
                isAuthenticated === false ? (
                  <Stack spacing={1.5}>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      You&apos;ll need a NewChums account to request to join this plan.
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                      <Button
                        component={Link}
                        href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                        variant="contained"
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          borderRadius: 2.5,
                          boxShadow: "none",
                          "&:hover": { boxShadow: "none", opacity: 0.92 },
                        }}
                      >
                        Sign in
                      </Button>
                      <Button
                        component={Link}
                        href={`/signup?next=${encodeURIComponent(`/events/${eventId}`)}`}
                        variant="outlined"
                        sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5 }}
                      >
                        Create an account
                      </Button>
                    </Stack>
                  </Stack>
                ) : (
                  <Stack spacing={1.5}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Add a note to the host (optional)"
                      value={joinRequestMessage}
                      onChange={(e) => setJoinRequestMessage(e.target.value.slice(0, 500))}
                      multiline
                      maxRows={3}
                      disabled={joinRequestSubmitting}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <AppButton
                      onClick={handleJoinRequest}
                      disabled={joinRequestSubmitting}
                      startIcon={
                        joinRequestSubmitting ? (
                          <CircularProgress size={14} color="inherit" />
                        ) : (
                          <PersonAddRoundedIcon />
                        )
                      }
                    >
                      {joinRequestSubmitting ? "Sending…" : "Request to join"}
                    </AppButton>
                  </Stack>
                )
              ) : null}
            </>
          ) : showInviteOnlyGate ? (
            <Stack spacing={1.5} sx={{ py: 1 }}>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}
              >
                <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.6 }}>
                  This plan is invite only. Ask the host to send you a share link or invite to join.
                </Typography>
              </Stack>
            </Stack>
          ) : isAuthenticated === false ? (
            <PlanSignupCard
              planUrlWithTokens={(() => {
                // Preserve the invitee's RSVP intent through the magic-link
                // round-trip. If the user clicked "Going" from the invite
                // email (?rsvp=going), we want that to auto-apply after
                // they finish signing up, so fold it into the URL the
                // magic-link returns to, alongside any share/invite token.
                // Also include `section=confirmation` so the landing view
                // scrolls to the "Are you in?" / "You're going" card
                // instead of the top of the plan.
                const params = new URLSearchParams();
                if (inviteTokenRef.current) params.set("invite_token", inviteTokenRef.current);
                else if (shareTokenRef.current) params.set("share_token", shareTokenRef.current);
                if (pendingRsvpRef.current) params.set("rsvp", pendingRsvpRef.current);
                params.set("section", "confirmation");
                return `/events/${eventId}?${params.toString()}`;
              })()}
              planTitle={event.title}
              // Prefill the email the invite_token was issued for so the new
              // account is created with the address the host invited and the
              // post-signup invite adoption matches by email. Without this,
              // a typo or alternate inbox at signup would leave the new
              // account unattached to the invite row and the viewer would
              // hit the invite-only lock after returning from the magic
              // link.
              prefillEmail={inviteeEmail ?? undefined}
            />
          ) : (
            <div id="plan-section-confirmation">
              {/* Confirmation UI when window is open */}
              {event.confirmationWindowOpen &&
              viewerRsvpStatus === "going" &&
              !event.isHost &&
              (effectiveConfirmStatus === "pending" ||
                effectiveConfirmStatus === "expired" ||
                effectiveConfirmStatus === null) ? (
                <Stack spacing={2} sx={{ py: 1 }}>
                  <Stack
                    spacing={1}
                    sx={{
                      p: 2,
                      bgcolor: "warning.50",
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "warning.200",
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={700}>
                      Attendance check: are you still coming?
                    </Typography>
                    {event.confirmationCutoffAt && (
                      <Typography variant="body2" color="text.secondary">
                        Please confirm by{" "}
                        {new Date(event.confirmationCutoffAt).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <AppButton
                      onClick={() => handleConfirmAction("confirm")}
                      disabled={confirmSubmitting}
                      sx={{ flex: 1 }}
                    >
                      I&apos;m still coming
                    </AppButton>
                    <AppButton
                      onClick={() => handleConfirmAction("decline")}
                      disabled={confirmSubmitting}
                      variant="outlined"
                      color="inherit"
                      sx={{ flex: 1 }}
                    >
                      I can&apos;t make it
                    </AppButton>
                  </Stack>
                </Stack>
              ) : event.confirmationWindowOpen && effectiveConfirmStatus === "confirmed" ? (
                <Stack spacing={1.5} sx={{ py: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <CheckCircleRoundedIcon sx={{ fontSize: 20, color: "success.main" }} />
                    <Typography variant="h6" fontWeight={600}>
                      You&apos;re confirmed
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    Your attendance is confirmed. See you there!
                  </Typography>
                </Stack>
              ) : event.confirmationWindowOpen && effectiveConfirmStatus === "declined" ? (
                <Stack spacing={1.5} sx={{ py: 1 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <InfoOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                    <Typography variant="h6" fontWeight={600}>
                      You&apos;ve indicated you can&apos;t make it
                    </Typography>
                  </Stack>
                </Stack>
              ) : viewerRsvpStatus ? (
                <Stack spacing={1.5}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {viewerRsvpStatus === "going" && (
                      <CheckCircleRoundedIcon sx={{ fontSize: 20, color: "success.main" }} />
                    )}
                    {viewerRsvpStatus === "maybe" && (
                      <AccessTimeRoundedIcon sx={{ fontSize: 20, color: "warning.main" }} />
                    )}
                    {viewerRsvpStatus === "cant_make_it" && (
                      <InfoOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                    )}
                    <Typography variant="h6" fontWeight={600}>
                      {viewerRsvpStatus === "going"
                        ? "You're going"
                        : viewerRsvpStatus === "maybe"
                          ? "You're a maybe"
                          : "You can't make it"}
                    </Typography>
                  </Stack>
                  {event.requireApproval && !event.isInvited && event.hasRsvp && (
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}
                    >
                      <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main" }} />
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.8125rem" }}
                      >
                        You were approved to join this plan.
                      </Typography>
                    </Stack>
                  )}
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.8125rem", lineHeight: 1.6 }}
                  >
                    Want to change your response?
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    <AppButton
                      onClick={() => openRsvpDialog("going")}
                      disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)}
                      variant={viewerRsvpStatus === "going" ? "contained" : "outlined"}
                      sx={{ flex: 1 }}
                    >
                      Going
                    </AppButton>
                    <AppButton
                      onClick={() => openRsvpDialog("maybe")}
                      disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)}
                      variant={viewerRsvpStatus === "maybe" ? "contained" : "outlined"}
                      sx={{ flex: 1 }}
                    >
                      Maybe
                    </AppButton>
                    <AppButton
                      onClick={() => openRsvpDialog("cant_make_it")}
                      disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)}
                      variant={viewerRsvpStatus === "cant_make_it" ? "contained" : "outlined"}
                      color={viewerRsvpStatus === "cant_make_it" ? "primary" : "inherit"}
                      sx={{ flex: 1 }}
                    >
                      Can&apos;t make it
                    </AppButton>
                  </Stack>
                </Stack>
              ) : (
                <>
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    sx={{ mb: 2, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
                  >
                    {event.isInvited ? "Can you make it?" : "Are you in?"}
                  </Typography>
                  {isFull && !event.lockedAt ? (
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ p: 1.5, bgcolor: "grey.100", borderRadius: 2 }}
                    >
                      <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.8125rem" }}
                      >
                        Sorry, this plan is full, no spots remaining!
                      </Typography>
                    </Stack>
                  ) : (
                    <>
                      {event.lockedAt && chatAccessible !== true && (
                        <Stack
                          direction="row"
                          alignItems="center"
                          spacing={1}
                          sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 2 }}
                        >
                          <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontSize: "0.8125rem" }}
                          >
                            This plan is locked and not accepting new participants.
                          </Typography>
                        </Stack>
                      )}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                        <AppButton
                          onClick={() => openRsvpDialog("going")}
                          disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)}
                          sx={{ flex: 1 }}
                        >
                          Going
                        </AppButton>
                        <AppButton
                          onClick={() => openRsvpDialog("maybe")}
                          disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)}
                          variant="outlined"
                          sx={{ flex: 1 }}
                        >
                          Maybe
                        </AppButton>
                        <AppButton
                          onClick={() => openRsvpDialog("cant_make_it")}
                          disabled={
                            rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)
                          }
                          variant="outlined"
                          color="inherit"
                          sx={{ flex: 1 }}
                        >
                          Can&apos;t make it
                        </AppButton>
                      </Stack>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </AppCard>
      )}

      {/* Past-plan RSVP status (read-only). The interactive RSVP card above is
          hidden once a plan has passed; this preserves the viewer's recorded
          attendance status in the normal past-plan view without allowing changes. */}
      {!event.isHost && !isCanceled && isPast && viewerRsvpStatus && (
        <AppCard>
          <Stack direction="row" alignItems="center" spacing={1}>
            {viewerRsvpStatus === "going" && (
              <CheckCircleRoundedIcon sx={{ fontSize: 20, color: "success.main" }} />
            )}
            {viewerRsvpStatus === "maybe" && (
              <AccessTimeRoundedIcon sx={{ fontSize: 20, color: "warning.main" }} />
            )}
            {viewerRsvpStatus === "cant_make_it" && (
              <InfoOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
            )}
            <Typography variant="h6" fontWeight={600}>
              {viewerRsvpStatus === "going"
                ? "You went"
                : viewerRsvpStatus === "maybe"
                  ? "You were marked as maybe"
                  : "You couldn't make it"}
            </Typography>
          </Stack>
        </AppCard>
      )}

      {/* Host confirmation (when window is open) */}
      {event.isHost &&
        !isCanceled &&
        event.requireReconfirmation &&
        event.confirmationWindowOpen && (
          <AppCard id="plan-section-confirmation">
            {effectiveConfirmStatus === "confirmed" ? (
              <Stack spacing={1.5} sx={{ py: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <CheckCircleRoundedIcon sx={{ fontSize: 20, color: "success.main" }} />
                  <Typography variant="h6" fontWeight={600}>
                    You&apos;ve confirmed you&apos;re hosting
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                  Your attendees can see this plan is still on.
                </Typography>
              </Stack>
            ) : effectiveConfirmStatus === "declined" ? (
              <Stack spacing={1.5} sx={{ py: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <InfoOutlinedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                  <Typography variant="h6" fontWeight={600}>
                    You&apos;ve indicated you&apos;re not hosting
                  </Typography>
                </Stack>
              </Stack>
            ) : isPast ? (
              <Stack spacing={1.5} sx={{ py: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <InfoOutlinedIcon sx={{ fontSize: 20, color: "warning.main" }} />
                  <Typography variant="h6" fontWeight={600}>
                    Hosting was not confirmed
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                  This plan has already happened and hosting was not confirmed beforehand.
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={2} sx={{ py: 1 }}>
                <Stack
                  spacing={1}
                  sx={{
                    p: 2,
                    bgcolor: "warning.50",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "warning.200",
                  }}
                >
                  <Typography variant="subtitle1" fontWeight={700}>
                    Confirm you&apos;re still hosting
                  </Typography>
                  {event.confirmationCutoffAt && (
                    <Typography variant="body2" color="text.secondary">
                      Please confirm by{" "}
                      {new Date(event.confirmationCutoffAt).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Typography>
                  )}
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <AppButton
                    onClick={() => handleConfirmAction("confirm")}
                    disabled={confirmSubmitting}
                    sx={{ flex: 1 }}
                  >
                    I&apos;m still hosting this
                  </AppButton>
                  <AppButton
                    onClick={() => handleConfirmAction("decline")}
                    disabled={confirmSubmitting}
                    variant="outlined"
                    color="inherit"
                    sx={{ flex: 1 }}
                  >
                    Cancel this plan
                  </AppButton>
                </Stack>
              </Stack>
            )}
          </AppCard>
        )}

      {/* Invite people (host or Going attendees when allowed, not canceled, not past) */}
      {(event.isHost || (viewerRsvpStatus === "going" && event.allowAttendeeInvites)) &&
        !isCanceled &&
        !isPast && (
          <AppCard>
            {!showInviteForm ? (
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={1}
              >
                <Typography
                  variant="h5"
                  fontWeight={700}
                  sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
                >
                  Invite people
                </Typography>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <AppButton
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={handleCopyLink}
                    sx={{ textTransform: "none" }}
                  >
                    Share plan link
                  </AppButton>
                  <AppButton
                    size="small"
                    variant="outlined"
                    startIcon={<PersonAddRoundedIcon />}
                    onClick={() => setShowInviteForm(true)}
                    sx={{ textTransform: "none" }}
                  >
                    Send invite
                  </AppButton>
                </Stack>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={1}
                >
                  <Typography
                    variant="h5"
                    fontWeight={700}
                    sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
                  >
                    Invite people
                  </Typography>
                  <AppButton
                    size="small"
                    variant="outlined"
                    startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 16 }} />}
                    onClick={handleCopyLink}
                    sx={{ textTransform: "none" }}
                  >
                    Share plan link
                  </AppButton>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  Search by name, @handle, or email. Invite emails are sent immediately.
                </Typography>

                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Search by name, @handle, or email…"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && EMAIL_RE.test(inviteSearch.trim())) {
                      e.preventDefault();
                      if (viewerEmail && inviteSearch.trim().toLowerCase() === viewerEmail) return;
                      handleInvite(undefined, inviteSearch.trim().toLowerCase());
                    }
                  }}
                  disabled={inviteSubmitting}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        {searching ? (
                          <CircularProgress size={18} />
                        ) : EMAIL_RE.test(inviteSearch.trim()) ? (
                          <MailOutlineRoundedIcon sx={{ color: "text.secondary" }} />
                        ) : (
                          <SearchRoundedIcon sx={{ color: "text.secondary" }} />
                        )}
                      </InputAdornment>
                    ),
                  }}
                />

                <TextField
                  fullWidth
                  size="small"
                  multiline
                  minRows={2}
                  maxRows={4}
                  placeholder="Add a personal note (optional)"
                  value={inviteMessage}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) setInviteMessage(e.target.value);
                  }}
                  helperText={inviteMessage.length > 0 ? `${inviteMessage.length}/500` : undefined}
                  sx={{ "& .MuiFormHelperText-root": { textAlign: "right" } }}
                />

                {hasSearched &&
                  searchResults.length === 0 &&
                  !searching &&
                  !EMAIL_RE.test(inviteSearch.trim()) && (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      No results found for &ldquo;{inviteSearch.trim()}&rdquo;.
                    </Typography>
                  )}

                {searchResults.length > 0 && (
                  <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
                    {searchResults.map((r) => {
                      const handleSlug = r.handle?.replace(/^@/, "") ?? null;
                      const profileHref = handleSlug ? `/u/${handleSlug}` : null;
                      const avatarSrc = r.avatarUrl ? `${avatarBaseUrl}${r.avatarUrl}` : null;
                      const isInviting = invitingUserId === r.userId;
                      return (
                        <Box
                          key={r.userId}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: { xs: 1.5, sm: 2 },
                            py: 1.5,
                            borderRadius: 1,
                            px: 1,
                            mx: -1,
                          }}
                        >
                          <UserAvatar
                            src={avatarSrc}
                            name={r.displayName}
                            username={r.handle}
                            size={40}
                            sx={{ flexShrink: 0 }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            {profileHref ? (
                              <Typography
                                component={Link}
                                href={profileHref}
                                fontWeight={600}
                                sx={{
                                  fontSize: "0.9375rem",
                                  color: "text.primary",
                                  textDecoration: "none",
                                  "&:hover": { textDecoration: "underline" },
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {r.displayName}
                              </Typography>
                            ) : (
                              <Typography
                                fontWeight={600}
                                sx={{
                                  fontSize: "0.9375rem",
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {r.displayName}
                              </Typography>
                            )}
                            {r.handle && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                  display: "block",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {r.handle}
                              </Typography>
                            )}
                          </Box>
                          <Button
                            variant="contained"
                            size="small"
                            disabled={inviteSubmitting}
                            onClick={() => handleInvite(r.userId)}
                            sx={{ flexShrink: 0, fontSize: "0.8125rem", whiteSpace: "nowrap" }}
                          >
                            {isInviting ? (
                              <CircularProgress size={14} color="inherit" sx={{ mx: 1 }} />
                            ) : (
                              "Send Email Invite"
                            )}
                          </Button>
                        </Box>
                      );
                    })}
                  </Stack>
                )}

                {EMAIL_RE.test(inviteSearch.trim()) &&
                  viewerEmail &&
                  inviteSearch.trim().toLowerCase() === viewerEmail && (
                    <Typography variant="body2" color="warning.main" sx={{ py: 1 }}>
                      That&rsquo;s your own email address
                    </Typography>
                  )}

                {hasSearched &&
                  EMAIL_RE.test(inviteSearch.trim()) &&
                  searchResults.length === 0 &&
                  !searching &&
                  !(viewerEmail && inviteSearch.trim().toLowerCase() === viewerEmail) && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 1.5,
                        py: 1,
                        px: 1.5,
                        borderRadius: 2,
                        bgcolor: "action.hover",
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {inviteSearch.trim()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Not on NewChums yet. Invite them to this plan by email.
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        disabled={inviteSubmitting}
                        startIcon={
                          inviteSubmitting ? (
                            <CircularProgress size={14} color="inherit" />
                          ) : (
                            <PersonAddRoundedIcon />
                          )
                        }
                        onClick={() => handleInvite(undefined, inviteSearch.trim().toLowerCase())}
                        sx={{ flexShrink: 0, fontSize: "0.8125rem", textTransform: "none" }}
                      >
                        Invite by email
                      </Button>
                    </Box>
                  )}

                <Button
                  size="small"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteSearch("");
                    setSearchResults([]);
                    setHasSearched(false);
                    setInviteMessage("");
                  }}
                  sx={{ alignSelf: "flex-start", textTransform: "none" }}
                >
                  Done inviting
                </Button>
              </Stack>
            )}
          </AppCard>
        )}

      {/* Join requests (host only) */}
      {event.isHost && !isCanceled && event.requireApproval && joinRequests.length > 0 && (
        <AppCard id="plan-section-join-requests">
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 0.5 }}>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
            >
              Join requests
            </Typography>
            {pendingJoinRequests.length > 0 && (
              <Chip
                label={`${pendingJoinRequests.length} pending`}
                size="small"
                color="warning"
                variant="filled"
                sx={{ fontWeight: 600, fontSize: "0.75rem" }}
              />
            )}
          </Stack>
          <Stack spacing={0}>
            {joinRequests.map((jr) => (
              <Box
                key={jr.id}
                sx={{
                  py: 2,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-child": { borderBottom: "none" },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
                  <UserAvatar
                    src={jr.avatarUrl ? `${avatarBaseUrl}${jr.avatarUrl}` : null}
                    name={jr.name}
                    size={44}
                    sx={{ flexShrink: 0 }}
                  />
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      {jr.handle ? (
                        <>
                          <Typography
                            component={Link}
                            href={`/u/${jr.handle.replace(/^@/, "")}`}
                            variant="body1"
                            fontWeight={600}
                            sx={{
                              fontSize: "1rem",
                              color: "text.primary",
                              textDecoration: "none",
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {jr.handle}
                          </Typography>
                          {jr.name && jr.name !== jr.handle.replace(/^@/, "") && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block" }}
                            >
                              {jr.name}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body1" fontWeight={600} sx={{ fontSize: "1rem" }}>
                          {jr.name}
                        </Typography>
                      )}
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontSize: "0.6875rem" }}
                      >
                        Requested{" "}
                        {new Date(jr.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Typography>
                    </Box>
                    {jr.status === "pending" ? (
                      <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }}
                      />
                    ) : jr.status === "approved" ? (
                      <Chip
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                        label="Approved"
                        size="small"
                        color="success"
                        variant="filled"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }}
                      />
                    ) : jr.status === "withdrawn" ? (
                      <Chip
                        label="Withdrawn"
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          flexShrink: 0,
                          color: "text.secondary",
                          borderColor: "grey.400",
                        }}
                      />
                    ) : (
                      <Chip
                        label="Declined"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }}
                      />
                    )}
                  </Stack>
                </Stack>

                {jr.message && (
                  <Typography
                    variant="body2"
                    sx={{
                      ml: 7.5,
                      mb: 1,
                      fontSize: "0.8125rem",
                      fontStyle: "italic",
                      color: "text.secondary",
                      lineHeight: 1.5,
                    }}
                  >
                    &ldquo;{jr.message}&rdquo;
                  </Typography>
                )}

                {jr.status === "withdrawn" && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 7.5, mt: 0.5, fontSize: "0.8125rem", fontStyle: "italic" }}
                  >
                    This request was withdrawn by the requester.
                  </Typography>
                )}

                {jr.status === "pending" && (
                  <Box sx={{ ml: 7.5, mt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Add a message (optional)"
                      value={hostResponseMessage[jr.id] ?? ""}
                      onChange={(e) =>
                        setHostResponseMessage((prev) => ({
                          ...prev,
                          [jr.id]: e.target.value.slice(0, 500),
                        }))
                      }
                      multiline
                      maxRows={2}
                      disabled={approveDeclineLoading === jr.id}
                      sx={{ mb: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => handleApproveRequest(jr.id)}
                        disabled={approveDeclineLoading === jr.id}
                        sx={{ textTransform: "none", fontWeight: 600 }}
                      >
                        {approveDeclineLoading === jr.id ? "Processing…" : "Approve"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => handleDeclineRequest(jr.id)}
                        disabled={approveDeclineLoading === jr.id}
                        sx={{ textTransform: "none", fontWeight: 600 }}
                      >
                        Decline
                      </Button>
                    </Stack>
                  </Box>
                )}

                {jr.hostMessage && jr.status !== "pending" && (
                  <Typography variant="body2" sx={{ ml: 7.5, mt: 0.5, fontSize: "0.8125rem" }}>
                    Your response: &ldquo;{jr.hostMessage}&rdquo;
                  </Typography>
                )}
              </Box>
            ))}
          </Stack>
        </AppCard>
      )}

      {/* Scheduling section, collaborative alternate scheduling (hidden for past plans) */}
      {event.allowAltTimes &&
        !isCanceled &&
        !isPast &&
        (() => {
          // Anyone who's part of this plan can both share availability and
          // see what others have shared: the host, anyone with any RSVP state
          // (going / maybe / cant_make_it), and anyone who's been invited.
          // Keeping these aligned avoids edge cases where a viewer can submit
          // an entry but then lose the ability to edit or delete it just by
          // changing their RSVP.
          const canSuggest =
            event.isHost || !!viewerRsvpStatus || event.isInvited;
          const isAvailMode = event.altTimesMode === "availability";
          // Token-backed visitors (share / invite link) get visibility too:
          // a share link implies a trusted recipient, even when there's no
          // RSVP or invite row yet.
          const arrivedViaToken =
            !!inviteTokenRef.current || !!shareTokenRef.current;
          const canSeeSharedEntries = canSuggest || arrivedViaToken;
          type OverlapWindow = { startMs: number; endMs: number; entries: AltTimeEntry[] };

          const fmtTime = (d: Date) =>
            d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });

          // "Start anytime" entries are submitted as a ~24h window (local
          // midnight to next-day local midnight in the submitter's timezone).
          // Detect by duration alone so viewers in a different timezone still
          // see "Anytime", not "4:00 AM - 4:00 AM".
          const isAnytimeWindow = (startMs: number, endMs: number | null): boolean => {
            if (endMs == null) return false;
            return endMs - startMs >= 23 * 3600 * 1000;
          };
          const formatEntryWindow = (
            suggestedAt: string,
            endsAt: string | null
          ): string => {
            const startMs = new Date(suggestedAt).getTime();
            const endMs = endsAt ? new Date(endsAt).getTime() : null;
            if (isAnytimeWindow(startMs, endMs)) return "Start anytime";
            const startLabel = fmtTime(new Date(startMs));
            return endMs != null ? `${startLabel} - ${fmtTime(new Date(endMs))}` : startLabel;
          };

          const viewerHasSuggested = viewerUserId
            ? altTimes.some((e) => e.userId === viewerUserId)
            : false;

          const byDay = altTimes.reduce<Record<string, AltTimeEntry[]>>((acc, entry) => {
            const dayKey = new Date(entry.suggestedAt).toDateString();
            if (!acc[dayKey]) acc[dayKey] = [];
            acc[dayKey].push(entry);
            return acc;
          }, {});

          function computeOverlaps(entries: AltTimeEntry[]): OverlapWindow[] {
            if (entries.length < 2) return [];

            const ranged = entries.filter((e) => e.endsAt);
            const pointEntries = entries.filter((e) => !e.endsAt);

            const entryById = new Map(entries.map((e) => [e.id, e]));
            const intervals = ranged.map((e) => ({
              id: e.id,
              s: new Date(e.suggestedAt).getTime(),
              e: new Date(e.endsAt!).getTime(),
            }));

            // Include point times as boundaries so a point falling inside a ranged
            // window creates its own segment start, enabling overlap detection.
            const boundaries = new Set<number>();
            for (const iv of intervals) {
              boundaries.add(iv.s);
              boundaries.add(iv.e);
            }
            for (const pt of pointEntries) {
              boundaries.add(new Date(pt.suggestedAt).getTime());
            }
            const sorted = [...boundaries].sort((a, b) => a - b);

            const raw: OverlapWindow[] = [];

            for (let i = 0; i < sorted.length - 1; i++) {
              const segStart = sorted[i];
              const segEnd = sorted[i + 1];
              const active = intervals.filter((iv) => iv.s <= segStart && iv.e >= segEnd);
              const entrySet = new Set(active.map((iv) => iv.id));
              for (const pt of pointEntries) {
                const ptMs = new Date(pt.suggestedAt).getTime();
                if (ptMs >= segStart && ptMs < segEnd) entrySet.add(pt.id);
              }
              // Need at least 2 distinct people for a meaningful overlap
              if (entrySet.size < 2) continue;
              raw.push({
                startMs: segStart,
                endMs: segEnd,
                entries: [...entrySet].map((id) => entryById.get(id)!).filter(Boolean),
              });
            }

            // Catch groups of point entries that share an exact timestamp.
            // The segment loop above only runs when there are 2+ distinct
            // boundaries, so a day whose only entries are points all at the
            // same minute would otherwise produce no overlap. Emit a
            // zero-width window for each such group, unless the group is
            // already represented by a segment-based overlap (e.g. when a
            // ranged interval covers the same timestamp).
            const pointBuckets = new Map<number, AltTimeEntry[]>();
            for (const pt of pointEntries) {
              const ts = new Date(pt.suggestedAt).getTime();
              const bucket = pointBuckets.get(ts);
              if (bucket) bucket.push(pt);
              else pointBuckets.set(ts, [pt]);
            }
            for (const [ts, bucket] of pointBuckets) {
              if (bucket.length < 2) continue;
              const alreadyCovered = raw.some(
                (w) =>
                  ts >= w.startMs &&
                  ts < w.endMs &&
                  bucket.every((pt) => w.entries.some((e) => e.id === pt.id))
              );
              if (alreadyCovered) continue;
              raw.push({ startMs: ts, endMs: ts, entries: [...bucket] });
            }
            raw.sort((a, b) => a.startMs - b.startMs);

            const merged: OverlapWindow[] = [];
            for (const w of raw) {
              const prev = merged[merged.length - 1];
              if (
                prev &&
                prev.endMs === w.startMs &&
                prev.entries.length === w.entries.length &&
                prev.entries.every((e) => w.entries.some((we) => we.id === e.id))
              ) {
                prev.endMs = w.endMs;
              } else {
                merged.push({ ...w });
              }
            }

            merged.sort((a, b) => b.entries.length - a.entries.length || a.startMs - b.startMs);
            return merged;
          }

          const dayGroups = Object.entries(byDay)
            .map(([dayKey, entries]) => {
              const overlaps = computeOverlaps(entries);
              entries.sort(
                (a, b) => new Date(a.suggestedAt).getTime() - new Date(b.suggestedAt).getTime()
              );
              return { dayKey, date: new Date(entries[0].suggestedAt), entries, overlaps };
            })
            .sort((a, b) => a.date.getTime() - b.date.getTime());

          const allOverlaps = dayGroups
            .flatMap((dg) => dg.overlaps.map((ov) => ({ ...ov, date: dg.date })))
            .sort((a, b) => b.entries.length - a.entries.length || a.startMs - b.startMs);
          const globalBestOverlapCount = allOverlaps.length > 0 ? allOverlaps[0].entries.length : 0;
          const fmtDay = (d: Date) =>
            d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

          // --- Group response summary ---
          // Derive who has responded: collect unique user IDs from altTimes.
          const respondedUserIds = new Set(altTimes.filter((e) => e.userId).map((e) => e.userId));
          // Participants = going + maybe RSVPs (the people who should respond)
          const participants = rsvps.filter((r) => r.status === "going" || r.status === "maybe");
          const respondedParticipants = participants.filter((p) => respondedUserIds.has(p.userId));
          const pendingParticipants = participants.filter((p) => !respondedUserIds.has(p.userId));

          // Suppress the response summary when the viewer is the only person
          // it would describe. Otherwise we'd render "Responses (0/1)" with
          // their own dashed chip, which reads as self-talk.
          const onlyViewerInParticipants =
            participants.length === 1 &&
            !!viewerUserId &&
            participants[0].userId === viewerUserId;
          const showResponseSummary =
            isAvailMode &&
            canSeeSharedEntries &&
            participants.length > 0 &&
            !onlyViewerInParticipants;
          // Card 2 is now strictly a "what's been shared" view; the response
          // summary lives on Card 1 (the action card) so non-empty status
          // doesn't masquerade as shared content.
          const sharedCardHasContent =
            canSeeSharedEntries && (allOverlaps.length > 0 || dayGroups.length > 0);
          const sharedCardTitle = isAvailMode ? "Shared availability" : "Suggested times";
          const declined = viewerRsvpStatus === "cant_make_it";
          // Helper-text bottom margin: zero when nothing will render below
          // it, lighter in availability mode (status info comes next), heavier
          // in suggest mode (picker comes next).
          const helperMb = !canSuggest ? 0 : isAvailMode ? 1.5 : 2;

          return (
            <Stack spacing={{ xs: 3, sm: 4 }}>
            <AppCard id="plan-section-availability">
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
              >
                {isAvailMode ? "Share your availability" : "Suggest a different time"}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: helperMb }}>
                {isAvailMode
                  ? canSuggest
                    ? viewerHasSuggested
                      ? event.availabilityDeadlineAt
                        ? `You've shared your availability. You can still add or edit times until ${new Date(
                            event.availabilityDeadlineAt
                          ).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}.`
                        : "You've shared your availability. You can still add or edit times whenever you like."
                      : declined
                        ? "The host wants to find a time that works for everyone. Pick one or more days below that could work for you instead."
                        : "The host wants to find a time that works for everyone. Confirm the proposed time, or pick one or more days below that could work for you."
                    : "The host wants to find a start time that works for everyone. Join to share which days work for you."
                  : canSuggest
                    ? "The host is open to other start times for this plan. Pick one or more days below."
                    : "The host is open to other start times for this plan. Join to suggest days that could work for you."}
              </Typography>

              {/* --- Group response summary (availability mode, Going+token viewers only) --- */}
              {showResponseSummary && (
                <Box sx={{ mb: 2 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      mb: 0.5,
                      display: "block",
                      fontSize: "0.75rem",
                      fontWeight: viewerHasSuggested ? 500 : 600,
                      opacity: viewerHasSuggested ? 0.75 : 1,
                    }}
                  >
                    Responses ({respondedParticipants.length}/{participants.length})
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.5 }}>
                    {respondedParticipants.map((p) => (
                      <Chip
                        key={p.userId}
                        label={p.name.split(" ")[0]}
                        size="small"
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                        color="success"
                        variant="outlined"
                        sx={{ height: 24, fontSize: "0.75rem" }}
                      />
                    ))}
                    {pendingParticipants.map((p) => (
                      <Chip
                        key={p.userId}
                        label={p.name.split(" ")[0]}
                        size="small"
                        variant="outlined"
                        sx={{ height: 24, fontSize: "0.75rem", opacity: 0.5, borderStyle: "dashed" }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              {isAvailMode && canSuggest && !viewerHasSuggested && event.availabilityDeadlineAt && (
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1.5 }}>
                  <AccessTimeRoundedIcon sx={{ fontSize: 16, color: "warning.main" }} />
                  <Typography
                    variant="body2"
                    sx={{ color: "warning.dark", fontSize: "0.8125rem" }}
                  >
                    Please share your availability by{" "}
                    <strong>
                      {new Date(event.availabilityDeadlineAt).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </strong>
                  </Typography>
                </Stack>
              )}

              {/* --- Quick confirm: only when the listed time is still a real
                   option for the viewer. Hidden for declined viewers, who
                   shouldn't be nudged to confirm a time they already turned
                   down. --- */}
              {isAvailMode && canSuggest && !viewerHasSuggested && !declined && (
                <Box
                  sx={{
                    mb: 2,
                    pl: 2,
                    borderLeft: "3px solid",
                    borderColor: "warning.main",
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Box
                        sx={{
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          border: "2px solid",
                          borderColor: "warning.main",
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" fontWeight={600}>
                        {"You haven't responded yet"}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                      <Button
                        variant="contained"
                        size="small"
                        color="success"
                        disabled={quickConfirming}
                        onClick={handleQuickConfirm}
                        startIcon={<CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
                        sx={{ textTransform: "none", fontWeight: 600 }}
                      >
                        {quickConfirming ? "Saving..." : "This time works for me"}
                      </Button>
                    </Stack>
                  </Stack>
                </Box>
              )}

              {/* --- Inline edit form for an existing entry --- */}
              {altEditingId && (
                  <Paper
                    ref={altEditFormRef}
                    variant="outlined"
                    sx={{
                      p: 2,
                      mb: 1.5,
                      borderRadius: 2,
                      borderColor: "primary.light",
                      // Sit below any fixed app-shell header when scrolled
                      // into view via scrollIntoView({ block: "start" }).
                      scrollMarginTop: 96,
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                      {isAvailMode ? "Edit your availability" : "Edit your suggested time"}
                    </Typography>
                    <Stack spacing={1.5}>
                      <Box>
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          sx={{ display: "block", mb: 0.625 }}
                        >
                          Date
                        </Typography>
                        <DatePicker
                          value={altEditDate}
                          onChange={setAltEditDate}
                          minDate={dayjs().startOf("day")}
                          slotProps={{
                            textField: {
                              fullWidth: true,
                              size: "small",
                              placeholder: "Pick a date",
                              onKeyDown: pickerFieldTabKeyDown,
                            },
                          }}
                        />
                      </Box>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={altEditAnytime}
                            onChange={(e) => {
                              const v = e.target.checked;
                              setAltEditAnytime(v);
                              if (v) {
                                setAltEditStartTime(null);
                                setAltEditEndTime(null);
                              }
                            }}
                          />
                        }
                        label="Start anytime"
                      />
                      {!altEditAnytime && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="subtitle1"
                              fontWeight={600}
                              sx={{ display: "block", mb: 0.625 }}
                            >
                              Earliest start
                            </Typography>
                            <TimePicker
                              value={altEditStartTime}
                              onChange={setAltEditStartTime}
                              format="h:mm A"
                              enableAccessibleFieldDOMStructure={false}
                              slotProps={{
                                field: {
                                  shouldRespectLeadingZeros: true,
                                } as Record<string, unknown>,
                                textField: {
                                  fullWidth: true,
                                  size: "small",
                                  placeholder: "Earliest start",
                                },
                              }}
                            />
                          </Box>
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="subtitle1"
                              fontWeight={600}
                              sx={{ display: "block", mb: 0.625 }}
                            >
                              Latest start
                            </Typography>
                            <TimePicker
                              value={altEditEndTime}
                              onChange={setAltEditEndTime}
                              format="h:mm A"
                              enableAccessibleFieldDOMStructure={false}
                              slotProps={{
                                field: {
                                  shouldRespectLeadingZeros: true,
                                } as Record<string, unknown>,
                                textField: {
                                  fullWidth: true,
                                  size: "small",
                                  placeholder: "Latest start",
                                },
                              }}
                            />
                          </Box>
                        </Stack>
                      )}
                      <Stack direction="row" spacing={1}>
                        <AppButton
                          size="small"
                          onClick={handleAltEditSave}
                          disabled={altSubmitting}
                        >
                          {altSubmitting ? "Saving..." : "Save"}
                        </AppButton>
                        <Button
                          size="small"
                          onClick={resetAltEditForm}
                          sx={{ textTransform: "none" }}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}

                {/* --- Multi-date availability picker (always visible to permitted viewers) --- */}
                {!altEditingId && canSuggest && (
                  <AvailabilityPicker
                      mode={isAvailMode ? "availability" : "suggest"}
                      planStartsAt={event.startsAt}
                      existingDayKeys={
                        new Set(
                          altTimes
                            .filter((e) => e.userId === viewerUserId)
                            .map((e) => {
                              const d = new Date(e.suggestedAt);
                              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
                                2,
                                "0"
                              )}-${String(d.getDate()).padStart(2, "0")}`;
                            })
                        )
                      }
                      submitting={altSubmitting}
                      onSubmit={handleAvailabilityShare}
                    />
                )}

            </AppCard>

            {/* Card 2: review of what's been shared. Hidden entirely when there
                is nothing to display, so non-Going viewers (and viewers in a
                fresh plan with no submissions) don't see an empty container. */}
            {sharedCardHasContent && (
              <AppCard>
                <Typography
                  variant="h5"
                  fontWeight={700}
                  sx={{ mb: 1.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
                >
                  {sharedCardTitle}
                </Typography>

                {/* Best overlap */}
                {allOverlaps.length > 0 && (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      mb: 1.5,
                      borderColor: "primary.main",
                      backgroundColor: "action.hover",
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      fontWeight={700}
                      sx={{ mb: 1, color: "primary.main" }}
                    >
                      {isAvailMode ? "Best overlap" : "Best start times"}
                    </Typography>
                    <Stack spacing={0} divider={<Divider />}>
                      {allOverlaps.map((ov, oi) => {
                        const allRanged = ov.entries.every((e) => !!e.endsAt);
                        const overlapIsAnytime = isAnytimeWindow(
                          ov.startMs,
                          allRanged ? ov.endMs : null
                        );
                        const ovStart = fmtTime(new Date(ov.startMs));
                        const ovEnd = allRanged ? fmtTime(new Date(ov.endMs)) : null;
                        const isBest =
                          ov.entries.length === globalBestOverlapCount &&
                          globalBestOverlapCount > 1;
                        return (
                          <Stack
                            key={`ov-${oi}`}
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ py: 1 }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Stack
                                direction="row"
                                alignItems="center"
                                spacing={0.75}
                                sx={{ flexWrap: "wrap" }}
                              >
                                <Typography variant="body2" fontWeight={600} color="primary.main">
                                  {fmtDay(ov.date)},{" "}
                                  {overlapIsAnytime
                                    ? "anytime"
                                    : ovEnd
                                      ? `${ovStart} - ${ovEnd}`
                                      : ovStart}
                                </Typography>
                                <Chip
                                  label={`${ov.entries.length} overlap${isBest ? " -- best fit" : ""}`}
                                  size="small"
                                  color={isBest ? "primary" : "default"}
                                  variant={isBest ? "filled" : "outlined"}
                                  sx={{ height: 22, fontSize: "0.75rem", fontWeight: 600 }}
                                />
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {ov.entries.map((e) => e.name).join(", ")}
                              </Typography>
                            </Box>
                            {event.isHost && (
                              <Tooltip title="Make official time" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() =>
                                    setPromoteConfirmTime(new Date(ov.startMs).toISOString())
                                  }
                                  aria-label="Make official time"
                                >
                                  <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                        );
                      })}
                    </Stack>
                  </Paper>
                )}

                {/* Day-grouped entries */}
                {dayGroups.length > 0 && (
                  <Stack spacing={1.5}>
                    {dayGroups.map((dg) => {
                      const dayLabel = dg.date.toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      });

                      return (
                        <Paper key={dg.dayKey} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                          <Typography
                            variant="subtitle2"
                            fontWeight={700}
                            sx={{ mb: 1, color: "text.primary" }}
                          >
                            {dayLabel}
                          </Typography>

                          <Stack spacing={0} divider={<Divider />}>
                            {dg.entries.map((entry) => {
                              const isOwn = entry.userId === viewerUserId;
                              const entryWindow = formatEntryWindow(
                                entry.suggestedAt,
                                entry.endsAt
                              );
                              return (
                                <Stack
                                  key={entry.id}
                                  direction="row"
                                  alignItems="center"
                                  justifyContent="space-between"
                                  sx={{ py: 0.75 }}
                                >
                                  <Box sx={{ minWidth: 0 }}>
                                    <Stack
                                      direction="row"
                                      alignItems="center"
                                      spacing={0.5}
                                      sx={{ flexWrap: "wrap" }}
                                    >
                                      <Typography variant="body2" color="text.primary">
                                        {entryWindow}
                                      </Typography>
                                      <Typography variant="body2" color="text.disabled">
                                        &middot;
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary" noWrap>
                                        {entry.handle ? (
                                          <Link
                                            href={`/u/${entry.handle.replace(/^@/, "")}`}
                                            style={{ color: "inherit", textDecoration: "none" }}
                                          >
                                            {entry.name}
                                          </Link>
                                        ) : (
                                          entry.name
                                        )}
                                      </Typography>
                                    </Stack>
                                  </Box>
                                  <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
                                    {event.isHost && (
                                      <Tooltip title="Make official time" arrow>
                                        <IconButton
                                          size="small"
                                          onClick={() => setPromoteConfirmTime(entry.suggestedAt)}
                                          aria-label="Make official time"
                                        >
                                          <AccessTimeRoundedIcon
                                            sx={{ fontSize: 16, color: "text.disabled" }}
                                          />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    {isOwn && (
                                      <IconButton
                                        size="small"
                                        onClick={() => handleAltTimeEdit(entry)}
                                        aria-label="Edit"
                                      >
                                        <EditRoundedIcon
                                          sx={{ fontSize: 16, color: "text.disabled" }}
                                        />
                                      </IconButton>
                                    )}
                                    {(isOwn || event.isHost) && (
                                      <IconButton
                                        size="small"
                                        onClick={() => handleAltTimeDelete(entry.id)}
                                        disabled={altDeleting === entry.id}
                                        aria-label="Remove"
                                      >
                                        <DeleteOutlineRoundedIcon
                                          sx={{ fontSize: 16, color: "text.disabled" }}
                                        />
                                      </IconButton>
                                    )}
                                  </Stack>
                                </Stack>
                              );
                            })}
                          </Stack>
                        </Paper>
                      );
                    })}
                  </Stack>
                )}
              </AppCard>
            )}
            </Stack>
          );
        })()}

      {/* Promote confirmation dialog */}
      <Dialog
        open={!!promoteConfirmTime}
        onClose={() => setPromoteConfirmTime(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Update official plan time?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This will change the official plan time to{" "}
            <strong>{promoteConfirmTime ? formatDateTime(promoteConfirmTime) : ""}</strong>. Going
            and Maybe attendees will be notified.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => setPromoteConfirmTime(null)}
            disabled={promoting}
          >
            Cancel
          </Button>
          <Button variant="contained" onClick={handlePromoteAltTime} disabled={promoting}>
            {promoting ? "Updating…" : "Update plan time"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Who's in, combined RSVP + invite status */}
      {(rsvps.length > 0 || pendingInvites.length > 0) && (
        <AppCard id="plan-section-attendees">
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
          >
            Who&apos;s in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.5 }}>
            {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
            {declinedCount > 0 ? `, ${declinedCount} can't make it` : ""}
            {reservedSeatCount > 0 ? `, ${reservedSeatCount} invited` : ""}
            {event.maxSeats
              ? ` · ${Math.max(0, event.maxSeats - goingCount - reservedSeatCount)} seat${event.maxSeats - goingCount - reservedSeatCount === 1 ? "" : "s"} remaining`
              : ""}
            {event.requireReconfirmation && (event.confirmationWindowOpen || event.confirmationsIssued) && event.confirmedCount > 0
              ? ` · ${event.confirmedCount} confirmed`
              : ""}
          </Typography>
          <Stack spacing={0}>
            {/* RSVP'd participants */}
            {rsvps.map((r) => (
              <Box
                key={r.userId}
                sx={{
                  py: 1.75,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:last-child": { borderBottom: pendingInvites.length > 0 ? undefined : "none" },
                }}
              >
                <Stack direction="row" alignItems="center" spacing={2}>
                  <UserAvatar
                    src={r.avatarUrl ? `${avatarBaseUrl}${r.avatarUrl}` : null}
                    name={r.name}
                    size={44}
                    sx={{ flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {r.handle ? (
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          component={Link}
                          href={`/u/${r.handle.replace(/^@/, "")}`}
                          variant="body1"
                          fontWeight={600}
                          sx={{
                            fontSize: "1rem",
                            color: "text.primary",
                            textDecoration: "none",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            "&:hover": { textDecoration: "underline" },
                          }}
                        >
                          {r.handle}
                        </Typography>
                        {r.name && r.name !== r.handle.replace(/^@/, "") && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {r.name}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body1"
                            fontWeight={600}
                            sx={{
                              fontSize: "1rem",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: "text.primary",
                            }}
                          >
                            {r.name}
                          </Typography>
                        </Stack>
                      </Box>
                    )}
                  </Box>
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    useFlexGap
                    flexWrap="wrap"
                    sx={{ flexShrink: 1, justifyContent: "flex-end" }}
                  >
                    {r.prefNotes && r.prefNotes.length > 0 && (
                      <Tooltip
                        title={`This attendee does not match your ${r.prefNotes.map((m) => PREF_NOTE_LABELS[m] ?? m).join(" or ")} chum preferences`}
                        arrow
                        placement="top"
                        enterTouchDelay={0}
                      >
                        <FlagRoundedIcon
                          sx={{ fontSize: 16, color: "warning.main", cursor: "help" }}
                        />
                      </Tooltip>
                    )}
                    {r.status === "going" && event.requireReconfirmation && (event.confirmationWindowOpen || event.confirmationsIssued) && r.confirmationStatus === "confirmed" ? (
                      /* Merged badge: Going + Confirmed */
                      <Tooltip title="This person confirmed they are still coming via the 24-hour attendance check" arrow placement="top" enterTouchDelay={0}>
                        <Chip
                          icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                          label="Going & Confirmed"
                          size="small"
                          color="success"
                          variant="filled"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            "& .MuiChip-icon": { color: "inherit", opacity: 0.9 },
                            background: (theme) => `linear-gradient(135deg, ${theme.palette.success.main} 0%, ${theme.palette.success.dark} 100%)`,
                          }}
                        />
                      </Tooltip>
                    ) : r.status === "going" && event.requireReconfirmation && event.confirmationsIssued && !event.confirmationWindowOpen && (r.confirmationStatus === "expired" || r.confirmationStatus === "pending" || r.confirmationStatus == null) ? (
                      /* After the confirmation cycle finished (window closed or plan canceled): show explicit "didn't confirm" for Going attendees who never responded, so the reason for a min_attendees_not_met cancellation is visible. */
                      <Tooltip title="This person said they were going but didn't respond to the 24-hour attendance check in time" arrow placement="top" enterTouchDelay={0}>
                        <Chip
                          icon={<InfoOutlinedIcon sx={{ fontSize: "1rem !important" }} />}
                          label="Going - Didn't confirm"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            "& .MuiChip-icon": { color: "inherit", opacity: 0.85 },
                          }}
                        />
                      </Tooltip>
                    ) : r.status === "going" && event.confirmationWindowOpen && r.confirmationStatus !== "confirmed" && r.confirmationStatus !== "declined" ? (
                      /* Merged badge: Going + Pending/no confirmation during the open window */
                      <Tooltip title="This person said they're going but hasn't responded to the 24-hour attendance check yet" arrow placement="top" enterTouchDelay={0}>
                        <Chip
                          icon={<AccessTimeRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                          label="Going - Unconfirmed"
                          size="small"
                          color="warning"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            "& .MuiChip-icon": { color: "inherit", opacity: 0.85 },
                          }}
                        />
                      </Tooltip>
                    ) : r.status === "going" ? (
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
                        label={"Can't make it"}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 500, fontSize: "0.8125rem", color: "text.secondary" }}
                      />
                    )}
                    {/* Show confirmation status badge for non-merged states (exclude going+confirmed and going+pending which are merged above) */}
                    {event.confirmationWindowOpen && r.confirmationStatus && !(r.status === "going" && (r.confirmationStatus === "confirmed" || r.confirmationStatus === "pending")) && (
                      <Chip
                        label={
                          r.confirmationStatus === "pending"
                            ? "Awaiting response"
                            : r.confirmationStatus === "declined"
                              ? "Declined"
                              : r.confirmationStatus === "confirmed"
                                ? "Confirmed"
                                : "No response"
                        }
                        size="small"
                        color={
                          r.confirmationStatus === "confirmed"
                            ? "success"
                            : r.confirmationStatus === "pending"
                              ? "warning"
                              : "default"
                        }
                        variant={r.confirmationStatus === "confirmed" ? "filled" : "outlined"}
                        sx={{ fontWeight: 500, fontSize: "0.6875rem" }}
                      />
                    )}
                    {/* Overflow menu trigger, only when at least one menu item would render for this row */}
                    {(
                      (viewerUserId && r.userId === viewerUserId) ||
                      (r.handle && r.userId !== viewerUserId) ||
                      (viewerUserId && r.userId !== viewerUserId) ||
                      (event.isHost && !isCanceled && !isPast && r.userId !== event.hostUserId && (r.status === "going" || r.status === "maybe"))
                    ) && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          setAttendeeMenuAnchor(e.currentTarget);
                          setAttendeeMenuTarget(r);
                        }}
                        sx={{ color: "text.disabled", ml: 0.25, "&:hover": { color: "text.primary" } }}
                      >
                        <MoreVertRoundedIcon sx={{ fontSize: "1.125rem" }} />
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
                {r.note && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      mt: 0.5,
                      ml: 7.5,
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      fontSize: "0.8125rem",
                    }}
                  >
                    &ldquo;{r.note}&rdquo;
                  </Typography>
                )}
              </Box>
            ))}

            {/* Pending invites (awaiting response) */}
            {pendingInvites.map((inv, idx) => {
              const invHandleSlug = inv.handle?.replace(/^@/, "") ?? null;
              const invProfileHref = invHandleSlug ? `/u/${invHandleSlug}` : null;
              return (
                <Stack
                  key={inv.userId ?? inv.email ?? `inv-${idx}`}
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{
                    py: 1.75,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-child": { borderBottom: "none" },
                    opacity: 0.75,
                  }}
                >
                  <UserAvatar name={inv.name} size={44} sx={{ flexShrink: 0 }} />
                  <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {invProfileHref ? (
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          component={Link}
                          href={invProfileHref}
                          variant="body1"
                          fontWeight={600}
                          sx={{
                            fontSize: "1rem",
                            color: "text.primary",
                            textDecoration: "none",
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            "&:hover": { textDecoration: "underline" },
                          }}
                        >
                          {inv.handle}
                        </Typography>
                        {inv.name && inv.name !== invHandleSlug && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {inv.name}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        sx={{
                          fontSize: "1rem",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {inv.name || inv.email}
                      </Typography>
                    )}
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.5}
                      useFlexGap
                      flexWrap="wrap"
                      sx={{ flexShrink: 1, justifyContent: "flex-end" }}
                    >
                      <Chip
                        icon={<MailOutlineRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                        label={event.reserveSeats ? "Invited · Seat held" : "Invited"}
                        size="small"
                        variant="outlined"
                        color="info"
                        sx={{ fontWeight: 600, fontSize: "0.75rem", "& .MuiChip-label": { pr: 1.25 }, "& .MuiChip-icon": { ml: 1 } }}
                      />
                      {/* Overflow menu for pending invites, show when there's at least one action */}
                      {(invProfileHref || (event.isHost && !isCanceled && !isPast && inv.userId !== null)) && (
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            setInviteMenuAnchor(e.currentTarget);
                            setInviteMenuTarget(inv);
                          }}
                          sx={{ color: "text.disabled", ml: 0.25, "&:hover": { color: "text.primary" } }}
                        >
                          <MoreVertRoundedIcon sx={{ fontSize: "1.125rem" }} />
                        </IconButton>
                      )}
                    </Stack>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        </AppCard>
      )}

      {/* Plan Chat. `chatEligible` is the live source of truth (host or
          "going" RSVP). `chatAccessible` only confirms the prior fetch
          succeeded; on its own it stays true after the user toggles their
          RSVP to maybe/can't, leaving the card visible but unresponsive. */}
      {chatEligible && chatAccessible === true && !isCanceled && (
        <AppCard id="plan-section-chat">
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
            >
              Plan Chat
            </Typography>
            {event.lockedAt && (
              <Chip
                icon={<LockRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                label="Locked"
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: "0.75rem" }}
              />
            )}
          </Stack>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: isPast && !isChatLocked ? 0.5 : 2, lineHeight: 1.5, fontSize: "0.8125rem" }}
          >
            Visible to current participants only. Be thoughtful about what you share.
          </Typography>
          {isPast && !isChatLocked && (
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 2 }}>
              <AccessTimeRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              <Typography variant="caption" color="text.disabled">
                Chat locks on{" "}
                {chatLockDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                .
              </Typography>
            </Stack>
          )}

          {/* Message list */}
          <Box
            ref={chatContainerRef}
            sx={{
              maxHeight: { xs: "50vh", sm: 400 },
              overflowY: "auto",
              mb: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              bgcolor: "grey.50",
            }}
          >
            {chatLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress size={24} />
              </Box>
            ) : chatMessages.length === 0 ? (
              <Box sx={{ textAlign: "center", py: 6, px: 2 }}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  No messages yet. This is your big moment to say hi!
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0} sx={{ p: { xs: 1.5, sm: 2 } }}>
                {chatMessages.map((msg, idx) => {
                  const showUnreadDivider =
                    chatLastReadAt &&
                    idx > 0 &&
                    new Date(msg.createdAt) > new Date(chatLastReadAt) &&
                    (idx === 0 ||
                      new Date(chatMessages[idx - 1].createdAt) <= new Date(chatLastReadAt));
                  return (
                    <Box key={msg.id}>
                      {showUnreadDivider && (
                        <Divider
                          sx={{
                            my: 1.5,
                            fontSize: "0.75rem",
                            color: "primary.main",
                            fontWeight: 600,
                          }}
                        >
                          New messages
                        </Divider>
                      )}
                      <Stack direction="row" spacing={1.5} sx={{ py: 1 }}>
                        <UserAvatar
                          src={msg.avatarUrl ? `${avatarBaseUrl}${msg.avatarUrl}` : null}
                          name={msg.senderName}
                          size={32}
                          sx={{ flexShrink: 0, mt: 0.25 }}
                        />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack
                            direction="row"
                            alignItems="baseline"
                            spacing={1}
                            sx={{ mb: 0.25 }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{ fontSize: "0.8125rem" }}
                            >
                              {msg.senderHandle || msg.senderName}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.disabled"
                              sx={{ fontSize: "0.6875rem", flexShrink: 0 }}
                            >
                              {formatChatTime(msg.createdAt)}
                            </Typography>
                          </Stack>
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: "0.875rem",
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {msg.body}
                          </Typography>
                        </Box>
                      </Stack>
                    </Box>
                  );
                })}
                <div ref={chatEndRef} />
              </Stack>
            )}
          </Box>

          {/* Composer / lock notice */}
          {isChatLocked ? (
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}
            >
              <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                This chat was locked 3 days after the plan took place.
              </Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1} alignItems="flex-end">
              <TextField
                fullWidth
                size="small"
                placeholder="Write a message…"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
                multiline
                maxRows={4}
                disabled={chatSending}
                slotProps={{ htmlInput: { enterKeyHint: "send" } }}
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
              />
              <IconButton
                color="primary"
                onClick={handleSendChat}
                disabled={chatSending || !chatInput.trim()}
                sx={{ flexShrink: 0 }}
              >
                {chatSending ? <CircularProgress size={20} /> : <SendRoundedIcon />}
              </IconButton>
            </Stack>
          )}
        </AppCard>
      )}

      {/* Host actions */}
      {event.isHost && !isCanceled && (
        <AppCard>
          {isEditLocked && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Editing is locked because this plan has already happened.
            </Typography>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<EditRoundedIcon />}
              onClick={() => router.push(`/events/${eventId}/edit`)}
              disabled={isEditLocked}
              sx={{ textTransform: "none" }}
            >
              Edit plan
            </Button>
            <Button
              variant="outlined"
              startIcon={event.lockedAt ? <LockOpenRoundedIcon /> : <LockRoundedIcon />}
              onClick={() => {
                if (event.lockedAt) {
                  void performLockToggle();
                } else {
                  setLockDialogOpen(true);
                }
              }}
              disabled={lockToggling || isEditLocked}
              sx={{ textTransform: "none" }}
            >
              {lockToggling ? "Updating…" : event.lockedAt ? "Unlock plan" : "Lock plan"}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setCancelDialogOpen(true)}
              disabled={isEditLocked}
              sx={{ textTransform: "none" }}
            >
              Cancel this plan
            </Button>
          </Stack>
        </AppCard>
      )}

      {/* Lock plan confirmation (locking only; unlock stays one-click) */}
      <Dialog
        open={lockDialogOpen}
        onClose={() => !lockToggling && setLockDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Lock this plan?</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              Locking this plan prevents anyone new from joining.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              People who have already joined will keep access and can still use the chat.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              Attendees marked Going or Maybe will receive an update email.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => setLockDialogOpen(false)}
            disabled={lockToggling}
          >
            Not now
          </Button>
          <Button
            variant="contained"
            onClick={() => void performLockToggle()}
            disabled={lockToggling}
            startIcon={
              lockToggling ? <CircularProgress size={14} color="inherit" /> : <LockRoundedIcon />
            }
            sx={{ textTransform: "none" }}
          >
            {lockToggling ? "Locking..." : "Lock plan"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => !canceling && setCancelDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Cancel this plan?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            This will mark the plan as canceled and notify anyone who has responded. This action
            cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => setCancelDialogOpen(false)}
            disabled={canceling}
          >
            Keep plan
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancelConfirm}
            disabled={canceling}
            startIcon={canceling ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {canceling ? "Canceling…" : "Yes, cancel it"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendee overflow menu */}
      <Menu
        anchorEl={attendeeMenuAnchor}
        open={Boolean(attendeeMenuAnchor) && Boolean(attendeeMenuTarget)}
        onClose={() => { setAttendeeMenuAnchor(null); setAttendeeMenuTarget(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              borderRadius: 2.5,
              mt: 0.5,
              "@keyframes menuFadeIn": {
                from: { opacity: 0, transform: "scale(0.95) translateY(-4px)" },
                to: { opacity: 1, transform: "scale(1) translateY(0)" },
              },
              animation: "menuFadeIn 150ms ease-out",
            },
          },
        }}
      >
        {/* Hide / Show my name (self only) */}
        {attendeeMenuTarget && viewerUserId && attendeeMenuTarget.userId === viewerUserId && (
          <MenuItem
            onClick={async () => {
              const target = attendeeMenuTarget;
              setAttendeeMenuAnchor(null);
              setAttendeeMenuTarget(null);
              try {
                const res = await apiFetch(`/events/${event.id}/hide-name`, { auth: true, method: "POST" });
                const data = await res.json();
                if (data.ok) {
                  setRsvps((prev) => prev.map((r) =>
                    r.userId === target.userId ? { ...r, hideName: data.hideName } : r
                  ));
                  toast.success(data.hideName ? "Your name is now hidden on this plan" : "Your name is now visible on this plan");
                  refresh();
                }
              } catch { /* noop */ }
            }}
          >
            <ListItemIcon>
              {attendeeMenuTarget.hideName
                ? <VisibilityRoundedIcon fontSize="small" />
                : <VisibilityOffRoundedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{attendeeMenuTarget.hideName ? "Show my name" : "Hide my name"}</ListItemText>
          </MenuItem>
        )}
        {/* View profile */}
        {attendeeMenuTarget?.handle && attendeeMenuTarget.userId !== viewerUserId && (
          <MenuItem
            component={Link}
            href={`/u/${attendeeMenuTarget.handle.replace(/^@/, "")}`}
            onClick={() => { setAttendeeMenuAnchor(null); setAttendeeMenuTarget(null); }}
          >
            <ListItemIcon><OpenInNewRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>View profile</ListItemText>
          </MenuItem>
        )}
        {/* Add to / Remove from Chums */}
        {attendeeMenuTarget && viewerUserId && attendeeMenuTarget.userId !== viewerUserId && (
          <MenuItem
            disabled={chumToggling}
            onClick={() => attendeeMenuTarget && handleToggleChum(attendeeMenuTarget)}
          >
            <ListItemIcon>
              {attendeeMenuTarget.isChumSaved
                ? <BookmarkRemoveRoundedIcon fontSize="small" />
                : <BookmarkAddRoundedIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{attendeeMenuTarget.isChumSaved ? "Remove from Chums" : "Add to Chums"}</ListItemText>
          </MenuItem>
        )}
        {/* Remove from plan (host only) */}
        {event.isHost && !isCanceled && !isPast &&
          attendeeMenuTarget &&
          attendeeMenuTarget.userId !== event.hostUserId &&
          (attendeeMenuTarget.status === "going" || attendeeMenuTarget.status === "maybe") && (
          <MenuItem
            onClick={() => {
              if (!attendeeMenuTarget) return;
              setRemoveTarget({
                type: "rsvp",
                userId: attendeeMenuTarget.userId,
                name: attendeeMenuTarget.name,
              });
              setRemoveReason("");
              setRemoveDialogOpen(true);
              setAttendeeMenuAnchor(null);
              setAttendeeMenuTarget(null);
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon><PersonRemoveRoundedIcon fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
            <ListItemText>Remove from plan</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Invite overflow menu */}
      <Menu
        anchorEl={inviteMenuAnchor}
        open={Boolean(inviteMenuAnchor) && Boolean(inviteMenuTarget)}
        onClose={() => { setInviteMenuAnchor(null); setInviteMenuTarget(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              minWidth: 180,
              borderRadius: 2.5,
              mt: 0.5,
              "@keyframes menuFadeIn": {
                from: { opacity: 0, transform: "scale(0.95) translateY(-4px)" },
                to: { opacity: 1, transform: "scale(1) translateY(0)" },
              },
              animation: "menuFadeIn 150ms ease-out",
            },
          },
        }}
      >
        {inviteMenuTarget?.handle && (
          <MenuItem
            component={Link}
            href={`/u/${inviteMenuTarget.handle.replace(/^@/, "")}`}
            onClick={() => { setInviteMenuAnchor(null); setInviteMenuTarget(null); }}
          >
            <ListItemIcon><OpenInNewRoundedIcon fontSize="small" /></ListItemIcon>
            <ListItemText>View profile</ListItemText>
          </MenuItem>
        )}
        {event.isHost && !isCanceled && !isPast && inviteMenuTarget?.userId !== null && (
          <MenuItem
            onClick={() => {
              if (!inviteMenuTarget) return;
              setRemoveTarget({
                type: "invite",
                userId: inviteMenuTarget.userId,
                email: inviteMenuTarget.email,
                name: inviteMenuTarget.name || inviteMenuTarget.email || "this person",
              });
              setRemoveReason("");
              setRemoveDialogOpen(true);
              setInviteMenuAnchor(null);
              setInviteMenuTarget(null);
            }}
            sx={{ color: "error.main" }}
          >
            <ListItemIcon><PersonRemoveRoundedIcon fontSize="small" sx={{ color: "error.main" }} /></ListItemIcon>
            <ListItemText>Remove invite</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Remove attendee confirmation dialog */}
      <Dialog
        open={removeDialogOpen}
        onClose={() => !removing && setRemoveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          {removeTarget?.type === "invite" ? "Remove invite?" : "Remove attendee?"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1.5 }}>
            <strong>{removeTarget?.name || "This person"}</strong>{" "}
            {removeTarget?.type === "invite"
              ? "will have their invite to this plan removed and will be notified by email."
              : "will be removed from your plan and notified by email."}
          </Typography>
          <TextField
            multiline
            minRows={2}
            maxRows={4}
            fullWidth
            label="Reason (optional)"
            placeholder="E.g. Plans changed / Need to reduce the group size / This plan isn't the right fit…"
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value.slice(0, 500))}
            inputProps={{ maxLength: 500 }}
            helperText={`${removeReason.length}/500, This will be included in the notification email to the attendee.`}
            sx={{ mb: 2 }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 1.5 }}>
            This action is recorded by the system. Attendee removals may be considered in future
            host quality and trust metrics.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Removing someone is completely your call as a host, just use it thoughtfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => {
              setRemoveDialogOpen(false);
              setRemoveTarget(null);
              setRemoveReason("");
            }}
            disabled={removing}
          >
            Keep them
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRemoveAttendee}
            disabled={removing}
            startIcon={
              removing ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <PersonRemoveRoundedIcon />
              )
            }
          >
            {removing ? "Removing..." : "Remove attendee"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* RSVP confirmation dialog */}
      <Dialog
        open={rsvpDialogOpen}
        onClose={() => setRsvpDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {rsvpDialogStatus === "going"
            ? "Confirm you're going"
            : rsvpDialogStatus === "maybe"
              ? "RSVP as maybe"
              : "Can't make it"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Add an optional message, it will be sent to the host and shown on the plan details.
          </Typography>
          <TextField
            multiline
            minRows={2}
            maxRows={4}
            fullWidth
            placeholder="An optional message for the group"
            value={rsvpDialogMessage}
            onChange={(e) => setRsvpDialogMessage(e.target.value.slice(0, 500))}
            inputProps={{ maxLength: 500 }}
            helperText={`${rsvpDialogMessage.length}/500`}
          />
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button variant="text" color="inherit" onClick={() => setRsvpDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRsvpConfirm} disabled={rsvpSubmitting}>
            {rsvpDialogStatus === "going"
              ? "I'm going"
              : rsvpDialogStatus === "maybe"
                ? "Maybe"
                : "Can't make it"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share link first-use info modal */}
      <Dialog open={shareLinkModalOpen} onClose={handleShareLinkModalClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <CheckCircleRoundedIcon sx={{ color: "success.main", fontSize: 22 }} />
            <span>Link copied!</span>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.65 }}>
            Paste this link to share the plan. Anyone with it can:
          </Typography>
          <Stack spacing={1} sx={{ mb: 2 }}>
            {[
              "View the full plan details",
              "RSVP (Going, Maybe, or Can\u2019t make it)",
              ...(event?.allowAltTimes
                ? [event.altTimesMode === "availability"
                    ? "Share their availability"
                    : "Suggest an alternative time"]
                : []),
            ].map((item) => (
              <Stack key={item} direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{item}</Typography>
              </Stack>
            ))}
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.65 }}>
            Recipients don&rsquo;t need a NewChums account to respond.
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={shareLinkDontShowAgain}
                onChange={(e) => setShareLinkDontShowAgain(e.target.checked)}
              />
            }
            label={<Typography variant="body2">Don&rsquo;t show this again</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 2.5 }, gap: 1 }}>
          <Button onClick={handleShareLinkModalClose} variant="contained">
            Got it
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
