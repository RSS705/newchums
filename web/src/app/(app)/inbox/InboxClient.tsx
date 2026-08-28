"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import FlagRoundedIcon from "@mui/icons-material/FlagRounded";
import MailRoundedIcon from "@mui/icons-material/MailRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import RateReviewRoundedIcon from "@mui/icons-material/RateReviewRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { useToast } from "@/components/ui";
import ChatEmojiPicker from "@/components/events/ChatEmojiPicker";
import UserAvatar from "@/components/common/UserAvatar";
import NewMessageDialog from "./NewMessageDialog";

// ── Types ────────────────────────────────────────────────────────────────────

type OtherUser = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  isSuspended?: boolean;
};

type ConversationSummary = {
  id: string;
  otherUser: OtherUser;
  lastMessage: { snippet: string; isMine: boolean; createdAt: string | null } | null;
  lastMessageAt: string;
  unreadCount: number;
};

type ComposeTarget = OtherUser & {
  conversationId: string | null;
  canMessage: boolean;
};

type Message = {
  id: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

type ThreadData = {
  conversation: { id: string; otherUser: OtherUser; viewerHasBlocked: boolean };
  messages: Message[];
};

const MAX_MESSAGE_LENGTH = 5000;
const LIST_POLL_MS = 30_000;

const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "rude_aggressive", label: "Rude or aggressive" },
  { value: "harassment", label: "Harassment" },
  { value: "boundary_issue", label: "Boundary issue" },
  { value: "discriminatory", label: "Discriminatory" },
  { value: "unsafe_intoxicated", label: "Unsafe behavior" },
  { value: "disruptive", label: "Disruptive" },
  { value: "other", label: "Other" },
];

// ── Formatting helpers ───────────────────────────────────────────────────────

function displayNameOf(u: OtherUser): string {
  return u.name?.trim() || (u.username ? `@${u.username}` : "NewChums member");
}

function listTimestamp(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    if (d.getFullYear() === now.getFullYear()) {
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    }
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function messageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function dayLabel(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86_400_000).toDateString();
    if (d.toDateString() === today) return "Today";
    if (d.toDateString() === yesterday) return "Yesterday";
    return d.toLocaleDateString(undefined, {
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function InboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const toParam = searchParams.get("to");
  const cParam = searchParams.get("c");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [composeTarget, setComposeTarget] = useState<ComposeTarget | null>(null);

  const [thread, setThread] = useState<ThreadData | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [sending, setSending] = useState(false);

  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [newMessageOpen, setNewMessageOpen] = useState(false);

  const scrollBoxRef = useRef<HTMLDivElement | null>(null);
  // Whether the user is scrolled near the thread's bottom (updated onScroll);
  // gates the auto-scroll so polling never yanks them out of history.
  const nearBottomRef = useRef(true);
  const activeConversationId = cParam;

  // The pane the user is "in": a real conversation, a fresh compose, or the list.
  const composing = !activeConversationId && !!composeTarget;
  const paneOpen = !!activeConversationId || composing;

  const loadList = useCallback(async () => {
    try {
      const qs = toParam ? `?with=${encodeURIComponent(toParam)}` : "";
      const res = await apiFetch(`/inbox${qs}`, { auth: true });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as {
        ok: boolean;
        conversations: ConversationSummary[];
        composeTarget: ComposeTarget | null;
      };
      if (!json.ok) throw new Error();
      setConversations(json.conversations);
      if (toParam) {
        if (json.composeTarget?.conversationId) {
          // Conversation already exists: open it and drop the ?to param.
          router.replace(`/inbox?c=${json.composeTarget.conversationId}`);
        } else {
          setComposeTarget(json.composeTarget);
        }
      }
    } catch {
      // Leave prior state; a toast on every failed poll would be noisy.
    }
    setListLoading(false);
  }, [toParam, router]);

  const loadThread = useCallback(
    async (conversationId: string, background = false) => {
      if (!background) setThreadLoading(true);
      try {
        const res = await apiFetch(`/inbox/${conversationId}`, { auth: true });
        if (res.ok) {
          const json = (await res.json()) as { ok: boolean } & ThreadData;
          if (json.ok) {
            setThread({ conversation: json.conversation, messages: json.messages });
            // Reading the thread zeroes its unread badge in the list, and
            // tells AppShell to refresh the sidebar badge right away instead
            // of waiting out its 60s poll.
            setConversations((prev) =>
              prev.map((conv) => (conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv)),
            );
            window.dispatchEvent(new Event("nc-inbox-read"));
          }
        } else if (res.status === 404 && !background) {
          toast.error("Conversation not found");
          router.replace("/inbox");
        }
      } catch {
        /* keep prior state */
      }
      if (!background) setThreadLoading(false);
    },
    [router, toast],
  );

  useEffect(() => {
    loadList();
    // Skip background-tab polls: they waste requests, and for the thread
    // below they would mark messages read that the user never saw.
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadList();
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [loadList]);

  useEffect(() => {
    setDraft(""); // a half-written draft belongs to one conversation only
    nearBottomRef.current = true;
    if (!activeConversationId) {
      setThread(null);
      return;
    }
    loadThread(activeConversationId);
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      loadThread(activeConversationId, true);
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [activeConversationId, loadThread]);

  // Keep the thread pinned to the latest message, but never yank the user
  // down while they've scrolled up reading history; only auto-scroll when
  // they're already near the bottom or the newest message is their own.
  const lastMessage = thread?.messages[thread.messages.length - 1];
  const lastMessageId = lastMessage?.id;
  const lastMessageIsMine = lastMessage?.isMine === true;
  useEffect(() => {
    const box = scrollBoxRef.current;
    if (box && (nearBottomRef.current || lastMessageIsMine)) {
      box.scrollTop = box.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId, threadLoading, composing]);

  const activeOther: OtherUser | null = thread?.conversation.otherUser ?? (composing ? composeTarget : null);
  const viewerHasBlocked = thread?.conversation.viewerHasBlocked ?? false;
  const composerDisabled =
    sending || (composing && composeTarget !== null && !composeTarget.canMessage) || viewerHasBlocked;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !activeOther || sending) return;
    setSending(true);
    try {
      const res = await apiFetch("/inbox/send", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_user_id: activeOther.userId, body: text }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        conversation_id?: string;
        message?: Message;
        error?: string;
        message_text?: string;
      } & { message?: Message | string };
      if (res.ok && json.ok && json.conversation_id) {
        setDraft("");
        if (!activeConversationId) {
          setComposeTarget(null);
          router.replace(`/inbox?c=${json.conversation_id}`);
        } else if (json.message && typeof json.message !== "string") {
          const sent = json.message;
          setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, sent] } : prev));
        }
        loadList();
      } else {
        const detail =
          typeof (json as { message?: unknown }).message === "string"
            ? ((json as { message?: string }).message as string)
            : "Couldn't send your message. Please try again.";
        toast.error(detail);
      }
    } catch {
      toast.error("Couldn't send your message. Please try again.");
    }
    setSending(false);
  };

  const handleBlockToggle = async () => {
    if (!activeOther) return;
    setMenuAnchor(null);
    if (viewerHasBlocked) {
      const res = await apiFetch(`/users/${activeOther.userId}/block`, { auth: true, method: "DELETE" }).catch(() => null);
      if (res?.ok) {
        toast.success(`${displayNameOf(activeOther)} unblocked`);
        if (activeConversationId) loadThread(activeConversationId, true);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } else {
      setBlockConfirmOpen(true);
    }
  };

  const confirmBlock = async () => {
    if (!activeOther) return;
    setBlockConfirmOpen(false);
    const res = await apiFetch(`/users/${activeOther.userId}/block`, { auth: true, method: "POST" }).catch(() => null);
    if (res?.ok) {
      toast.success(`${displayNameOf(activeOther)} blocked.`);
      if (activeConversationId) loadThread(activeConversationId, true);
    } else {
      toast.error("Something went wrong. Please try again.");
    }
  };

  const backToList = () => {
    setComposeTarget(null);
    router.replace("/inbox");
  };

  const avatarBase = getAvatarBaseUrl();

  // ── Sub-renders ────────────────────────────────────────────────────────────

  const listPane = (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        display: { xs: paneOpen ? "none" : "flex", md: "flex" },
        flexDirection: "column",
        width: { xs: "100%", md: 340 },
        flexShrink: 0,
      }}
    >
      <Box sx={{ px: 2.5, py: 2, borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Inbox
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.35 }}>
              Private messages between you and other members.
            </Typography>
          </Box>
          <Tooltip title="New message" arrow>
            <IconButton
              onClick={() => setNewMessageOpen(true)}
              aria-label="New message"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                flexShrink: 0,
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              <RateReviewRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto" }}>
        {listLoading ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress size={24} />
          </Stack>
        ) : conversations.length === 0 ? (
          <Stack spacing={1.25} alignItems="center" sx={{ px: 3, py: 6, textAlign: "center" }}>
            <MailRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
            <Typography variant="body2" color="text.secondary" fontWeight={600}>
              No messages yet
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              Say hello to one of your chums, or to someone from a recent plan.
            </Typography>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RateReviewRoundedIcon sx={{ fontSize: 16 }} />}
              onClick={() => setNewMessageOpen(true)}
              sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
            >
              New message
            </Button>
          </Stack>
        ) : (
          conversations.map((conv) => {
            const selected = conv.id === activeConversationId;
            return (
              <ButtonBase
                key={conv.id}
                onClick={() => {
                  setComposeTarget(null);
                  // push (not replace) so the hardware/browser back button
                  // returns from a thread to the list, matching mobile habits
                  router.push(`/inbox?c=${conv.id}`);
                }}
                sx={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  alignItems: "center",
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: "divider",
                  bgcolor: selected ? "action.selected" : "transparent",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <UserAvatar
                  src={conv.otherUser.avatarUrl ? `${avatarBase}${conv.otherUser.avatarUrl}` : undefined}
                  name={conv.otherUser.name ?? undefined}
                  username={conv.otherUser.username ?? undefined}
                  size={44}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      fontWeight={conv.unreadCount > 0 ? 700 : 600}
                      noWrap
                      sx={{ flex: 1, minWidth: 0 }}
                    >
                      {displayNameOf(conv.otherUser)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {listTimestamp(conv.lastMessage?.createdAt ?? conv.lastMessageAt)}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
                    <Typography
                      variant="caption"
                      noWrap
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        color: conv.unreadCount > 0 ? "text.primary" : "text.secondary",
                        fontWeight: conv.unreadCount > 0 ? 600 : 400,
                      }}
                    >
                      {conv.lastMessage ? `${conv.lastMessage.isMine ? "You: " : ""}${conv.lastMessage.snippet}` : "No messages yet"}
                    </Typography>
                    {conv.unreadCount > 0 && (
                      <Chip
                        label={conv.unreadCount}
                        size="small"
                        color="primary"
                        sx={{ height: 18, fontSize: "0.6875rem", fontWeight: 700, "& .MuiChip-label": { px: 0.75 }, flexShrink: 0 }}
                      />
                    )}
                  </Stack>
                </Box>
              </ButtonBase>
            );
          })
        )}
      </Box>
    </Paper>
  );

  const renderMessages = () => {
    if (!thread) return null;
    let lastDay = "";
    return thread.messages.map((m) => {
      const day = dayLabel(m.createdAt);
      const showDay = day !== lastDay;
      lastDay = day;
      return (
        <Box key={m.id}>
          {showDay && (
            <Divider sx={{ my: 2 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                {day}
              </Typography>
            </Divider>
          )}
          <Stack alignItems={m.isMine ? "flex-end" : "flex-start"} sx={{ mb: 1.25 }}>
            <Box
              sx={{
                maxWidth: "78%",
                px: 1.75,
                py: 1,
                borderRadius: 2.5,
                bgcolor: m.isMine ? "primary.main" : "grey.100",
                color: m.isMine ? "primary.contrastText" : "text.primary",
                borderBottomRightRadius: m.isMine ? 4 : 20,
                borderBottomLeftRadius: m.isMine ? 20 : 4,
              }}
            >
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>
                {m.body}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25, px: 0.5, fontSize: "0.6875rem" }}>
              {messageTime(m.createdAt)}
            </Typography>
          </Stack>
        </Box>
      );
    });
  };

  const threadPane = (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        flex: 1,
        minWidth: 0,
        display: { xs: paneOpen ? "flex" : "none", md: "flex" },
        flexDirection: "column",
      }}
    >
      {activeOther ? (
        <>
          {/* Thread header */}
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <IconButton size="small" onClick={backToList} sx={{ display: { md: "none" } }} aria-label="Back to inbox">
              <ArrowBackRoundedIcon fontSize="small" />
            </IconButton>
            <UserAvatar
              src={activeOther.avatarUrl ? `${avatarBase}${activeOther.avatarUrl}` : undefined}
              name={activeOther.name ?? undefined}
              username={activeOther.username ?? undefined}
              size={40}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" fontWeight={700} noWrap>
                {displayNameOf(activeOther)}
              </Typography>
              {activeOther.username && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  @{activeOther.username}
                </Typography>
              )}
            </Box>
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} aria-label="Conversation options">
              <MoreVertRoundedIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              {activeOther.username && (
                <MenuItem component={Link} href={`/u/${activeOther.username}`} onClick={() => setMenuAnchor(null)}>
                  <PersonRoundedIcon sx={{ fontSize: 18, mr: 1.25, color: "text.secondary" }} /> View profile
                </MenuItem>
              )}
              <MenuItem onClick={handleBlockToggle}>
                <BlockRoundedIcon sx={{ fontSize: 18, mr: 1.25, color: "text.secondary" }} />
                {viewerHasBlocked ? "Unblock" : "Block"}
              </MenuItem>
              {activeConversationId && (
                <MenuItem
                  onClick={() => {
                    setMenuAnchor(null);
                    setReportOpen(true);
                  }}
                >
                  <FlagRoundedIcon sx={{ fontSize: 18, mr: 1.25, color: "text.secondary" }} /> Report conversation
                </MenuItem>
              )}
            </Menu>
          </Stack>

          {/* Messages */}
          <Box
            ref={scrollBoxRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            sx={{ flex: 1, overflowY: "auto", px: 2.5, py: 2 }}
          >
            {threadLoading ? (
              <Stack alignItems="center" sx={{ py: 6 }}>
                <CircularProgress size={24} />
              </Stack>
            ) : thread ? (
              renderMessages()
            ) : composing ? (
              <Stack spacing={1} alignItems="center" sx={{ py: 6, textAlign: "center", px: 3 }}>
                <MailRoundedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  New conversation with {displayNameOf(activeOther)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Messages here are private, just between the two of you.
                </Typography>
              </Stack>
            ) : null}
          </Box>

          {/* Composer / gating notices */}
          <Box sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1.5 }}>
            {viewerHasBlocked ? (
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                <Typography variant="body2" color="text.secondary">
                  You&apos;ve blocked {displayNameOf(activeOther)}. Unblock them to send messages.
                </Typography>
                <Button size="small" variant="outlined" onClick={handleBlockToggle} sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}>
                  Unblock
                </Button>
              </Stack>
            ) : composing && composeTarget && !composeTarget.canMessage ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                {displayNameOf(activeOther)} isn&apos;t accepting new messages right now.
              </Typography>
            ) : (
              <>
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField
                    fullWidth
                    multiline
                    maxRows={6}
                    size="small"
                    placeholder={`Message ${displayNameOf(activeOther)}`}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                    onKeyDown={(e) => {
                      // Enter stays a newline (email-like); Cmd/Ctrl+Enter sends
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    // Stays enabled while sending so typing is never interrupted;
                    // handleSend and the button guard against double-sends.
                    disabled={composing && composeTarget !== null && !composeTarget.canMessage}
                    inputRef={draftInputRef}
                  />
                  <ChatEmojiPicker
                    disabled={composing && composeTarget !== null && !composeTarget.canMessage}
                    onPick={(emoji) => {
                      // Same caret-insert behavior as the plan-chat composer.
                      const el = draftInputRef.current;
                      const start = el && typeof el.selectionStart === "number" ? el.selectionStart : draft.length;
                      const end = el && typeof el.selectionEnd === "number" ? el.selectionEnd : start;
                      const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MAX_MESSAGE_LENGTH);
                      setDraft(next);
                      requestAnimationFrame(() => {
                        const node = draftInputRef.current;
                        if (!node) return;
                        node.focus();
                        const pos = Math.min(start + emoji.length, next.length);
                        node.setSelectionRange(pos, pos);
                      });
                    }}
                  />
                  <IconButton
                    color="primary"
                    onClick={() => void handleSend()}
                    disabled={composerDisabled || !draft.trim()}
                    aria-label="Send message"
                    sx={{
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      "&:hover": { bgcolor: "primary.dark" },
                      "&.Mui-disabled": { bgcolor: "action.disabledBackground" },
                    }}
                  >
                    {sending ? <CircularProgress size={20} sx={{ color: "inherit" }} /> : <SendRoundedIcon fontSize="small" />}
                  </IconButton>
                </Stack>
                {draft.length >= MAX_MESSAGE_LENGTH - 500 && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      textAlign: "right",
                      mt: 0.5,
                      color: draft.length >= MAX_MESSAGE_LENGTH ? "warning.main" : "text.disabled",
                    }}
                  >
                    {draft.length.toLocaleString()}/{MAX_MESSAGE_LENGTH.toLocaleString()}
                  </Typography>
                )}
              </>
            )}
          </Box>
        </>
      ) : (
        <Stack spacing={1} alignItems="center" justifyContent="center" sx={{ flex: 1, textAlign: "center", px: 3, py: 8 }}>
          <MailRoundedIcon sx={{ fontSize: 42, color: "text.disabled" }} />
          <Typography variant="body1" fontWeight={600} color="text.secondary">
            Select a conversation
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Or start one from someone&apos;s profile or a plan you both joined.
          </Typography>
        </Stack>
      )}
    </Paper>
  );

  return (
    // No top padding: the (app) layout's Container already provides the page
    // offset, and the sidebar card sits at that same line; extra padding here
    // pushed the panes visibly below the sidebar's top edge.
    <Box sx={{ maxWidth: 1080, mx: "auto", pb: { xs: 1, sm: 2 } }}>
      {/* gap (not Stack spacing) so a display:none pane on mobile doesn't
          leave its sibling with a stray margin pushing it off-center */}
      <Stack
        direction="row"
        sx={{ gap: 2, height: { xs: "calc(100dvh - 130px)", md: "calc(100dvh - 136px)" }, minHeight: 420 }}
      >
        {listPane}
        {threadPane}
      </Stack>

      {/* New message picker */}
      <NewMessageDialog
        open={newMessageOpen}
        onClose={() => setNewMessageOpen(false)}
        onSelect={(userId) => {
          setNewMessageOpen(false);
          if (userId === toParam) return; // already composing to this person
          setComposeTarget(null);
          router.replace(`/inbox?to=${userId}`);
        }}
      />

      {/* Report dialog */}
      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        conversationId={activeConversationId}
        otherName={activeOther ? displayNameOf(activeOther) : ""}
      />

      {/* Block confirmation */}
      <Dialog open={blockConfirmOpen} onClose={() => setBlockConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Block {activeOther ? displayNameOf(activeOther) : "this user"}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You&apos;ll stop seeing each other on NewChums: no messages, no invites, no RSVPs to
            each other&apos;s plans. They won&apos;t be told they&apos;ve been blocked. You can
            unblock them any time from their profile or from Settings.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBlockConfirmOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }} variant="text">
            Cancel
          </Button>
          <Button onClick={() => void confirmBlock()} color="error" variant="contained" sx={{ textTransform: "none", fontWeight: 600 }}>
            Block
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── Report dialog ────────────────────────────────────────────────────────────

function ReportDialog({
  open,
  onClose,
  conversationId,
  otherName,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  otherName: string;
}) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!conversationId || !reason) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/inbox/${conversationId}/report`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (res.ok) {
        toast.success("Report submitted. Our team will take a look.");
        setReason("");
        setDetails("");
        onClose();
      } else {
        toast.error("Couldn't submit the report. Please try again.");
      }
    } catch {
      toast.error("Couldn't submit the report. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Report {otherName}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The recent messages in this conversation will be shared with the NewChums safety team as part of your report.
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          sx={{ mb: 2 }}
        >
          {REPORT_REASONS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          fullWidth
          multiline
          minRows={2}
          maxRows={5}
          size="small"
          label="Anything else we should know? (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 2000))}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: "none", fontWeight: 600 }} variant="text">
          Cancel
        </Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={!reason || submitting}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {submitting ? "Submitting..." : "Submit report"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
