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
import Switch from "@mui/material/Switch";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AccessTimeRoundedIcon from "@mui/icons-material/AccessTimeRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import PeopleOutlineRoundedIcon from "@mui/icons-material/PeopleOutlineRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import UserAvatar from "@/components/common/UserAvatar";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch, clearAuthTokenCache, getAuthToken, getAvatarBaseUrl, getChatWebSocketUrl, getMediaApiBaseUrl } from "@/lib/apiClient";
import { nameToSlug } from "@/lib/interestUtils";

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
  requireReconfirmation: boolean;
  canceledAt: string | null;
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
  guestRsvpStatus?: string | null;
};

type RsvpEntry = { userId: string; name: string; handle: string | null; status: string; note: string | null; avatarUrl?: string | null };
type AltTimeEntry = { userId: string; name: string; suggestedAt: string; note: string | null };
type InviteEntry = { userId: string | null; email: string | null; name: string; handle?: string | null };
type RemoveTarget =
  | { type: "rsvp"; userId: string; name: string }
  | { type: "invite"; userId: string | null; email: string | null; name: string };
type SearchResult = { userId: string; displayName: string; handle: string | null; avatarUrl?: string | null };
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

export default function EventDetailClient() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [rsvps, setRsvps] = useState<RsvpEntry[]>([]);
  const [altTimes, setAltTimes] = useState<AltTimeEntry[]>([]);
  const [invites, setInvites] = useState<InviteEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpDialogOpen, setRsvpDialogOpen] = useState(false);
  const [rsvpDialogStatus, setRsvpDialogStatus] = useState<string>("");
  const [rsvpDialogMessage, setRsvpDialogMessage] = useState("");
  // Tracks RSVP status set via email invite token (unauthenticated flow)
  const [emailRsvpStatus, setEmailRsvpStatus] = useState<string | null>(null);
  const [showAltTimeForm, setShowAltTimeForm] = useState(false);
  const [altDate, setAltDate] = useState("");
  const [altTime, setAltTime] = useState("");
  const [altNote, setAltNote] = useState("");

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

  // Copy link
  const handleCopyLink = useCallback(async () => {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for environments without Clipboard API
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
  }, [toast]);

  // Lock state
  const [lockToggling, setLockToggling] = useState(false);

  // Join request state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinRequestMessage, setJoinRequestMessage] = useState("");
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState(false);
  const [approveDeclineLoading, setApproveDeclineLoading] = useState<string | null>(null);
  const [hostResponseMessage, setHostResponseMessage] = useState<Record<string, string>>({});

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState<Dayjs | null>(null);
  const [editTime, setEditTime] = useState<Dayjs | null>(null);
  const [editMaxSeats, setEditMaxSeats] = useState("");
  const [editVisibility, setEditVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [editRequireReconfirmation, setEditRequireReconfirmation] = useState(false);
  const [editRequireApproval, setEditRequireApproval] = useState(false);
  const [editHobbies, setEditHobbies] = useState<HobbyInfo[]>([]);
  const [editHobbyInput, setEditHobbyInput] = useState("");
  const [editHobbySuggestions, setEditHobbySuggestions] = useState<HobbyInfo[]>([]);
  const [editHobbyLoading, setEditHobbyLoading] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const applyEventData = useCallback((data: {
    ok: boolean;
    event: EventDetail;
    rsvps: RsvpEntry[];
    altTimes: AltTimeEntry[];
    invites: InviteEntry[];
    joinRequests: JoinRequest[];
  }) => {
    setEvent(data.event);
    setRsvps(data.rsvps);
    setAltTimes(data.altTimes);
    setInvites(data.invites ?? []);
    setJoinRequests(data.joinRequests ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const tokenSuffix = inviteTokenRef.current ? `?invite_token=${encodeURIComponent(inviteTokenRef.current)}` : "";
      const res = await apiFetch(`/events/${eventId}${tokenSuffix}`, { auth: true });
      if (!res.ok) {
        setError("Plan not found");
        setLoading(false);
        return;
      }
      const data = await res.json();
      applyEventData(data);
    } catch {
      setError("Failed to load plan");
    }
    setLoading(false);
  }, [eventId, applyEventData]);

  const refresh = useCallback(async () => {
    try {
      const tokenSuffix = inviteTokenRef.current ? `?invite_token=${encodeURIComponent(inviteTokenRef.current)}` : "";
      const res = await apiFetch(`/events/${eventId}${tokenSuffix}`, { auth: true });
      if (res.ok) {
        const data = await res.json();
        applyEventData(data);
      }
    } catch { /* silent */ }
  }, [eventId, applyEventData]);

  useEffect(() => { load(); }, [load]);

  // Persistent invite token — survives for the component lifecycle so guests
  // can re-RSVP and access invite-only events without auth.
  const inviteTokenRef = useRef<string | null>(null);

  // Auto-RSVP from email link (?rsvp=going&invite_token=xxx)
  const pendingRsvpRef = useRef<string | null>(null);
  useEffect(() => {
    const rsvpParam = searchParams.get("rsvp");
    const inviteTokenParam = searchParams.get("invite_token");
    if (inviteTokenParam) inviteTokenRef.current = inviteTokenParam;
    if (rsvpParam && VALID_RSVP_PARAMS.includes(rsvpParam as typeof VALID_RSVP_PARAMS[number])) {
      pendingRsvpRef.current = rsvpParam;
    }
    if (rsvpParam || inviteTokenParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete("rsvp");
      url.searchParams.delete("invite_token");
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
          const data = (await res.json()) as { ok: boolean; error?: string; message?: string; isGuest?: boolean };
          if (data.ok) {
            setEmailRsvpStatus(rsvpStatus);
            toast.success(rsvpStatus === "going" ? "You\u2019re going!" : rsvpStatus === "maybe" ? "Marked as maybe" : "Response recorded");
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
      } catch { /* ignore */ }
      setSearching(false);
      setHasSearched(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteSearch, showInviteForm]);

  // Edit dialog hobby search
  useEffect(() => {
    if (!editDialogOpen || !editHobbyInput.trim()) { setEditHobbySuggestions([]); return; }
    const timer = setTimeout(async () => {
      setEditHobbyLoading(true);
      try {
        const res = await apiFetch(`/interests?q=${encodeURIComponent(editHobbyInput)}`);
        const data = (await res.json()) as { ok: boolean; interests?: HobbyInfo[] };
        setEditHobbySuggestions(data.ok && data.interests ? data.interests : []);
      } catch { setEditHobbySuggestions([]); }
      finally { setEditHobbyLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [editHobbyInput, editDialogOpen]);

  // --- Chat helpers ---
  const [chatAccessible, setChatAccessible] = useState<boolean | null>(null);
  const chatEligible =
    !!event &&
    event.status !== "canceled" &&
    (event.isHost || event.hasRsvp);
  const wsRef = useRef<WebSocket | null>(null);

  const markChatRead = useCallback(async () => {
    try {
      await apiFetch(`/events/${eventId}/chat/read`, { auth: true, method: "POST" });
      setChatLastReadAt(new Date().toISOString());
    } catch { /* ignore */ }
  }, [eventId]);

  const loadChat = useCallback(async () => {
    try {
      const res = await apiFetch(`/events/${eventId}/chat`, { auth: true });
      if (res.status === 403 || res.status === 404) {
        setChatAccessible(false);
        setChatLoading(false);
        return;
      }
      const data = (await res.json()) as { ok: boolean; messages: ChatMessage[]; lastReadAt: string | null };
      if (data.ok) {
        setChatAccessible(true);
        setChatMessages(data.messages);
        setChatLastReadAt(data.lastReadAt);
      }
    } catch { /* ignore */ }
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
      if (fallbackPollTimer) { clearInterval(fallbackPollTimer); fallbackPollTimer = null; }
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
          } catch { /* ignore malformed messages */ }
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
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
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
    } catch { /* ignore */ }
    setChatSending(false);
  };

  const handleToggleLock = async () => {
    setLockToggling(true);
    try {
      const res = await apiFetch(`/events/${eventId}/lock`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok: boolean; locked: boolean };
      if (data.ok) {
        setEvent((prev) => prev ? { ...prev, lockedAt: data.locked ? new Date().toISOString() : null } : prev);
        toast.success(data.locked ? "Plan locked" : "Plan unlocked");
      }
    } catch {
      toast.error("Failed to update lock status");
    }
    setLockToggling(false);
  };

  const [reserveSeatsToggling, setReserveSeatsToggling] = useState(false);

  const handleToggleReserveSeats = async () => {
    setReserveSeatsToggling(true);
    try {
      const res = await apiFetch(`/events/${eventId}/reserve-seats`, { auth: true, method: "POST" });
      const data = (await res.json()) as { ok: boolean; reserveSeats: boolean };
      if (data.ok) {
        setEvent((prev) => prev ? { ...prev, reserveSeats: data.reserveSeats } : prev);
        toast.success(data.reserveSeats ? "Seats will be reserved for invites" : "Seat reservation turned off");
      }
    } catch {
      toast.error("Failed to update setting");
    }
    setReserveSeatsToggling(false);
  };

  const handleInvite = async (userId?: string, email?: string) => {
    setInviteSubmitting(true);
    setInvitingUserId(userId ?? null);
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
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string; status?: string };
      if (data.ok) {
        toast.success(status === "going" ? "You're going!" : status === "maybe" ? "Marked as maybe" : "Response recorded");
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
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
        toast.success(status === "going" ? "You\u2019re going!" : status === "maybe" ? "Marked as maybe" : "Response recorded");
        refresh();
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Network error");
    }
    setRsvpSubmitting(false);
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
      const data = (await res.json()) as { ok: boolean; error?: string; message?: string; status?: string };
      if (data.ok) {
        toast.success(status === "going" ? "You're going!" : status === "maybe" ? "Marked as maybe" : "Response recorded");
        refresh();
      } else if (data.error === "EVENT_LOCKED") {
        toast.error("This plan is locked and not accepting new participants");
      } else if (data.error === "APPROVAL_REQUIRED") {
        toast.error("This plan requires host approval — use \"Request to join\" instead");
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
        setHostResponseMessage((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
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
        setHostResponseMessage((prev) => { const next = { ...prev }; delete next[requestId]; return next; });
        refresh();
      } else {
        toast.error(data.message ?? "Failed to decline");
      }
    } catch {
      toast.error("Network error");
    }
    setApproveDeclineLoading(null);
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
        refresh();
      } else {
        toast.error(data.message ?? "Error");
      }
    } catch {
      toast.error("Network error");
    }
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
      const endpoint = removeTarget.type === "invite" ? `/events/${eventId}/remove-invite` : `/events/${eventId}/remove-attendee`;
      const body = removeTarget.type === "invite"
        ? { user_id: removeTarget.userId, email: removeTarget.email, reason: removeReason.trim() || null }
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
          setInvites((prev) => prev.filter((inv) =>
            removeTarget.userId ? inv.userId !== removeTarget.userId : inv.email !== removeTarget.email
          ));
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

  const openEditDialog = () => {
    if (!event) return;
    const d = dayjs(event.startsAt);
    setEditTitle(event.title);
    setEditDescription(event.description ?? "");
    setEditDate(d);
    setEditTime(d);
    setEditMaxSeats(event.maxSeats != null ? String(event.maxSeats) : "");
    setEditVisibility((event.visibility as "public" | "chums_only" | "invite_only") ?? "public");
    setEditRequireReconfirmation(event.requireReconfirmation ?? false);
    setEditRequireApproval(event.requireApproval ?? false);
    const initialHobbies =
      event.hobbies?.length > 0
        ? event.hobbies
        : event.hobby
          ? [{ name: event.hobby, slug: event.hobbySlug ?? "" }]
          : [];
    setEditHobbies(initialHobbies);
    setEditHobbyInput("");
    setEditHobbySuggestions([]);
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editTitle.trim()) { toast.error("Title is required"); return; }
    if (!editDate?.isValid() || !editTime?.isValid()) { toast.error("Date and time are required"); return; }
    if (editHobbies.length === 0) { toast.error("At least one hobby is required"); return; }
    const startsAt = editDate.hour(editTime.hour()).minute(editTime.minute()).second(0).toISOString();
    setEditSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          starts_at: startsAt,
          interest_items: editHobbies.map((h) => ({ slug: h.slug, name: h.name })),
          max_seats: editMaxSeats ? Number(editMaxSeats) : null,
          visibility: editVisibility,
          require_reconfirmation: editRequireReconfirmation,
          require_approval: editRequireApproval,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        setEditDialogOpen(false);
        toast.success("Plan updated");
        refresh();
      } else {
        toast.error(data.message ?? "Couldn't save changes");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setEditSubmitting(false);
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
  const declinedCount = rsvps.filter((r) => r.status === "cant_make_it").length;
  const isCanceled = event.status === "canceled";
  const isPast = new Date(event.startsAt) < new Date();

  // Invitees who haven't RSVP'd yet (shown with "Invited" status in Who's in)
  const rsvpUserIds = new Set(rsvps.map((r) => r.userId));
  const pendingInvites = invites.filter((inv) => inv.userId && !rsvpUserIds.has(inv.userId));
  // Reserved seats: pending invites + maybe RSVPs from invitees (maybe RSVPs
  // already appear in the RSVP list but their seat stays held when reserve_seats is on)
  const maybeInviteeCount = event.reserveSeats
    ? rsvps.filter((r) => r.status === "maybe" && invites.some((inv) => inv.userId === r.userId)).length
    : 0;
  const reservedSeatCount = event.reserveSeats ? pendingInvites.length + maybeInviteeCount : 0;

  // Request-to-join derived state
  const userJoinRequest = !event.isHost && joinRequests.length > 0 ? joinRequests[0] : null;
  const pendingJoinRequests = event.isHost ? joinRequests.filter((jr) => jr.status === "pending") : [];
  // Guest invite: the viewer arrived via a valid invite token but has no NewChums account
  const isGuestInvite = event.guestInvite === true;
  const guestRsvpStatus = emailRsvpStatus ?? event.guestRsvpStatus ?? null;

  // Show request-to-join CTA instead of RSVP buttons when approval is required,
  // user is not the host, not invited, has no existing RSVP, and hasn't just RSVP'd via email token
  const showRequestToJoin = event.requireApproval && !event.isHost && !event.isInvited && !event.hasRsvp && !emailRsvpStatus && !isGuestInvite;

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
        {/* Hobby tags + visibility badge in one intentional row */}
        <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1, gap: 0.75 }}>
          {hobbies.map((h) => (
            <Chip
              key={h.slug}
              label={h.name}
              size="small"
              sx={{ bgcolor: "primary.light", color: "primary.dark", fontWeight: 600, fontSize: "0.75rem" }}
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
            <Tooltip title="The host must approve each person before they can join this plan." placement="top" arrow>
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
              {reservedSeatCount > 0 ? `, ${reservedSeatCount} reserved` : ""}
              {event.maxSeats ? ` · ${event.maxSeats} seats` : ""}
            </Typography>
          </Stack>
          {event.requireReconfirmation && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <NotificationsRoundedIcon sx={{ color: "text.secondary", fontSize: 22 }} />
              <Typography variant="body2" color="text.secondary">
                {event.isHost
                  ? "Attendees will be asked to reconfirm 24 hours before"
                  : "You\u2019ll receive a reminder to reconfirm attendance 24 hours before"}
              </Typography>
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

      {/* RSVP / Request-to-join actions (non-hosts, non-canceled) */}
      {!event.isHost && !isCanceled && (
        <AppCard>
          {(isGuestInvite && guestRsvpStatus) || (emailRsvpStatus && !isGuestInvite) ? (
            <Stack spacing={2} sx={{ py: 1 }}>
              <Stack spacing={1.5} alignItems="center">
                <CheckCircleRoundedIcon sx={{ fontSize: 36, color: "success.main" }} />
                <Typography variant="h6" fontWeight={600}>
                  {(guestRsvpStatus ?? emailRsvpStatus) === "going" ? "You\u2019re going!" : (guestRsvpStatus ?? emailRsvpStatus) === "maybe" ? "Marked as maybe" : "Response recorded"}
                </Typography>
              </Stack>
              {isGuestInvite && inviteTokenRef.current ? (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                    Want to change your response?
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                    {guestRsvpStatus !== "going" && (
                      <AppButton onClick={() => handleGuestRsvp("going")} disabled={rsvpSubmitting} sx={{ flex: 1 }}>Going</AppButton>
                    )}
                    {guestRsvpStatus !== "maybe" && (
                      <AppButton onClick={() => handleGuestRsvp("maybe")} disabled={rsvpSubmitting} variant="outlined" sx={{ flex: 1 }}>Maybe</AppButton>
                    )}
                    {guestRsvpStatus !== "cant_make_it" && (
                      <AppButton onClick={() => handleGuestRsvp("cant_make_it")} disabled={rsvpSubmitting} variant="outlined" color="inherit" sx={{ flex: 1 }}>Can&apos;t make it</AppButton>
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", fontSize: "0.8125rem" }}>
                    Create a free account for the full experience — chat, updates, and more.
                  </Typography>
                  <Button
                    component={Link}
                    href={`/signup?next=${encodeURIComponent(`/events/${eventId}`)}`}
                    variant="text"
                    size="small"
                    sx={{ alignSelf: "center", textTransform: "none", fontWeight: 600 }}
                  >
                    Sign up for NewChums
                  </Button>
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
                    sx={{ alignSelf: "center", mt: 0.5, textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
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
                <AppButton onClick={() => handleGuestRsvp("going")} disabled={rsvpSubmitting} sx={{ flex: 1 }}>Going</AppButton>
                <AppButton onClick={() => handleGuestRsvp("maybe")} disabled={rsvpSubmitting} variant="outlined" sx={{ flex: 1 }}>Maybe</AppButton>
                <AppButton onClick={() => handleGuestRsvp("cant_make_it")} disabled={rsvpSubmitting} variant="outlined" color="inherit" sx={{ flex: 1 }}>Can&apos;t make it</AppButton>
              </Stack>
            </>
          ) : showRequestToJoin ? (
            <>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                Want to join?
              </Typography>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
                <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                  The host reviews each request before adding you to the plan.
                </Typography>
              </Stack>

              {event.lockedAt && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 2 }}>
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
                      <Chip label="Pending" size="small" color="warning" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.8125rem" }} />
                    )}
                    {userJoinRequest.status === "approved" && (
                      <Chip icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />} label="Approved" size="small" color="success" variant="filled" sx={{ fontWeight: 600, fontSize: "0.8125rem" }} />
                    )}
                    {userJoinRequest.status === "declined" && (
                      <Chip label="Declined" size="small" color="error" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.8125rem" }} />
                    )}
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.6 }}>
                    {userJoinRequest.status === "pending" && "Your request is waiting for the host to review it."}
                    {userJoinRequest.status === "approved" && "You\u2019ve been approved and added to this plan as Going."}
                    {userJoinRequest.status === "declined" && "The host has declined your request to join this plan."}
                  </Typography>
                  {userJoinRequest.message && (
                    <Typography variant="body2" sx={{ mt: 1, fontSize: "0.8125rem", fontStyle: "italic", color: "text.secondary" }}>
                      Your message: &ldquo;{userJoinRequest.message}&rdquo;
                    </Typography>
                  )}
                  {userJoinRequest.hostMessage && (
                    <Typography variant="body2" sx={{ mt: 1, fontSize: "0.8125rem" }}>
                      Host message: &ldquo;{userJoinRequest.hostMessage}&rdquo;
                    </Typography>
                  )}
                </Box>
              ) : !event.lockedAt ? (
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
                    startIcon={joinRequestSubmitting ? <CircularProgress size={14} color="inherit" /> : <PersonAddRoundedIcon />}
                  >
                    {joinRequestSubmitting ? "Sending…" : "Request to join"}
                  </AppButton>
                </Stack>
              ) : null}
            </>
          ) : (
            <>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                Are you in?
              </Typography>
              {event.lockedAt && chatAccessible !== true && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 2 }}>
                  <LockRoundedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    This plan is locked and not accepting new participants.
                  </Typography>
                </Stack>
              )}
              {event.requireApproval && !event.isInvited && event.hasRsvp && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
                  <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "success.main" }} />
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                    You were approved to join this plan.
                  </Typography>
                </Stack>
              )}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <AppButton onClick={() => openRsvpDialog("going")} disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)} sx={{ flex: 1 }}>
                  Going
                </AppButton>
                <AppButton onClick={() => openRsvpDialog("maybe")} disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)} variant="outlined" sx={{ flex: 1 }}>
                  Maybe
                </AppButton>
                <AppButton onClick={() => openRsvpDialog("cant_make_it")} disabled={rsvpSubmitting || (!!event.lockedAt && chatAccessible !== true)} variant="outlined" color="inherit" sx={{ flex: 1 }}>
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
            </>
          )}
        </AppCard>
      )}

      {/* Invite people (host only, not canceled) — compact collapsible */}
      {event.isHost && !isCanceled && (
        <AppCard>
          {!showInviteForm ? (
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Invite people
              </Typography>
              <Stack direction="row" spacing={1}>
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
                  Add
                </AppButton>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
                <Typography variant="subtitle1" fontWeight={600}>
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
                    handleInvite(undefined, inviteSearch.trim().toLowerCase());
                  }
                }}
                disabled={inviteSubmitting}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      {searching
                        ? <CircularProgress size={18} />
                        : EMAIL_RE.test(inviteSearch.trim())
                          ? <MailOutlineRoundedIcon sx={{ color: "text.secondary" }} />
                          : <SearchRoundedIcon sx={{ color: "text.secondary" }} />}
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
                          {isInviting ? <CircularProgress size={14} color="inherit" sx={{ mx: 1 }} /> : "Send Invite"}
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
                      <Typography variant="body2" fontWeight={600} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                      startIcon={inviteSubmitting ? <CircularProgress size={14} color="inherit" /> : <PersonAddRoundedIcon />}
                      onClick={() => handleInvite(undefined, inviteSearch.trim().toLowerCase())}
                      sx={{ flexShrink: 0, fontSize: "0.8125rem", textTransform: "none" }}
                    >
                      Invite by email
                    </Button>
                  </Box>
                )}

              <Button
                size="small"
                onClick={() => { setShowInviteForm(false); setInviteSearch(""); setSearchResults([]); setHasSearched(false); }}
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
            <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}>
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.5 }}>
            People requesting to join your plan. Approved requests are automatically added as Going.
          </Typography>
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
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flex: 1, minWidth: 0 }}>
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
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                              {jr.name}
                            </Typography>
                          )}
                        </>
                      ) : (
                        <Typography variant="body1" fontWeight={600} sx={{ fontSize: "1rem" }}>
                          {jr.name}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem" }}>
                        Requested {new Date(jr.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </Typography>
                    </Box>
                    {jr.status === "pending" ? (
                      <Chip label="Pending" size="small" color="warning" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }} />
                    ) : jr.status === "approved" ? (
                      <Chip icon={<CheckCircleRoundedIcon sx={{ fontSize: "1rem !important" }} />} label="Approved" size="small" color="success" variant="filled" sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }} />
                    ) : (
                      <Chip label="Declined" size="small" color="error" variant="outlined" sx={{ fontWeight: 600, fontSize: "0.8125rem", flexShrink: 0 }} />
                    )}
                  </Stack>
                </Stack>

                {jr.message && (
                  <Typography variant="body2" sx={{ ml: 7.5, mb: 1, fontSize: "0.8125rem", fontStyle: "italic", color: "text.secondary", lineHeight: 1.5 }}>
                    &ldquo;{jr.message}&rdquo;
                  </Typography>
                )}

                {jr.status === "pending" && (
                  <Box sx={{ ml: 7.5, mt: 1 }}>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Add a message (optional)"
                      value={hostResponseMessage[jr.id] ?? ""}
                      onChange={(e) => setHostResponseMessage((prev) => ({ ...prev, [jr.id]: e.target.value.slice(0, 500) }))}
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

      {/* Who's in — combined RSVP + invite status */}
      {(rsvps.length > 0 || pendingInvites.length > 0) && (
        <AppCard>
          <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5, fontSize: { xs: "1.25rem", sm: "1.375rem" } }}>
            Who&apos;s in
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5, lineHeight: 1.5 }}>
            {goingCount} going{maybeCount > 0 ? `, ${maybeCount} maybe` : ""}
            {declinedCount > 0 ? `, ${declinedCount} can\u2019t make it` : ""}
            {reservedSeatCount > 0 ? `, ${reservedSeatCount} invited` : ""}
            {event.maxSeats ? ` · ${event.maxSeats} seats` : ""}
          </Typography>
          <Stack spacing={0}>
            {/* RSVP'd participants */}
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
                  "&:last-child": { borderBottom: pendingInvites.length > 0 ? undefined : "none" },
                }}
              >
                <UserAvatar
                  src={r.avatarUrl ? `${avatarBaseUrl}${r.avatarUrl}` : null}
                  name={r.name}
                  size={44}
                  sx={{ flexShrink: 0 }}
                />
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flex: 1, minWidth: 0 }}>
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
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}
                        </Typography>
                      )}
                    </Box>
                  ) : (
                    <Typography variant="body1" fontWeight={600} sx={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.name}
                    </Typography>
                  )}
                  <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
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
                    {event.isHost && !isCanceled && !isPast && r.userId !== event.hostUserId && (r.status === "going" || r.status === "maybe") && (
                      <Tooltip title="Remove from plan" arrow>
                        <IconButton
                          size="small"
                          onClick={() => { setRemoveTarget({ type: "rsvp", userId: r.userId, name: r.name }); setRemoveReason(""); setRemoveDialogOpen(true); }}
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
              </Stack>
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
                  <UserAvatar
                    name={inv.name}
                    size={44}
                    sx={{ flexShrink: 0 }}
                  />
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ flex: 1, minWidth: 0 }}>
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
                          <Typography variant="caption" color="text.secondary" sx={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {inv.name}
                          </Typography>
                        )}
                      </Box>
                    ) : (
                      <Typography variant="body1" fontWeight={600} sx={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inv.name || inv.email}
                      </Typography>
                    )}
                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexShrink: 0 }}>
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
                            onClick={() => { setRemoveTarget({ type: "invite", userId: inv.userId, email: inv.email, name: inv.name || inv.email || "this person" }); setRemoveReason(""); setRemoveDialogOpen(true); }}
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
            <Typography variant="h5" fontWeight={700} sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}>
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
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.5, fontSize: "0.8125rem" }}>
            Visible to current participants only. Be thoughtful about what you share.
          </Typography>

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
                  No messages yet. Say something to get the conversation going.
                </Typography>
              </Box>
            ) : (
              <Stack spacing={0} sx={{ p: { xs: 1.5, sm: 2 } }}>
                {chatMessages.map((msg, idx) => {
                  const showUnreadDivider =
                    chatLastReadAt &&
                    idx > 0 &&
                    new Date(msg.createdAt) > new Date(chatLastReadAt) &&
                    (idx === 0 || new Date(chatMessages[idx - 1].createdAt) <= new Date(chatLastReadAt));
                  return (
                    <Box key={msg.id}>
                      {showUnreadDivider && (
                        <Divider sx={{ my: 1.5, fontSize: "0.75rem", color: "primary.main", fontWeight: 600 }}>
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
                          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.25 }}>
                            <Typography variant="body2" fontWeight={600} sx={{ fontSize: "0.8125rem" }}>
                              {msg.senderHandle || msg.senderName}
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.6875rem", flexShrink: 0 }}>
                              {formatChatTime(msg.createdAt)}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" sx={{ fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
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

          {/* Composer */}
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
        </AppCard>
      )}

      {/* Host actions */}
      {event.isHost && !isCanceled && (
        <AppCard>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<EditRoundedIcon />}
              onClick={openEditDialog}
              sx={{ textTransform: "none" }}
            >
              Edit plan
            </Button>
            <Button
              variant="outlined"
              startIcon={event.lockedAt ? <LockOpenRoundedIcon /> : <LockRoundedIcon />}
              onClick={handleToggleLock}
              disabled={lockToggling}
              sx={{ textTransform: "none" }}
            >
              {lockToggling ? "Updating…" : event.lockedAt ? "Unlock plan" : "Lock plan"}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setCancelDialogOpen(true)}
              sx={{ textTransform: "none" }}
            >
              Cancel this plan
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: "0.8125rem", lineHeight: 1.6 }}>
            {event.lockedAt
              ? "This plan is locked \u2014 no new people can join. Existing participants still have full access. Unlock to allow new people in again."
              : "Locking this plan prevents anyone new from joining. People who\u2019ve already joined keep their access and can still use the chat."}
          </Typography>

          {event.maxSeats && (
            <>
              <Divider sx={{ my: 2 }} />
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Reserve seats for invited people
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.5, mt: 0.25 }}>
                    When enabled, invited guests hold a seat until they respond. Declined invites release the seat. Maybe keeps it reserved.
                  </Typography>
                </Box>
                <Switch
                  checked={event.reserveSeats}
                  onChange={handleToggleReserveSeats}
                  disabled={reserveSeatsToggling}
                  size="small"
                />
              </Stack>
            </>
          )}
        </AppCard>
      )}

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
            This will mark the plan as canceled and notify anyone who has responded. This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
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
            This action is recorded by the system. Attendee removals may be considered in future host quality and trust metrics.
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            Removing someone is completely your call as a host, just use it thoughtfully.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => { setRemoveDialogOpen(false); setRemoveTarget(null); setRemoveReason(""); }}
            disabled={removing}
          >
            Keep them
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRemoveAttendee}
            disabled={removing}
            startIcon={removing ? <CircularProgress size={14} color="inherit" /> : <PersonRemoveRoundedIcon />}
          >
            {removing ? "Removing\u2026" : "Remove attendee"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit plan dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => !editSubmitting && setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 0 }}>Edit plan</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 2 }}>
            <AppTextField
              label="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              inputProps={{ maxLength: 200 }}
              helperText={null}
            />
            <AppTextField
              label="Description"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline
              minRows={3}
              maxRows={6}
              inputProps={{ maxLength: 2000 }}
              helperText={null}
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                  Date
                </Typography>
                <DatePicker
                  value={editDate}
                  onChange={setEditDate}
                  slotProps={{ textField: { fullWidth: true, size: "medium" } }}
                />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                  Time
                </Typography>
                <TimePicker
                  value={editTime}
                  onChange={setEditTime}
                  format="h:mm A"
                  slotProps={{ field: { shouldRespectLeadingZeros: true } as Record<string, unknown>, textField: { fullWidth: true, size: "medium" } }}
                />
              </Box>
            </Stack>

            {/* Hobby selector */}
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>
                Hobbies
              </Typography>
              <Autocomplete
                freeSolo
                multiple
                filterOptions={(x) => x}
                options={editHobbySuggestions}
                value={editHobbies}
                inputValue={editHobbyInput}
                onInputChange={(_, v) => setEditHobbyInput(v)}
                onChange={(_, newValue) => {
                  const last = (newValue ?? []).length > 0 ? newValue[(newValue ?? []).length - 1] : null;
                  if (last && typeof last === "string") {
                    const name = last.trim().replace(/\s+/g, " ");
                    if (!name) return;
                    const slug = nameToSlug(name);
                    if (slug && !editHobbies.some((h) => h.slug === slug)) {
                      setEditHobbies((prev) => [...prev, { name, slug }]);
                    }
                  } else {
                    setEditHobbies((newValue ?? []) as HobbyInfo[]);
                  }
                }}
                getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
                isOptionEqualToValue={(opt, val) => {
                  if (typeof opt === "string" || typeof val === "string") return false;
                  return opt.slug === val.slug;
                }}
                loading={editHobbyLoading}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Type to search or add..."
                    variant="outlined"
                    size="medium"
                    fullWidth
                    label={undefined}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !editHobbyInput) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                  />
                )}
                renderTags={() => null}
              />
              {editHobbies.length > 0 && (
                <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap sx={{ mt: 1 }}>
                  {editHobbies.map((h) => (
                    <Chip
                      key={h.slug}
                      label={h.name}
                      size="small"
                      color="primary"
                      variant="filled"
                      onDelete={() => setEditHobbies((prev) => prev.filter((i) => i.slug !== h.slug))}
                      sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                    />
                  ))}
                </Stack>
              )}
            </Box>

            <AppTextField
              label="Max seats (optional)"
              type="number"
              value={editMaxSeats}
              onChange={(e) => setEditMaxSeats(e.target.value)}
              inputProps={{ min: 1 }}
              helperText={null}
            />
            <Box>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                Who can see this?
              </Typography>
              <FormControl component="fieldset">
                <RadioGroup
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as typeof editVisibility)}
                >
                  <FormControlLabel value="public" control={<Radio size="small" />} label="Public" />
                  <FormControlLabel value="chums_only" control={<Radio size="small" />} label="Chums only" />
                  <FormControlLabel value="invite_only" control={<Radio size="small" />} label="Invite only" />
                </RadioGroup>
              </FormControl>
            </Box>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={editRequireReconfirmation}
                    onChange={(e) => setEditRequireReconfirmation(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>Ask attendees to reconfirm before the plan</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Attendees receive a reminder 24 hours before asking if they&apos;re still coming.
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: "flex-start", mt: 0.5 }}
              />
            </Box>
            <Box>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={editRequireApproval}
                    onChange={(e) => setEditRequireApproval(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" fontWeight={500}>Require approval before joining</Typography>
                    <Typography variant="caption" color="text.secondary">
                      People who are not directly invited will need to request to join.
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: "flex-start", mt: 0.5 }}
              />
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="text"
            color="inherit"
            onClick={() => setEditDialogOpen(false)}
            disabled={editSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSubmit}
            disabled={editSubmitting}
            startIcon={editSubmitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {editSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

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
      {/* RSVP confirmation dialog */}
      <Dialog open={rsvpDialogOpen} onClose={() => setRsvpDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {rsvpDialogStatus === "going" ? "Confirm you\u2019re going" : rsvpDialogStatus === "maybe" ? "RSVP as maybe" : "Can\u2019t make it"}
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
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button variant="text" color="inherit" onClick={() => setRsvpDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleRsvpConfirm} disabled={rsvpSubmitting}>
            {rsvpDialogStatus === "going" ? "I\u2019m going" : rsvpDialogStatus === "maybe" ? "Maybe" : "Can\u2019t make it"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
