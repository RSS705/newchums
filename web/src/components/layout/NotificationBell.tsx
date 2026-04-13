"use client";

import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import Link from "next/link";
import * as React from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import UserAvatar from "@/components/common/UserAvatar";

// ─── Types ──────────────────────────────────────────────────────────────────

type AppNotification = {
  id: string;
  type: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorHandle: string | null;
  actorAvatarUrl: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type UnreadChatEntry = {
  eventId: string;
  eventTitle: string;
  unreadCount: number;
  latestAt: string;
  latestMessageBody: string | null;
  latestSenderName: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GOLD = "#F4B400";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Plan-change notifications (and similar) include hostUsername/hostName in metadata; JOIN may also supply actor. Prefer @handle, then display name, never bare "Someone" when we have a name. */
function resolveActorLabel(n: AppNotification): { actorLabel: string; actorHref: string | null } {
  const metaHandle =
    typeof n.metadata?.hostUsername === "string" && n.metadata.hostUsername.trim().length > 0
      ? n.metadata.hostUsername.replace(/^@/, "").trim()
      : null;
  const metaName =
    typeof n.metadata?.hostName === "string" && n.metadata.hostName.trim().length > 0
      ? n.metadata.hostName.trim()
      : null;

  const handleSlug = n.actorHandle ? n.actorHandle.replace(/^@/, "").trim() : metaHandle;
  const actorHref = handleSlug ? `/u/${handleSlug}` : null;
  const actorLabel = handleSlug
    ? `@${handleSlug}`
    : n.actorDisplayName?.trim() || metaName || "Someone";

  return { actorLabel, actorHref };
}

function notificationText(n: AppNotification, viewerHandle: string | null): {
  actorLabel: string;
  actorHref: string | null;
  body: React.ReactNode;
} {
  const { actorLabel, actorHref } = resolveActorLabel(n);

  const eventTitle = n.metadata?.eventTitle as string | undefined;
  const eventId = n.entityId;
  const eventHref = eventId ? `/events/${eventId}` : null;

  const titleLink = eventTitle && eventHref ? (
    <Link href={eventHref} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
      onMouseOver={(e) => { (e.target as HTMLElement).style.textDecoration = "underline"; }}
      onMouseOut={(e) => { (e.target as HTMLElement).style.textDecoration = "none"; }}
    >
      &ldquo;{eventTitle}&rdquo;
    </Link>
  ) : eventTitle ? <>{`"${eventTitle}"`}</> : null;

  const rsvpStatus = n.metadata?.rsvpStatus as string | undefined;

  switch (n.type) {
    case "chum_added_you":
      return { actorLabel, actorHref, body: " saved you to their connections." };
    case "event_rsvp":
      return {
        actorLabel,
        actorHref,
        body: titleLink
          ? <>{rsvpStatus ? ` responded ${rsvpStatus} to your plan ` : " responded to your plan "}{titleLink}.</>
          : rsvpStatus ? ` responded ${rsvpStatus} to your plan.` : " responded to your plan.",
      };
    case "event_invite":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" invited you to "}{titleLink}.</> : " invited you to a plan.",
      };
    case "join_request":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" requested to join "}{titleLink}.</> : " requested to join your plan.",
      };
    case "join_request_withdrawn":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" withdrew their request to join "}{titleLink}.</> : " withdrew their request to join your plan.",
      };
    case "join_request_approved":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" approved your request to join "}{titleLink}!</> : " approved your request to join their plan!",
      };
    case "join_request_declined":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" declined your request to join "}{titleLink}.</> : " declined your request to join their plan.",
      };
    case "event_updated":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" updated the details for "}{titleLink}.</> : " updated a plan you're attending.",
      };
    case "event_locked":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" locked "}{titleLink}{". No new people can join."}</> : " locked a plan you're attending.",
      };
    case "event_canceled":
      return {
        actorLabel,
        actorHref,
        body: titleLink ? <>{" cancelled "}{titleLink}.</> : " cancelled a plan you were attending.",
      };
    case "event_alt_time": {
      const suggestedIso = n.metadata?.suggestedAt as string | undefined;
      const formattedTime = suggestedIso
        ? new Date(suggestedIso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
        : null;
      return {
        actorLabel,
        actorHref,
        body: titleLink
          ? <>{" suggested "}{formattedTime ? <><strong>{formattedTime}</strong>{" as an alternate time for "}</> : " an alternate time for "}{titleLink}.</>
          : formattedTime ? <>{" suggested "}<strong>{formattedTime}</strong>{" as an alternate time."}</> : " suggested an alternate time.",
      };
    }
    case "confirmation_requested":
      return {
        actorLabel: "Attendance check",
        actorHref: eventHref,
        body: titleLink ? <>{" for "}{titleLink}{". Confirm you're still coming."}</> : " for an upcoming plan. Confirm you're still coming.",
      };
    case "shoutout_received": {
      // entityId is the shoutout id, NOT an event id, so the existing
      // titleLink (which assumes /events/<entityId>) doesn't apply. The body
      // text deep-links to the recipient's Shout-outs section on their own
      // public profile (/u/<handle>#shoutouts). Falls back to /profile while
      // navProfile is still loading; that path no longer renders shout-outs
      // but will not 404 either.
      const planTitle = n.metadata?.planTitle as string | undefined;
      const shoutoutsHref = viewerHandle
        ? `/u/${viewerHandle.replace(/^@/, "")}#shoutouts`
        : "/profile#shoutouts";
      const trailing = planTitle
        ? <> left you a shout-out from <Box component={Link} href={shoutoutsHref} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>&ldquo;{planTitle}&rdquo;</Box>.</>
        : <> left you a <Box component={Link} href={shoutoutsHref} sx={{ fontWeight: 600, color: "inherit", textDecoration: "none", "&:hover": { textDecoration: "underline" } }}>shout-out</Box>.</>;
      return { actorLabel, actorHref, body: trailing };
    }
    case "community_join_request": {
      const communityName = n.metadata?.communityName as string | undefined;
      const communitySlug = n.metadata?.communitySlug as string | undefined;
      const communityHref = communitySlug ? `/communities/${communitySlug}` : null;
      const communityLink = communityName && communityHref ? (
        <Link href={communityHref} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
          onMouseOver={(e) => { (e.target as HTMLElement).style.textDecoration = "underline"; }}
          onMouseOut={(e) => { (e.target as HTMLElement).style.textDecoration = "none"; }}
        >
          {communityName}
        </Link>
      ) : communityName ? <strong>{communityName}</strong> : null;
      return {
        actorLabel,
        actorHref,
        body: communityLink ? <>{" requested to join "}{communityLink}.</> : " requested to join your community.",
      };
    }
    case "community_join_request_approved": {
      const communityName = n.metadata?.communityName as string | undefined;
      const communitySlug = n.metadata?.communitySlug as string | undefined;
      const communityHref = communitySlug ? `/communities/${communitySlug}` : null;
      const communityLink = communityName && communityHref ? (
        <Link href={communityHref} style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}
          onMouseOver={(e) => { (e.target as HTMLElement).style.textDecoration = "underline"; }}
          onMouseOut={(e) => { (e.target as HTMLElement).style.textDecoration = "none"; }}
        >
          {communityName}
        </Link>
      ) : communityName ? <strong>{communityName}</strong> : null;
      return {
        actorLabel,
        actorHref,
        body: communityLink ? <>{" approved your request to join "}{communityLink}!</> : " approved your community join request!",
      };
    }
    case "community_join_request_declined": {
      const communityName = n.metadata?.communityName as string | undefined;
      return {
        actorLabel,
        actorHref,
        body: communityName ? <>{" declined your request to join "}<strong>{communityName}</strong>.</> : " declined your community join request.",
      };
    }
    default:
      return { actorLabel, actorHref, body: " did something." };
  }
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  avatarBaseUrl,
  viewerHandle,
}: {
  notification: AppNotification;
  avatarBaseUrl: string;
  viewerHandle: string | null;
}) {
  const isUnread = !notification.readAt;
  const { actorLabel, actorHref, body } = notificationText(notification, viewerHandle);
  const avatarSrc = notification.actorAvatarUrl
    ? `${avatarBaseUrl}${notification.actorAvatarUrl}`
    : null;

  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        bgcolor: isUnread ? "rgba(244, 180, 0, 0.06)" : "transparent",
        transition: "background-color 0.2s ease",
        "&:hover": { bgcolor: "action.hover" },
        position: "relative",
      }}
    >
      {/* Unread indicator dot */}
      {isUnread && (
        <Box
          sx={{
            position: "absolute",
            left: 6,
            top: "50%",
            transform: "translateY(-50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: GOLD,
            flexShrink: 0,
          }}
        />
      )}

      {/* Actor avatar or event icon for system notifications */}
      <Box sx={{ flexShrink: 0 }}>
        {notification.type === "confirmation_requested" ? (
          actorHref ? (
            <Box
              component={Link}
              href={actorHref}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              <EventNoteRoundedIcon sx={{ fontSize: 20 }} />
            </Box>
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "#fff",
              }}
            >
              <EventNoteRoundedIcon sx={{ fontSize: 20 }} />
            </Box>
          )
        ) : actorHref ? (
          <Box component={Link} href={actorHref} sx={{ display: "block", textDecoration: "none" }}>
            <UserAvatar
              src={avatarSrc}
              name={notification.actorDisplayName}
              username={notification.actorHandle}
              size={36}
            />
          </Box>
        ) : (
          <UserAvatar
            src={avatarSrc}
            name={notification.actorDisplayName}
            username={notification.actorHandle}
            size={36}
          />
        )}
      </Box>

      {/* Text */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.45, color: "text.primary" }}>
          {actorHref ? (
            <Box
              component={Link}
              href={actorHref}
              sx={{
                fontWeight: 600,
                color: "text.primary",
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              {actorLabel}
            </Box>
          ) : (
            <Box component="span" sx={{ fontWeight: 600 }}>
              {actorLabel}
            </Box>
          )}
          {body}
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", mt: 0.25, display: "block" }}
        >
          {formatRelativeTime(notification.createdAt)}
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Unread chat row ──────────────────────────────────────────────────────────

function UnreadChatRow({ entry }: { entry: UnreadChatEntry }) {
  return (
    <Box
      component={Link}
      href={`/events/${entry.eventId}`}
      sx={{
        px: 2,
        py: 1.5,
        display: "flex",
        alignItems: "flex-start",
        gap: 1.5,
        bgcolor: "rgba(244, 180, 0, 0.06)",
        transition: "background-color 0.2s ease",
        "&:hover": { bgcolor: "action.hover" },
        position: "relative",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {/* Unread indicator dot */}
      <Box
        sx={{
          position: "absolute",
          left: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 6,
          height: 6,
          borderRadius: "50%",
          bgcolor: GOLD,
          flexShrink: 0,
        }}
      />

      {/* Chat icon */}
      <Box
        sx={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: "50%",
          bgcolor: "primary.main",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 18, color: "#fff" }} />
      </Box>

      {/* Text */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ lineHeight: 1.45, color: "text.primary" }}>
          <Box component="span" sx={{ fontWeight: 600 }}>
            {entry.unreadCount} new {entry.unreadCount === 1 ? "message" : "messages"}
          </Box>
          {" in "}
          <Box component="span" sx={{ fontWeight: 600 }}>
            {entry.eventTitle}
          </Box>
        </Typography>
        {entry.latestMessageBody && (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              mt: 0.25,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.latestSenderName ? `${entry.latestSenderName}: ` : ""}
            {entry.latestMessageBody}
          </Typography>
        )}
        <Typography
          variant="caption"
          sx={{ color: "text.disabled", mt: 0.25, display: "block" }}
        >
          {formatRelativeTime(entry.latestAt)}
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type NotificationBellProps = {
  /** Logged-in viewer's @handle (no leading "@"). Used to deep-link the
   *  shoutout_received notification straight to the recipient's own public
   *  profile shout-outs section (`/u/<handle>#shoutouts`). May be null while
   *  the parent's profile fetch is still in flight; the bell falls back to a
   *  safe legacy URL in that window. */
  viewerHandle?: string | null;
};

export default function NotificationBell({ viewerHandle = null }: NotificationBellProps = {}) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [unreadChats, setUnreadChats] = React.useState<UnreadChatEntry[]>([]);
  const [fetching, setFetching] = React.useState(false);
  const avatarBaseUrl = React.useMemo(() => {
    try {
      return getAvatarBaseUrl();
    } catch {
      return "";
    }
  }, []);

  const hasUnread = notifications.some((n) => !n.readAt) || unreadChats.length > 0;
  const open = Boolean(anchorEl);

  type NotificationsResponse = {
    ok: boolean;
    notifications?: AppNotification[];
    unreadChats?: UnreadChatEntry[];
  };

  const applyFetchResult = React.useCallback((data: NotificationsResponse) => {
    if (data.ok && Array.isArray(data.notifications)) {
      setNotifications(data.notifications);
    }
    if (data.ok && Array.isArray(data.unreadChats)) {
      setUnreadChats(data.unreadChats);
    }
  }, []);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await apiFetch("/notifications", { auth: true });
      if (!res.ok) return;
      const data = (await res.json()) as NotificationsResponse;
      applyFetchResult(data);
    } catch {
      // Non-critical; silently fail
    }
  }, [applyFetchResult]);

  // Initial load: fetch to populate unread state for bell colour
  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleOpen = React.useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      if (anchorEl) {
        setAnchorEl(null);
        return;
      }
      setAnchorEl(event.currentTarget);
      setFetching(true);
      try {
        const res = await apiFetch("/notifications", { auth: true });
        if (!res.ok) return;
        const data = (await res.json()) as NotificationsResponse;
        if (!data.ok || !Array.isArray(data.notifications)) return;

        const fresh = data.notifications;
        setNotifications(fresh);
        if (Array.isArray(data.unreadChats)) setUnreadChats(data.unreadChats);

        // Mark all unread regular notifications as read (chat entries clear when visited)
        const unreadIds = fresh.filter((n) => !n.readAt).map((n) => n.id);
        if (unreadIds.length > 0) {
          apiFetch("/notifications/read", {
            method: "POST",
            auth: true,
            body: JSON.stringify({ ids: unreadIds }),
          }).catch(() => {});
          setNotifications((prev) =>
            prev.map((n) =>
              unreadIds.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n,
            ),
          );
        }
      } catch {
        // Non-critical
      } finally {
        setFetching(false);
      }
    },
    [anchorEl],
  );

  const handleClose = React.useCallback(() => setAnchorEl(null), []);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const notificationContent = (
    <>
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, flexShrink: 0 }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Your Notifications
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          {fetching && <CircularProgress size={14} sx={{ color: "text.disabled" }} />}
          {isMobile && (
            <IconButton size="small" onClick={handleClose} aria-label="Close notifications" sx={{ minWidth: 36, minHeight: 36 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>
      <Divider />

      {/* Scrollable notification list */}
      <Box sx={{ overflowY: "auto", flex: 1 }}>
        {notifications.length === 0 && unreadChats.length === 0 ? (
          <Box sx={{ py: 5, px: 2, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              You&apos;re all caught up.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Unread chat entries first */}
            {unreadChats.map((entry, index) => (
              <React.Fragment key={`chat-${entry.eventId}`}>
                {index > 0 && <Divider sx={{ opacity: 0.5 }} />}
                <UnreadChatRow entry={entry} />
              </React.Fragment>
            ))}
            {unreadChats.length > 0 && notifications.length > 0 && (
              <Divider />
            )}
            {/* Regular notifications */}
            {notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                {index > 0 && <Divider sx={{ opacity: 0.5 }} />}
                <NotificationRow
                  notification={notification}
                  avatarBaseUrl={avatarBaseUrl}
                  viewerHandle={viewerHandle}
                />
              </React.Fragment>
            ))}
          </>
        )}
      </Box>
    </>
  );

  return (
    <>
      <IconButton
        aria-label="notifications"
        size="medium"
        onClick={handleOpen}
        sx={
          hasUnread
            ? {
                color: "#1a1a1a",
                bgcolor: GOLD,
                borderRadius: "10px",
                width: 36,
                height: 36,
                animation: "bellPulse 2.4s ease-in-out infinite",
                "@keyframes bellPulse": {
                  "0%, 100%": { boxShadow: `0 0 0 0 ${GOLD}55` },
                  "50%": { boxShadow: `0 0 0 6px ${GOLD}00` },
                },
                "&:hover": {
                  bgcolor: "#e5a800",
                  boxShadow: "none",
                },
              }
            : { color: "text.primary" }
        }
      >
        {hasUnread ? (
          <NotificationsRoundedIcon fontSize="small" />
        ) : (
          <NotificationsOutlinedIcon fontSize="medium" />
        )}
      </IconButton>

      {isMobile ? (
        <Drawer
          anchor="right"
          open={open}
          onClose={handleClose}
          PaperProps={{
            sx: {
              width: "100%",
              maxWidth: 360,
              display: "flex",
              flexDirection: "column",
            },
            // Auto-close the drawer when a notification link is tapped on mobile
            onClick: (e: React.MouseEvent<HTMLDivElement>) => {
              if ((e.target as HTMLElement).closest("a")) handleClose();
            },
          }}
        >
          {notificationContent}
        </Drawer>
      ) : (
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          disableScrollLock
          PaperProps={{
            elevation: 3,
            sx: {
              width: 360,
              maxWidth: 400,
              maxHeight: 460,
              display: "flex",
              flexDirection: "column",
              borderRadius: 2,
              overflow: "hidden",
            },
          }}
        >
          {notificationContent}
        </Popover>
      )}
    </>
  );
}
