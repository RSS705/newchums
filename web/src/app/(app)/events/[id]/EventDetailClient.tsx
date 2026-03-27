"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import IconButton from "@mui/material/IconButton";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
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
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import UserAvatar from "@/components/common/UserAvatar";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
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

/** Meeting URLs pasted without a scheme should still open in the browser. */
function normalizeMeetingLinkHref(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

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
  altTimesMode?: string;
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
  guestInvite?: boolean;
  guestEmail?: string;
  guestRsvpStatus?: string | null;
  goingCount?: number;
  maybeCount?: number;
  // Attendance assurance
  minConfirmedAttendees: number | null;
  fallbackPolicy: string | null;
  confirmationWindowOpen: boolean;
  confirmationCutoffAt: string | null;
  confirmedCount: number;
  pendingConfirmationCount: number;
  myConfirmationStatus: string | null;
  planViability: string | null;
  community?: { id: string; slug: string; name: string } | null;
  hideFromExplore?: boolean;
};

type RsvpEntry = {
  userId: string;
  name: string;
  handle: string | null;
  status: string;
  note: string | null;
  avatarUrl?: string | null;
  confirmationStatus?: string | null;
  isGuest?: boolean;
  guestEmail?: string | null;
  prefNotes?: string[] | null;
};
type AltTimeEntry = {
  id: string;
  userId: string;
  name: string;
  handle: string | null;
  suggestedAt: string;
  endsAt: string | null;
  note: string | null;
  guestEmail?: string | null;
};
type InviteEntry = {
  userId: string | null;
  email: string | null;
  name: string;
  handle?: string | null;
};
type RemoveTarget =
  | { type: "rsvp"; userId: string; name: string; guestEmail?: string | null }
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
  });
}

function visibilityLabel(v: string): string {
  if (v === "invite_only") return "Invite only";
  if (v === "chums_only") return "Chums only";
  return "Public";
}

const VALID_RSVP_PARAMS = ["going", "maybe", "cant_make_it"] as const;

const PREF_NOTE_LABELS: Record<string, string> = {
  reliability: "reliability",
  sociability: "sociability",
  presentation: "personal care",
  hosting_skills: "hosting quality",
};

export default function EventDetailClient() {
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
  const [prefNote, setPrefNote] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpDialogOpen, setRsvpDialogOpen] = useState(false);
  const [rsvpDialogStatus, setRsvpDialogStatus] = useState<string>("");
  const [rsvpDialogMessage, setRsvpDialogMessage] = useState("");
  // Tracks RSVP status set via email invite token (unauthenticated flow)
  const [emailRsvpStatus, setEmailRsvpStatus] = useState<string | null>(null);
  // Attendance assurance
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const [emailConfirmResult, setEmailConfirmResult] = useState<string | null>(null);
  const [showAltTimeForm, setShowAltTimeForm] = useState(false);
  const [altStartDate, setAltStartDate] = useState<Dayjs | null>(null);
  const [altEndDate, setAltEndDate] = useState<Dayjs | null>(null);
  const [altStartTime, setAltStartTime] = useState<Dayjs | null>(null);
  const [altEndTime, setAltEndTime] = useState<Dayjs | null>(null);
  const [altNote, setAltNote] = useState("");
  const [altEditingId, setAltEditingId] = useState<string | null>(null);
  const [altSubmitting, setAltSubmitting] = useState(false);
  const [altDeleting, setAltDeleting] = useState<string | null>(null);
  const [promoteConfirmTime, setPromoteConfirmTime] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const altTimeScrollRef = useRef<HTMLDivElement>(null);

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

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLastReadAt, setChatLastReadAt] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Share token from API response — used by Copy Link to build share-access URLs
  const [shareToken, setShareToken] = useState<string | null>(null);

  const [bannerFailed, setBannerFailed] = useState(false);
  const [bannerUseFallback, setBannerUseFallback] = useState(false);
  const handleBannerError = useCallback(() => {
    if (!bannerUseFallback && getImageFallbackBaseUrl()) {
      setBannerUseFallback(true);
    } else {
      setBannerFailed(true);
    }
  }, [bannerUseFallback]);

  // Copy link — builds a share URL with the share token so recipients get
  // guest access (not just the public preview).
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
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link — please copy it from your browser's address bar");
    }
  }, [eventId, shareToken, toast]);

  // Lock state
  const [lockToggling, setLockToggling] = useState(false);
  const [lockDialogOpen, setLockDialogOpen] = useState(false);

  // Auth detection for logged-out user handling
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    getAuthToken().then((t) => setIsAuthenticated(!!t));
  }, []);

  // ── Public RSVP (share-link visitors) ──────────────────────────────────
  type PubStep = "email" | "code" | "rsvp";
  const [pubStep, setPubStep] = useState<PubStep>("email");
  const [pubEmail, setPubEmail] = useState("");
  const [pubName, setPubName] = useState("");
  const [pubChallenge, setPubChallenge] = useState<string | null>(null);
  const [pubCode, setPubCode] = useState("");
  const [pubSubmitting, setPubSubmitting] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const participationTokenRef = useRef<string | null>(null);
  const [pubRsvpStatus, setPubRsvpStatus] = useState<string | null>(null);

  // Cross-event email pre-fill from any prior public RSVP localStorage entry
  useEffect(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("nc_pub_")) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.email) {
              setPubEmail(parsed.email);
              break;
            }
          }
        }
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Restore participation token for this event from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`nc_pub_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) {
          participationTokenRef.current = parsed.token;
          if (parsed.email) setPubEmail(parsed.email);
          if (parsed.status) setPubRsvpStatus(parsed.status);
          setPubStep("rsvp");
        }
      }
    } catch {
      /* noop */
    }
  }, [eventId]);

  // Restore invite token for this event from localStorage (survives page reloads)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`nc_inv_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.token) inviteTokenRef.current = parsed.token;
      }
    } catch { /* noop */ }
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
    },
    []
  );

  const buildTokenSuffix = useCallback(() => {
    const tok = inviteTokenRef.current ?? participationTokenRef.current ?? shareTokenRef.current;
    if (!tok) return "";
    const key = inviteTokenRef.current
      ? "invite_token"
      : participationTokenRef.current
        ? "participation_token"
        : "share_token";
    return `?${key}=${encodeURIComponent(tok)}`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/events/${eventId}${buildTokenSuffix()}`, { auth: true });
      if (!res.ok) {
        setError("Plan not found");
        setLoading(false);
        return;
      }
      const data = await res.json();
      // If the API returned "public" despite having an invite token, the token is expired/invalid
      if (data.accessState === "public" && inviteTokenRef.current) {
        inviteTokenRef.current = null;
        try { localStorage.removeItem(`nc_inv_${eventId}`); } catch { /* noop */ }
      }
      applyEventData(data);
    } catch {
      setError("Failed to load plan");
    }
    setLoading(false);
  }, [eventId, applyEventData, buildTokenSuffix]);

  const refresh = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}${buildTokenSuffix()}`, { auth: true });
      if (res.ok) {
        const data = await res.json();
        applyEventData(data);
      }
    } catch {
      /* silent */
    }
  }, [eventId, applyEventData, buildTokenSuffix]);

  useEffect(() => {
    load();
  }, [load]);

  // Persistent invite token — survives for the component lifecycle so guests
  // can re-RSVP and access invite-only events without auth.
  // Initialized from URL so the first data fetch includes it.
  const inviteTokenRef = useRef<string | null>(searchParams.get("invite_token"));

  // Share token — from Copy Link share URLs. Grants guest access without an invite.
  const shareTokenRef = useRef<string | null>(searchParams.get("share_token"));

  // Email link context hint (?context=host_review or ?context=request_approved)
  const [emailContext, setEmailContext] = useState<string | null>(null);

  // Auto-RSVP from email link (?rsvp=going&invite_token=xxx)
  const pendingRsvpRef = useRef<string | null>(null);
  const pendingConfirmRef = useRef<{ action: string; token: string } | null>(null);
  useEffect(() => {
    const rsvpParam = searchParams.get("rsvp");
    const inviteTokenParam = searchParams.get("invite_token");
    const shareTokenParam = searchParams.get("share_token");
    const contextParam = searchParams.get("context");
    const confirmParam = searchParams.get("confirm");
    const confirmTokenParam = searchParams.get("confirm_token");
    if (inviteTokenParam) {
      inviteTokenRef.current = inviteTokenParam;
      try { localStorage.setItem(`nc_inv_${eventId}`, JSON.stringify({ token: inviteTokenParam })); } catch { /* noop */ }
    }
    if (shareTokenParam) shareTokenRef.current = shareTokenParam;
    if (rsvpParam && VALID_RSVP_PARAMS.includes(rsvpParam as (typeof VALID_RSVP_PARAMS)[number])) {
      pendingRsvpRef.current = rsvpParam;
    }
    if (confirmParam && confirmTokenParam && (confirmParam === "yes" || confirmParam === "no")) {
      pendingConfirmRef.current = {
        action: confirmParam === "yes" ? "confirm" : "decline",
        token: confirmTokenParam,
      };
    }
    if (contextParam) setEmailContext(contextParam);
    if (
      rsvpParam ||
      inviteTokenParam ||
      shareTokenParam ||
      contextParam ||
      confirmParam ||
      confirmTokenParam
    ) {
      const url = new URL(window.location.href);
      url.searchParams.delete("rsvp");
      url.searchParams.delete("invite_token");
      url.searchParams.delete("share_token");
      url.searchParams.delete("context");
      url.searchParams.delete("confirm");
      url.searchParams.delete("confirm_token");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!event || !pendingRsvpRef.current) return;
    if (event.status === "canceled") {
      pendingRsvpRef.current = null;
      return;
    }
    const rsvpStatus = pendingRsvpRef.current;
    const inviteToken = inviteTokenRef.current;
    pendingRsvpRef.current = null;

    if (inviteToken) {
      // Token-based RSVP — works without login (registered users + guest invitees)
      (async () => {
        setRsvpSubmitting(true);
        try {
          const res = await apiFetch(`/events/${eventId}/email-rsvp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invite_token: inviteToken, status: rsvpStatus }),
          });
          const data = (await res.json()) as {
            ok: boolean;
            error?: string;
            message?: string;
            isGuest?: boolean;
          };
          if (data.ok) {
            setEmailRsvpStatus(rsvpStatus);
            toast.success(
              rsvpStatus === "going"
                ? "You\u2019re going!"
                : rsvpStatus === "maybe"
                  ? "Marked as maybe"
                  : "Response recorded"
            );
            refresh();
          } else {
            toast.error(data.message ?? "Something went wrong");
          }
        } catch {
          toast.error("Network error");
        }
        setRsvpSubmitting(false);
      })();
    } else {
      // Logged-in RSVP — requires auth
      getAuthToken().then((token) => {
        if (token) {
          handleRsvp(rsvpStatus);
        } else {
          const returnUrl = `/events/${eventId}?rsvp=${rsvpStatus}`;
          router.push(`/login?next=${encodeURIComponent(returnUrl)}`);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  // Auto-confirm from email link (?confirm=yes&confirm_token=xxx)
  useEffect(() => {
    if (!event || !pendingConfirmRef.current) return;
    const { action, token } = pendingConfirmRef.current;
    pendingConfirmRef.current = null;

    (async () => {
      setConfirmSubmitting(true);
      try {
        const res = await apiFetch(`/events/${eventId}/email-confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, action }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          status?: string;
          error?: string;
          message?: string;
        };
        if (data.ok) {
          setEmailConfirmResult(data.status ?? (action === "confirm" ? "confirmed" : "declined"));
          toast.success(action === "confirm" ? "Attendance confirmed!" : "Response recorded");
          refresh();
        } else {
          toast.error(data.message ?? "This link has expired or is invalid.");
        }
      } catch {
        toast.error("Network error");
      }
      setConfirmSubmitting(false);
    })();
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
  const chatEligible = !!event && event.status !== "canceled" && (event.isHost || event.hasRsvp);
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

  const [suggestTime, setSuggestTime] = useState(false);

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
          suggest_time: suggestTime || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Invite sent!");
        setInviteSearch("");
        setSearchResults([]);
        setHasSearched(false);
        // Update the invited list locally without a full page reload
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
        body: JSON.stringify({ status }),
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

  const handleGuestRsvp = async (status: string) => {
    if (!inviteTokenRef.current) return;
    setRsvpSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}/email-rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_token: inviteTokenRef.current, status }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        setEmailRsvpStatus(status);
        toast.success(
          status === "going"
            ? "You\u2019re going!"
            : status === "maybe"
              ? "Marked as maybe"
              : "Response recorded"
        );
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
  };

  // ── Public RSVP handlers ────────────────────────────────────────────────
  const handlePubRequestCode = async () => {
    const email = pubEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setPubError("Please enter a valid email address");
      return;
    }
    setPubSubmitting(true);
    setPubError(null);
    try {
      const reqBody: Record<string, string> = { email };
      if (shareTokenRef.current) reqBody.share_token = shareTokenRef.current;
      const res = await apiFetch(`/events/${eventId}/public-rsvp/request-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = (await res.json()) as {
        ok: boolean;
        challenge?: string;
        existing_account?: boolean;
        error?: string;
        message?: string;
      };
      if (!data.ok) {
        setPubError(data.message ?? "Something went wrong");
        setPubSubmitting(false);
        return;
      }
      if (data.existing_account) {
        setPubError("An account with this email already exists. Please sign in instead.");
        setPubSubmitting(false);
        return;
      }
      setPubChallenge(data.challenge ?? null);
      setPubStep("code");
    } catch {
      setPubError("Network error. Please try again.");
    }
    setPubSubmitting(false);
  };

  const handlePubConfirmCode = async () => {
    const code = pubCode.trim();
    if (!code || code.length !== 6) {
      setPubError("Please enter the 6-digit code");
      return;
    }
    setPubSubmitting(true);
    setPubError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/public-rsvp/confirm-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: pubChallenge, code, name: pubName.trim() || undefined }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        token?: string;
        email?: string;
        error?: string;
        message?: string;
      };
      if (!data.ok) {
        setPubError(data.message ?? "Incorrect or expired code");
        setPubSubmitting(false);
        return;
      }
      participationTokenRef.current = data.token ?? null;
      try {
        localStorage.setItem(
          `nc_pub_${eventId}`,
          JSON.stringify({ token: data.token, email: data.email })
        );
      } catch {
        /* noop */
      }
      setPubStep("rsvp");
    } catch {
      setPubError("Network error. Please try again.");
    }
    setPubSubmitting(false);
  };

  // Auto-submit when the 6th digit is entered
  const pubAutoSubmitRef = useRef(false);
  useEffect(() => {
    if (pubCode.length === 6 && pubStep === "code" && !pubSubmitting) {
      if (pubAutoSubmitRef.current) return;
      pubAutoSubmitRef.current = true;
      handlePubConfirmCode();
    } else {
      pubAutoSubmitRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubCode]);

  const handlePubRsvp = async (status: string) => {
    if (!participationTokenRef.current) return;
    setPubSubmitting(true);
    setPubError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/email-rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participation_token: participationTokenRef.current,
          status,
          guest_name: pubName.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string };
      if (data.ok) {
        setPubRsvpStatus(status);
        try {
          localStorage.setItem(
            `nc_pub_${eventId}`,
            JSON.stringify({ token: participationTokenRef.current, email: pubEmail, status })
          );
        } catch {
          /* noop */
        }
        toast.success(
          status === "going"
            ? "You\u2019re going!"
            : status === "maybe"
              ? "Marked as maybe"
              : "Response recorded"
        );
        refresh();
      } else {
        setPubError(data.message ?? "Something went wrong");
      }
    } catch {
      setPubError("Network error. Please try again.");
    }
    setPubSubmitting(false);
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
        body: JSON.stringify({ status, note }),
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
        toast.error('This plan requires host approval — use "Request to join" instead');
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
        toast.success("Request approved — they've been added as Going");
        setHostResponseMessage((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        refresh();
      } else if (data.error === "EVENT_FULL") {
        toast.error("This plan is full — cannot approve more participants");
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

  const resetAltForm = () => {
    setAltStartDate(null);
    setAltEndDate(null);
    setAltStartTime(null);
    setAltEndTime(null);
    setAltNote("");
    setAltEditingId(null);
    setShowAltTimeForm(false);
  };

  const handleAltTimeSubmit = async () => {
    if (!altStartDate || !altStartTime) {
      toast.error("Please pick a date and start time");
      return;
    }

    const dayCount =
      altEndDate && altEndDate.isAfter(altStartDate, "day")
        ? altEndDate.diff(altStartDate, "day") + 1
        : 1;

    if (dayCount > 14) {
      toast.error("Date range can be at most 14 days");
      return;
    }

    setAltSubmitting(true);
    try {
      const noteVal = altNote.trim() || null;
      const startH = altStartTime.hour();
      const startM = altStartTime.minute();
      const endH = altEndTime?.hour();
      const endM = altEndTime?.minute();

      if (altEditingId) {
        const suggestedAt = altStartDate
          .hour(startH)
          .minute(startM)
          .second(0)
          .millisecond(0)
          .toISOString();
        const endsAt =
          endH != null && endM != null
            ? altStartDate.hour(endH).minute(endM).second(0).millisecond(0).toISOString()
            : null;
        const res = await apiFetch(`/events/${eventId}/alt-time/${altEditingId}`, {
          auth: true,
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suggested_at: suggestedAt, ends_at: endsAt, note: noteVal }),
        });
        const data = (await res.json()) as { ok: boolean; message?: string };
        if (data.ok) {
          toast.success(
            event?.altTimesMode === "availability"
              ? "Availability updated"
              : "Alternate time updated"
          );
          resetAltForm();
          refresh();
        } else toast.error(data.message ?? "Error");
      } else {
        const guestToken = inviteTokenRef.current ?? participationTokenRef.current;
        const useGuestEndpoint = !viewerUserId && !!guestToken;
        let created = 0;
        for (let i = 0; i < dayCount; i++) {
          const day = altStartDate.add(i, "day");
          const suggestedAt = day
            .hour(startH)
            .minute(startM)
            .second(0)
            .millisecond(0)
            .toISOString();
          const endsAt =
            endH != null && endM != null
              ? day.hour(endH).minute(endM).second(0).millisecond(0).toISOString()
              : null;
          const tokenBody = inviteTokenRef.current
            ? { invite_token: inviteTokenRef.current }
            : { participation_token: participationTokenRef.current };
          const res = useGuestEndpoint
            ? await apiFetch(`/events/${eventId}/guest-alt-time`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...tokenBody,
                  suggested_at: suggestedAt,
                  ends_at: endsAt,
                  note: noteVal,
                }),
              })
            : await apiFetch(`/events/${eventId}/alt-time`, {
                auth: true,
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ suggested_at: suggestedAt, ends_at: endsAt, note: noteVal }),
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
            event?.altTimesMode === "availability" ? "Availability" : "Alternate time";
          toast.success(
            created === 1
              ? `${addedLabel} added`
              : `${created} ${addedLabel.toLowerCase()}${created > 1 ? " entries" : ""} added`
          );
          resetAltForm();
          refresh();
        }
      }
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
    setAltStartDate(dayjs(entry.suggestedAt));
    setAltEndDate(null);
    setAltStartTime(dayjs(entry.suggestedAt));
    setAltEndTime(entry.endsAt ? dayjs(entry.endsAt) : null);
    setAltNote(entry.note ?? "");
    setAltEditingId(entry.id);
    setShowAltTimeForm(true);
    requestAnimationFrame(() => {
      altTimeScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

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
          : removeTarget.guestEmail
            ? { guest_email: removeTarget.guestEmail, reason: removeReason.trim() || null }
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
        toast.error("Couldn\u2019t remove this person. Please try again.");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setRemoving(false);
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
        <Typography variant="h5" fontWeight={600}>
          {error ?? "Not found"}
        </Typography>
        <Button onClick={() => router.push("/plans")} startIcon={<ArrowBackRoundedIcon />}>
          Back to Your Plans
        </Button>
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

        <Box>
          {pubHobbies.length > 0 && (
            <Stack
              direction="row"
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 1, gap: 0.75 }}
            >
              {pubHobbies.map((h) => (
                <Chip
                  key={h.slug}
                  label={h.name}
                  size="small"
                  variant="outlined"
                  sx={{ borderRadius: 2, fontWeight: 500, fontSize: "0.8rem" }}
                />
              ))}
            </Stack>
          )}
          <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
            {event.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Hosted by {event.hostName}
          </Typography>
          {event.community && (
            <Chip
              label={event.community.name}
              size="small"
              variant="outlined"
              sx={{ mt: 0.5, cursor: "pointer" }}
              onClick={() => router.push(`/communities/${event.community!.slug}`)}
            />
          )}
        </Box>

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

        <AppCard>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <AccessTimeRoundedIcon sx={{ color: "text.secondary", fontSize: 20 }} />
              <Typography variant="body1">{formatDateTime(event.startsAt)}</Typography>
            </Stack>
            {event.locationType === "in_person" && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <PlaceRoundedIcon sx={{ color: "text.secondary", fontSize: 20 }} />
                <Box>
                  <Typography variant="body1">{pubLocationDisplay}</Typography>
                  {event.locationArea && (
                    <Typography variant="caption" color="text.secondary">
                      Approximate area shown — sign in to see exact address
                    </Typography>
                  )}
                </Box>
              </Stack>
            )}
            {event.locationType === "online" && (
              <Stack direction="row" spacing={1.5} alignItems="center">
                <LinkRoundedIcon sx={{ color: "text.secondary", fontSize: 20 }} />
                {event.onlineLink?.trim() ? (
                  <MuiLink
                    href={normalizeMeetingLinkHref(event.onlineLink)}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body1"
                    sx={{ wordBreak: "break-word" }}
                  >
                    {pubLocationDisplay}
                  </MuiLink>
                ) : (
                  <Typography variant="body1">{pubLocationDisplay}</Typography>
                )}
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} alignItems="center">
              <PeopleOutlineRoundedIcon sx={{ color: "text.secondary", fontSize: 20 }} />
              <Typography variant="body1">
                {pubGoingCount} going{pubMaybeCount > 0 ? ` · ${pubMaybeCount} maybe` : ""}
                {event.maxSeats != null ? ` · ${event.maxSeats} max` : ""}
              </Typography>
            </Stack>
          </Stack>
        </AppCard>

        {event.description && (
          <AppCard>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
              About this plan
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ whiteSpace: "pre-line", lineHeight: 1.7 }}
            >
              {event.description}
            </Typography>
          </AppCard>
        )}

        {!pubIsCanceled && !pubIsPast && (
          <AppCard>
            <Stack spacing={2} sx={{ py: 1 }}>
              <Typography variant="h6" fontWeight={600}>
                Interested in this plan?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {event.requireApproval
                  ? "Sign in or create a free account to request to join this plan."
                  : "Sign in or create a free account to RSVP, chat with attendees, and get updates."}
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
          </AppCard>
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

  // Invitees who haven't RSVP'd yet (shown with "Invited" status in Who's in)
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
  // Guest invite: the viewer arrived via a valid invite token but has no NewChums account
  const isGuestInvite = event.guestInvite === true;
  const guestRsvpStatus = emailRsvpStatus ?? event.guestRsvpStatus ?? null;

  // Show request-to-join CTA instead of RSVP buttons when approval is required,
  // user is not the host, not invited, has no existing RSVP, and hasn't just RSVP'd via email token
  const showRequestToJoin =
    event.requireApproval &&
    !event.isHost &&
    !event.isInvited &&
    !event.hasRsvp &&
    !emailRsvpStatus &&
    !isGuestInvite;

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

      {/* Header */}
      <Box>
        {/* Hobby tags + visibility badge in one intentional row */}
        <Stack
          direction="row"
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 1, gap: 0.75 }}
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
              }}
            />
          ))}
          <Chip label={visibilityLabel(event.visibility)} size="small" variant="outlined" />
          {event.lockedAt && !isCanceled && (
            <Chip
              icon={<LockRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
              label="Locked"
              size="small"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: "0.75rem" }}
            />
          )}
          {event.requireApproval && !isCanceled && (
            <Tooltip
              title={isGuestInvite
                ? "This plan requires approval, but you\u2019re invited \u2014 no approval needed."
                : "The host must approve each person before they can join this plan."}
              placement="top"
              arrow
            >
              <Chip
                icon={<PersonAddRoundedIcon sx={{ fontSize: "0.875rem !important" }} />}
                label="Approval required"
                size="small"
                variant="outlined"
                color="info"
                sx={{ fontWeight: 600, fontSize: "0.75rem", cursor: "default" }}
              />
            </Tooltip>
          )}
          {isCanceled && <Chip label="Canceled" size="small" color="error" />}
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
              }}
            />
          )}
        </Stack>
        <Typography
          component="h1"
          variant="h4"
          fontWeight={700}
          sx={{ mb: 0.75, ...(isPast && !isCanceled ? { color: "text.secondary" } : {}) }}
        >
          {event.title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {event.isHost
            ? isPast
              ? "You hosted this"
              : "You\u2019re hosting this"
            : `Hosted by ${event.hostName}`}
        </Typography>
        {event.community && (
          <Chip
            label={event.community.name}
            size="small"
            variant="outlined"
            sx={{ mt: 0.5, cursor: "pointer" }}
            onClick={() => router.push(`/communities/${event.community!.slug}`)}
          />
        )}
      </Box>

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
                  ? "The minimum number of confirmed attendees wasn\u2019t reached."
                  : event.cancellationReason === "no_attendees"
                    ? "No one else was able to join this time around, but don\u2019t let that discourage you. The right plan is out there."
                    : null}
            </Typography>
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

      {/* Compatibility note — shown when the host doesn't fully meet viewer's chum preferences */}
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

      {/* Post-plan feedback — shown prominently for past attended plans */}
      {isPast && !isCanceled && accessState === "attending" && <PlanFeedback eventId={event.id} />}

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
              {event.locationType === "online" && event.onlineLink?.trim() ? (
                <MuiLink
                  href={normalizeMeetingLinkHref(event.onlineLink)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="body1"
                  sx={{ wordBreak: "break-word" }}
                >
                  {locationDisplay}
                </MuiLink>
              ) : (
                <Typography variant="body1">{locationDisplay}</Typography>
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
            <PeopleOutlineRoundedIcon sx={{ color: "primary.main" }} />
            <Typography variant="body1">
              {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
              {reservedSeatCount > 0 ? `, ${reservedSeatCount} reserved` : ""}
              {event.maxSeats ? ` · ${event.maxSeats} seats` : ""}
            </Typography>
          </Stack>
          {event.requireReconfirmation && !event.confirmationWindowOpen && (
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <NotificationsRoundedIcon sx={{ color: "text.secondary", fontSize: 22, mt: "1px" }} />
              <Stack spacing={0.25}>
                <Typography variant="body2" color="text.secondary">
                  Final confirmation will be requested 24 hours before
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
                      ? ` · ${event.minConfirmedAttendees} required`
                      : ""}
                  </Typography>
                  {event.confirmationCutoffAt && (
                    <Typography variant="caption" color="text.secondary">
                      Confirmation deadline:{" "}
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
              </Stack>
              {event.planViability && event.minConfirmedAttendees && (
                <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                  <Chip
                    size="small"
                    label={
                      event.planViability === "viable"
                        ? "Viable"
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
                  {event.fallbackPolicy === "auto_cancel" && (
                    <Typography variant="caption" color="text.secondary">
                      This plan will be auto-canceled if fewer than {event.minConfirmedAttendees}{" "}
                      {event.minConfirmedAttendees === 1
                        ? "attendee confirms"
                        : "attendees confirm"}{" "}
                      by the deadline
                    </Typography>
                  )}
                </Stack>
              )}
            </Stack>
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

      {/* Description */}
      {event.description && (
        <AppCard>
          <Typography variant="body1" sx={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>
            {event.description}
          </Typography>
        </AppCard>
      )}

      {/* RSVP / Request-to-join actions (non-hosts, non-canceled) */}
      {!event.isHost && !isCanceled && (
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
          ) : !pubRsvpStatus &&
            ((isGuestInvite && guestRsvpStatus) || (emailRsvpStatus && !isGuestInvite)) ? (
            <Stack spacing={2} sx={{ py: 1 }}>
              <Stack spacing={1.5} alignItems="center">
                <CheckCircleRoundedIcon sx={{ fontSize: 36, color: "success.main" }} />
                <Typography variant="h6" fontWeight={600}>
                  {(guestRsvpStatus ?? emailRsvpStatus) === "going"
                    ? "You\u2019re going!"
                    : (guestRsvpStatus ?? emailRsvpStatus) === "maybe"
                      ? "Marked as maybe"
                      : "Response recorded"}
                </Typography>
              </Stack>
              {isGuestInvite && inviteTokenRef.current ? (
                <>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: "center", lineHeight: 1.6 }}
                  >
                    {(guestRsvpStatus ?? emailRsvpStatus) === "going"
                      ? "You\u2019ll get updates about this plan via email."
                      : (guestRsvpStatus ?? emailRsvpStatus) === "maybe"
                        ? "We\u2019ll keep you posted if anything changes."
                        : "Thanks for letting the host know."}
                  </Typography>
                  <Divider sx={{ my: 0.5 }} />
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    justifyContent="center"
                  >
                    {guestRsvpStatus !== "going" && (
                      <AppButton
                        size="small"
                        onClick={() => handleGuestRsvp("going")}
                        disabled={rsvpSubmitting}
                      >
                        Going
                      </AppButton>
                    )}
                    {guestRsvpStatus !== "maybe" && (
                      <AppButton
                        size="small"
                        variant="outlined"
                        onClick={() => handleGuestRsvp("maybe")}
                        disabled={rsvpSubmitting}
                      >
                        Maybe
                      </AppButton>
                    )}
                    {guestRsvpStatus !== "cant_make_it" && (
                      <AppButton
                        size="small"
                        variant="outlined"
                        color="inherit"
                        onClick={() => handleGuestRsvp("cant_make_it")}
                        disabled={rsvpSubmitting}
                      >
                        Can&apos;t make it
                      </AppButton>
                    )}
                  </Stack>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mt: 2, display: "block", textAlign: "center" }}
                  >
                    Have an account?{" "}
                    <Link
                      href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                      style={{ color: "inherit", fontWeight: 600 }}
                    >
                      Sign in
                    </Link>{" "}
                    for the full experience, or{" "}
                    <Link
                      href={`/signup?next=${encodeURIComponent(`/events/${eventId}`)}${event.guestEmail ? `&email=${encodeURIComponent(event.guestEmail)}` : ""}`}
                      style={{ color: "inherit", fontWeight: 600 }}
                    >
                      sign up
                    </Link>{" "}
                    for free.
                  </Typography>
                </>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    {(guestRsvpStatus ?? emailRsvpStatus) === "going"
                      ? "Your attendance has been confirmed. Sign in to see the full plan details and chat."
                      : (guestRsvpStatus ?? emailRsvpStatus) === "maybe"
                        ? "You\u2019ve been marked as maybe. Sign in to update your response or see the full plan details."
                        : "Your response has been recorded. Sign in to see the full plan details."}
                  </Typography>
                  <Button
                    component={Link}
                    href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    variant="contained"
                    color="primary"
                    size="medium"
                    sx={{
                      alignSelf: "center",
                      mt: 0.5,
                      textTransform: "none",
                      fontWeight: 600,
                      borderRadius: 2,
                      boxShadow: "none",
                      "&:hover": { boxShadow: "none", opacity: 0.92 },
                    }}
                  >
                    Sign in
                  </Button>
                </>
              )}
            </Stack>
          ) : isGuestInvite && inviteTokenRef.current ? (
            <>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                You&apos;re invited!
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <AppButton
                  onClick={() => handleGuestRsvp("going")}
                  disabled={rsvpSubmitting}
                  sx={{ flex: 1 }}
                >
                  Going
                </AppButton>
                <AppButton
                  onClick={() => handleGuestRsvp("maybe")}
                  disabled={rsvpSubmitting}
                  variant="outlined"
                  sx={{ flex: 1 }}
                >
                  Maybe
                </AppButton>
                <AppButton
                  onClick={() => handleGuestRsvp("cant_make_it")}
                  disabled={rsvpSubmitting}
                  variant="outlined"
                  color="inherit"
                  sx={{ flex: 1 }}
                >
                  Can&apos;t make it
                </AppButton>
              </Stack>
            </>
          ) : showRequestToJoin ? (
            <>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                Want to join?
              </Typography>
              <Stack
                direction="row"
                alignItems="center"
                spacing={1}
                sx={{ mb: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}
              >
                <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
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
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    This plan is locked and not accepting new participants.
                  </Typography>
                </Stack>
              )}

              {userJoinRequest ? (
                <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    {userJoinRequest.status === "pending" && (
                      <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                      />
                    )}
                    {userJoinRequest.status === "approved" && (
                      <Chip
                        icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                        label="Approved"
                        size="small"
                        color="success"
                        variant="filled"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                      />
                    )}
                    {userJoinRequest.status === "declined" && (
                      <Chip
                        label="Declined"
                        size="small"
                        color="error"
                        variant="outlined"
                        sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                      />
                    )}
                    {userJoinRequest.status === "withdrawn" && (
                      <Chip
                        label="Withdrawn"
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          color: "text.secondary",
                          borderColor: "grey.400",
                        }}
                      />
                    )}
                  </Stack>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: "0.8125rem", lineHeight: 1.6 }}
                  >
                    {userJoinRequest.status === "pending" &&
                      "Your request is waiting for the host to review it."}
                    {userJoinRequest.status === "approved" &&
                      "You\u2019ve been approved and added to this plan as Going."}
                    {userJoinRequest.status === "declined" &&
                      "The host has declined your request to join this plan."}
                    {userJoinRequest.status === "withdrawn" &&
                      "You withdrew your request to join this plan."}
                  </Typography>
                  {userJoinRequest.message && (
                    <Typography
                      variant="body2"
                      sx={{
                        mt: 1,
                        fontSize: "0.8125rem",
                        fontStyle: "italic",
                        color: "text.secondary",
                      }}
                    >
                      Your message: &ldquo;{userJoinRequest.message}&rdquo;
                    </Typography>
                  )}
                  {userJoinRequest.hostMessage && (
                    <Typography variant="body2" sx={{ mt: 1, fontSize: "0.8125rem" }}>
                      Host message: &ldquo;{userJoinRequest.hostMessage}&rdquo;
                    </Typography>
                  )}
                  {userJoinRequest.status === "pending" && (
                    <Box sx={{ mt: 1.5 }}>
                      {withdrawConfirmId === userJoinRequest.id ? (
                        <Stack spacing={1}>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{ fontSize: "0.8125rem" }}
                          >
                            Are you sure? This will permanently withdraw your request and cannot be
                            undone. The host will be notified.
                          </Typography>
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => handleWithdrawRequest(userJoinRequest.id)}
                              disabled={withdrawSubmitting}
                              sx={{ textTransform: "none", fontSize: "0.8125rem" }}
                            >
                              {withdrawSubmitting ? "Withdrawing\u2026" : "Yes, withdraw"}
                            </Button>
                            <Button
                              size="small"
                              onClick={() => setWithdrawConfirmId(null)}
                              disabled={withdrawSubmitting}
                              sx={{ textTransform: "none", fontSize: "0.8125rem" }}
                            >
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      ) : (
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => setWithdrawConfirmId(userJoinRequest.id)}
                          sx={{
                            textTransform: "none",
                            fontSize: "0.8125rem",
                            color: "text.secondary",
                          }}
                        >
                          Withdraw request
                        </Button>
                      )}
                    </Box>
                  )}
                </Box>
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
          ) : isAuthenticated === false ? (
            pubRsvpStatus ? (
              <>
                <Stack spacing={1.5} alignItems="center" sx={{ py: 1 }}>
                  <CheckCircleRoundedIcon sx={{ fontSize: 36, color: "success.main" }} />
                  <Typography variant="h6" fontWeight={600}>
                    {pubRsvpStatus === "going"
                      ? "You\u2019re going!"
                      : pubRsvpStatus === "maybe"
                        ? "Marked as maybe"
                        : "Response recorded"}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: "center", lineHeight: 1.6 }}
                  >
                    {pubRsvpStatus === "going"
                      ? "You\u2019ll get updates about this plan via email."
                      : pubRsvpStatus === "maybe"
                        ? "We\u2019ll keep you posted if anything changes."
                        : "Thanks for letting the host know."}
                  </Typography>
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="center">
                  {pubRsvpStatus !== "going" && (
                    <AppButton
                      size="small"
                      onClick={() => handlePubRsvp("going")}
                      disabled={pubSubmitting}
                    >
                      Going
                    </AppButton>
                  )}
                  {pubRsvpStatus !== "maybe" && (
                    <AppButton
                      size="small"
                      variant="outlined"
                      onClick={() => handlePubRsvp("maybe")}
                      disabled={pubSubmitting}
                    >
                      Maybe
                    </AppButton>
                  )}
                  {pubRsvpStatus !== "cant_make_it" && (
                    <AppButton
                      size="small"
                      variant="outlined"
                      color="inherit"
                      onClick={() => handlePubRsvp("cant_make_it")}
                      disabled={pubSubmitting}
                    >
                      Can&apos;t make it
                    </AppButton>
                  )}
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 2, display: "block", textAlign: "center" }}
                >
                  Have an account?{" "}
                  <Link
                    href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    style={{ color: "inherit", fontWeight: 600 }}
                  >
                    Sign in
                  </Link>{" "}
                  to join the conversation.
                </Typography>
              </>
            ) : pubStep === "email" ? (
              <>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                  Interested in this plan?
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                  Enter your email to RSVP. We&apos;ll send a quick verification code.
                </Typography>
                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    type="email"
                    placeholder="Your email"
                    value={pubEmail}
                    onChange={(e) => {
                      setPubEmail(e.target.value);
                      setPubError(null);
                    }}
                    disabled={pubSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePubRequestCode();
                      }
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <EmailRoundedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Your name (optional)"
                    value={pubName}
                    onChange={(e) => setPubName(e.target.value.slice(0, 100))}
                    disabled={pubSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePubRequestCode();
                      }
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  {pubError && (
                    <Typography variant="body2" color="error" sx={{ fontSize: "0.8125rem" }}>
                      {pubError}
                    </Typography>
                  )}
                  <AppButton
                    onClick={handlePubRequestCode}
                    disabled={pubSubmitting || !pubEmail.trim()}
                  >
                    {pubSubmitting ? "Sending…" : "Send verification code"}
                  </AppButton>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 2, display: "block", textAlign: "center", lineHeight: 1.6 }}
                >
                  Already have an account?{" "}
                  <Link
                    href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    style={{ color: "inherit", fontWeight: 600 }}
                  >
                    Sign in
                  </Link>
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block", textAlign: "center", lineHeight: 1.6 }}
                >
                  Or{" "}
                  <Link
                    href={`/signup?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    style={{ color: "inherit", fontWeight: 600 }}
                  >
                    create an account
                  </Link>{" "}
                  for full access to chat, notifications, and more.
                </Typography>
              </>
            ) : pubStep === "code" ? (
              <>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                  Check your email
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                  We sent a 6-digit code to <strong>{pubEmail}</strong>.
                </Typography>
                <Stack spacing={1.5}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Enter 6-digit code"
                    value={pubCode}
                    onChange={(e) => {
                      setPubCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      setPubError(null);
                    }}
                    disabled={pubSubmitting}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handlePubConfirmCode();
                      }
                    }}
                    inputProps={{
                      inputMode: "numeric",
                      maxLength: 6,
                      style: {
                        letterSpacing: "0.25em",
                        fontWeight: 600,
                        textAlign: "center",
                        fontSize: "1.25rem",
                      },
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                  />
                  {pubError && (
                    <Typography variant="body2" color="error" sx={{ fontSize: "0.8125rem" }}>
                      {pubError}
                    </Typography>
                  )}
                  <AppButton
                    onClick={handlePubConfirmCode}
                    disabled={pubSubmitting || pubCode.length !== 6}
                  >
                    {pubSubmitting ? "Verifying…" : "Verify"}
                  </AppButton>
                  <Typography
                    variant="caption"
                    component="button"
                    onClick={() => {
                      setPubStep("email");
                      setPubCode("");
                      setPubChallenge(null);
                      setPubError(null);
                    }}
                    sx={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "text.secondary",
                      textDecoration: "underline",
                      textUnderlineOffset: "3px",
                      alignSelf: "center",
                      "&:hover": { color: "text.primary" },
                    }}
                  >
                    Use a different email
                  </Typography>
                </Stack>
              </>
            ) : (
              <>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 0.5 }}>
                  You&apos;re verified
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                  RSVP to let the host know you&apos;re interested.
                </Typography>
                {pubError && (
                  <Typography variant="body2" color="error" sx={{ fontSize: "0.8125rem", mb: 1 }}>
                    {pubError}
                  </Typography>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <AppButton
                    onClick={() => handlePubRsvp("going")}
                    disabled={pubSubmitting}
                    sx={{ flex: 1 }}
                  >
                    Going
                  </AppButton>
                  <AppButton
                    onClick={() => handlePubRsvp("maybe")}
                    disabled={pubSubmitting}
                    variant="outlined"
                    sx={{ flex: 1 }}
                  >
                    Maybe
                  </AppButton>
                  <AppButton
                    onClick={() => handlePubRsvp("cant_make_it")}
                    disabled={pubSubmitting}
                    variant="outlined"
                    color="inherit"
                    sx={{ flex: 1 }}
                  >
                    Can&apos;t make it
                  </AppButton>
                </Stack>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 2, display: "block", textAlign: "center" }}
                >
                  Have an account?{" "}
                  <Link
                    href={`/login?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    style={{ color: "inherit", fontWeight: 600 }}
                  >
                    Sign in
                  </Link>{" "}
                  to join the conversation.
                </Typography>
              </>
            )
          ) : (
            <>
              {/* Confirmation UI when window is open */}
              {event.confirmationWindowOpen &&
              viewerRsvpStatus === "going" &&
              !event.isHost &&
              (event.myConfirmationStatus === "pending" ||
                event.myConfirmationStatus === "expired" ||
                event.myConfirmationStatus === null ||
                emailConfirmResult) ? (
                <Stack spacing={2} sx={{ py: 1 }}>
                  {emailConfirmResult === "confirmed" ||
                  event.myConfirmationStatus === "confirmed" ? (
                    <Stack spacing={1.5} alignItems="center">
                      <CheckCircleRoundedIcon sx={{ fontSize: 36, color: "success.main" }} />
                      <Typography variant="h6" fontWeight={600}>
                        You&apos;re confirmed for this plan
                      </Typography>
                    </Stack>
                  ) : emailConfirmResult === "declined" ||
                    event.myConfirmationStatus === "declined" ? (
                    <Stack spacing={1.5} alignItems="center">
                      <InfoOutlinedIcon sx={{ fontSize: 36, color: "text.secondary" }} />
                      <Typography variant="h6" fontWeight={600}>
                        You&apos;ve indicated you can&apos;t make it
                      </Typography>
                    </Stack>
                  ) : (
                    <>
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
                          Final confirmation required
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
                    </>
                  )}
                </Stack>
              ) : event.confirmationWindowOpen && event.myConfirmationStatus === "confirmed" ? (
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
              ) : event.confirmationWindowOpen && event.myConfirmationStatus === "declined" ? (
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
                        ? "You\u2019re going"
                        : viewerRsvpStatus === "maybe"
                          ? "You\u2019re a maybe"
                          : "You can\u2019t make it"}
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
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
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
                        {(event.isInvited || event.hasRsvp) && (
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
                        )}
                      </Stack>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </AppCard>
      )}

      {/* Host confirmation (when window is open) */}
      {event.isHost &&
        !isCanceled &&
        event.requireReconfirmation &&
        event.confirmationWindowOpen && (
          <AppCard>
            {event.myConfirmationStatus === "confirmed" ? (
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
            ) : event.myConfirmationStatus === "declined" ? (
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

                {event.allowAltTimes && (
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={suggestTime}
                        onChange={(e) => setSuggestTime(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2" sx={{ fontSize: "0.8125rem" }}>
                        {event.altTimesMode === "availability"
                          ? "Ask them to share their availability"
                          : "Ask them to suggest a better time"}
                      </Typography>
                    }
                    sx={{ ml: -0.25, mb: -0.5 }}
                  />
                )}

                <TextField
                  fullWidth
                  size="medium"
                  placeholder="Search by name, @handle, or email…"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && EMAIL_RE.test(inviteSearch.trim())) {
                      e.preventDefault();
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
                              "Send Invite"
                            )}
                          </Button>
                        </Box>
                      );
                    })}
                  </Stack>
                )}

                {hasSearched &&
                  EMAIL_RE.test(inviteSearch.trim()) &&
                  searchResults.length === 0 &&
                  !searching && (
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
                    setSuggestTime(false);
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
        <AppCard>
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

      {/* Scheduling section — collaborative alternate scheduling (hidden for past plans) */}
      {event.allowAltTimes &&
        !isCanceled &&
        !isPast &&
        (() => {
          const canSuggest =
            event.isHost ||
            viewerRsvpStatus === "going" ||
            viewerRsvpStatus === "maybe" ||
            event.isInvited ||
            isGuestInvite ||
            !!participationTokenRef.current;
          const isAvailMode = event.altTimesMode === "availability";
          type OverlapWindow = { startMs: number; endMs: number; entries: AltTimeEntry[] };

          const fmtTime = (d: Date) =>
            d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

          const viewerHasSuggested = viewerUserId
            ? altTimes.some((e) => e.userId === viewerUserId)
            : event.guestEmail
              ? altTimes.some((e) => e.guestEmail === event.guestEmail)
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

          return (
            <AppCard>
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
              >
                {isAvailMode ? "Share your availability" : "Suggest a different time"}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {isAvailMode
                  ? canSuggest
                    ? "The host wants to find a time that works for everyone. Share when you're available and the best overlap will be highlighted."
                    : "The host wants to find a time that works for everyone. Join to share your availability."
                  : canSuggest
                    ? "The host is open to alternative times for this plan. Suggest one below and everyone in the plan can see it."
                    : "The host is open to alternative times for this plan. Join to suggest your own."}
              </Typography>

              <Box ref={altTimeScrollRef} sx={{ maxHeight: 420, overflowY: "auto" }}>
                {!canSuggest ? (
                  altTimes.length === 0 ? (
                    <Box sx={{ height: 4 }} />
                  ) : null
                ) : !showAltTimeForm ? (
                  <Button
                    size="small"
                    onClick={() => {
                      setAltEditingId(null);
                      if (!altStartDate && event) {
                        setAltStartDate(dayjs(event.startsAt));
                        setAltStartTime(dayjs(event.startsAt));
                      }
                      setShowAltTimeForm(true);
                    }}
                    sx={{ textTransform: "none", mb: altTimes.length > 0 ? 2 : 0 }}
                  >
                    {isAvailMode
                      ? viewerHasSuggested
                        ? "+ Add more availability"
                        : "+ Add your availability"
                      : viewerHasSuggested
                        ? "+ Suggest another time"
                        : "+ Suggest a time"}
                  </Button>
                ) : (
                  <Paper
                    variant="outlined"
                    sx={{ p: 2, mb: altTimes.length > 0 ? 2 : 0, borderRadius: 2 }}
                  >
                    <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                      {altEditingId
                        ? isAvailMode
                          ? "Edit your availability"
                          : "Edit your suggested time"
                        : isAvailMode
                          ? "When are you available?"
                          : "Suggest a different start time"}
                    </Typography>
                    <Stack spacing={2}>
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="subtitle1"
                            fontWeight={600}
                            sx={{ display: "block", mb: 0.625 }}
                          >
                            Date
                          </Typography>
                          <DatePicker
                            value={altStartDate}
                            onChange={setAltStartDate}
                            minDate={dayjs()}
                            slotProps={{
                              textField: {
                                fullWidth: true,
                                size: "medium",
                                placeholder: "Pick a date",
                              },
                            }}
                          />
                        </Box>
                        {!altEditingId && (
                          <Box sx={{ flex: 1 }}>
                            <Typography
                              variant="subtitle1"
                              fontWeight={600}
                              sx={{ display: "block", mb: 0.625 }}
                            >
                              Through (optional)
                            </Typography>
                            <DatePicker
                              value={altEndDate}
                              onChange={setAltEndDate}
                              minDate={altStartDate ?? dayjs()}
                              disabled={!altStartDate}
                              slotProps={{
                                textField: {
                                  fullWidth: true,
                                  size: "medium",
                                  placeholder: "Same day",
                                },
                              }}
                            />
                          </Box>
                        )}
                      </Stack>
                      {altStartDate && altEndDate && altEndDate.isAfter(altStartDate, "day") && (
                        <Typography variant="caption" color="primary" sx={{ mt: -1 }}>
                          {altEndDate.diff(altStartDate, "day") + 1} days selected — one entry will
                          be created for each day with the same time.
                        </Typography>
                      )}
                      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="subtitle1"
                            fontWeight={600}
                            sx={{ display: "block", mb: 0.625 }}
                          >
                            Start time
                          </Typography>
                          <TimePicker
                            value={altStartTime}
                            onChange={setAltStartTime}
                            format="h:mm A"
                            slotProps={{
                              field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                              textField: {
                                fullWidth: true,
                                size: "medium",
                                placeholder: "Pick a time",
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
                            Through (optional)
                          </Typography>
                          <TimePicker
                            value={altEndTime}
                            onChange={setAltEndTime}
                            format="h:mm A"
                            slotProps={{
                              field: { shouldRespectLeadingZeros: true } as Record<string, unknown>,
                              textField: {
                                fullWidth: true,
                                size: "medium",
                                placeholder: "Pick a time",
                              },
                            }}
                          />
                        </Box>
                      </Stack>
                      <AppTextField
                        label="Note (optional)"
                        placeholder={
                          isAvailMode
                            ? "e.g. Available most of the afternoon"
                            : "e.g. Friday works better for me"
                        }
                        value={altNote}
                        onChange={(e) => setAltNote(e.target.value)}
                      />
                      <Stack direction="row" spacing={1}>
                        <AppButton
                          size="small"
                          onClick={handleAltTimeSubmit}
                          disabled={altSubmitting}
                        >
                          {altSubmitting ? "Saving…" : altEditingId ? "Save" : "Add"}
                        </AppButton>
                        <Button size="small" onClick={resetAltForm} sx={{ textTransform: "none" }}>
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  </Paper>
                )}

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
                        const ovStart = fmtTime(new Date(ov.startMs));
                        // Only show end time when every entry in the overlap is a ranged suggestion.
                        // A point entry (no endsAt) means that person only committed to a start time,
                        // so the window end doesn't apply to them.
                        const allRanged = ov.entries.every((e) => !!e.endsAt);
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
                                  {fmtDay(ov.date)}, {ovStart}
                                  {ovEnd ? ` – ${ovEnd}` : ""}
                                </Typography>
                                <Chip
                                  label={`${ov.entries.length} overlap${isBest ? " — best fit" : ""}`}
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
                              const entryStart = fmtTime(new Date(entry.suggestedAt));
                              const entryEnd = entry.endsAt
                                ? fmtTime(new Date(entry.endsAt))
                                : null;
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
                                        {entryStart}
                                        {entryEnd ? ` – ${entryEnd}` : ""}
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
                                    {entry.note && (
                                      <Typography
                                        variant="caption"
                                        color="text.disabled"
                                        sx={{ display: "block" }}
                                      >
                                        {entry.note}
                                      </Typography>
                                    )}
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

                {altTimes.length === 0 && !showAltTimeForm && canSuggest && (
                  <Box sx={{ height: 4 }} />
                )}
              </Box>
            </AppCard>
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

      {/* Who's in — combined RSVP + invite status */}
      {(rsvps.length > 0 || pendingInvites.length > 0) && (
        <AppCard>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
          >
            Who&apos;s in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.5 }}>
            {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
            {declinedCount > 0 ? `, ${declinedCount} can\u2019t make it` : ""}
            {reservedSeatCount > 0 ? `, ${reservedSeatCount} invited` : ""}
            {event.maxSeats ? ` · ${event.maxSeats} seats` : ""}
            {event.confirmationWindowOpen && event.confirmedCount > 0
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
                        {r.name}
                      </Typography>
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
                        label={"Can\u2019t make it"}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 500, fontSize: "0.8125rem", color: "text.secondary" }}
                      />
                    )}
                    {event.confirmationWindowOpen && r.confirmationStatus && (
                      <Chip
                        label={
                          r.confirmationStatus === "confirmed"
                            ? "Confirmed"
                            : r.confirmationStatus === "pending"
                              ? "Pending confirmation"
                              : r.confirmationStatus === "declined"
                                ? "Declined"
                                : "Missed deadline"
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
                    {event.isHost &&
                      !isCanceled &&
                      !isPast &&
                      r.userId !== event.hostUserId &&
                      (r.status === "going" || r.status === "maybe") && (
                        <Tooltip title="Remove from plan" arrow>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setRemoveTarget({
                                type: "rsvp",
                                userId: r.userId,
                                name: r.name,
                                guestEmail: r.guestEmail ?? null,
                              });
                              setRemoveReason("");
                              setRemoveDialogOpen(true);
                            }}
                            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                          >
                            <PersonRemoveRoundedIcon sx={{ fontSize: "1.125rem" }} />
                          </IconButton>
                        </Tooltip>
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
                        label={event.reserveSeats ? "Invited \u00b7 Seat held" : "Invited"}
                        size="small"
                        variant="outlined"
                        color="info"
                        sx={{ fontWeight: 600, fontSize: "0.75rem" }}
                      />
                      {event.isHost && !isCanceled && !isPast && inv.userId !== null && (
                        <Tooltip title="Remove invite" arrow>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setRemoveTarget({
                                type: "invite",
                                userId: inv.userId,
                                email: inv.email,
                                name: inv.name || inv.email || "this person",
                              });
                              setRemoveReason("");
                              setRemoveDialogOpen(true);
                            }}
                            sx={{ color: "text.disabled", "&:hover": { color: "error.main" } }}
                          >
                            <PersonRemoveRoundedIcon sx={{ fontSize: "1.125rem" }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>
        </AppCard>
      )}

      {/* Plan Chat */}
      {chatAccessible === true && !isCanceled && (
        <AppCard>
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
              maxHeight: 400,
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
            {lockToggling ? "Locking\u2026" : "Lock plan"}
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
            helperText={`${removeReason.length}/500 — This will be included in the notification email to the attendee.`}
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
            {removing ? "Removing\u2026" : "Remove attendee"}
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
            ? "Confirm you\u2019re going"
            : rsvpDialogStatus === "maybe"
              ? "RSVP as maybe"
              : "Can\u2019t make it"}
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
              ? "I\u2019m going"
              : rsvpDialogStatus === "maybe"
                ? "Maybe"
                : "Can\u2019t make it"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
