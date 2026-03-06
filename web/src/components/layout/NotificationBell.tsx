"use client";

import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import NotificationsRoundedIcon from "@mui/icons-material/NotificationsRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
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

function notificationText(n: AppNotification): {
  actorLabel: string;
  actorHref: string | null;
  body: string;
} {
  // Always show @handle; fall back to "Someone" only if no handle is available
  const handleSlug = n.actorHandle ? n.actorHandle.replace(/^@/, "") : null;
  const actorLabel = handleSlug ? `@${handleSlug}` : "Someone";
  const actorHref = handleSlug ? `/u/${handleSlug}` : null;

  switch (n.type) {
    case "chum_added_you":
      return { actorLabel, actorHref, body: " added you to their Chums list. 🎉" };
    default:
      return { actorLabel, actorHref, body: " did something." };
  }
}

// ─── Notification row ─────────────────────────────────────────────────────────

function NotificationRow({
  notification,
  avatarBaseUrl,
}: {
  notification: AppNotification;
  avatarBaseUrl: string;
}) {
  const isUnread = !notification.readAt;
  const { actorLabel, actorHref, body } = notificationText(notification);
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

      {/* Actor avatar */}
      <Box sx={{ flexShrink: 0 }}>
        {actorHref ? (
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function NotificationBell() {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [fetching, setFetching] = React.useState(false);
  const avatarBaseUrl = React.useMemo(() => {
    try {
      return getAvatarBaseUrl();
    } catch {
      return "";
    }
  }, []);

  const hasUnread = notifications.some((n) => !n.readAt);
  const open = Boolean(anchorEl);

  const fetchNotifications = React.useCallback(async () => {
    try {
      const res = await apiFetch("/notifications", { auth: true });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; notifications?: AppNotification[] };
      if (data.ok && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch {
      // Non-critical; silently fail
    }
  }, []);

  // Initial load: fetch to populate unread state for bell colour
  React.useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleOpen = React.useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      setAnchorEl(event.currentTarget);
      setFetching(true);
      try {
        // Refresh the list
        const res = await apiFetch("/notifications", { auth: true });
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; notifications?: AppNotification[] };
        if (!data.ok || !Array.isArray(data.notifications)) return;

        const fresh = data.notifications;
        setNotifications(fresh);

        // Mark all unread as read
        const unreadIds = fresh.filter((n) => !n.readAt).map((n) => n.id);
        if (unreadIds.length > 0) {
          apiFetch("/notifications/read", {
            method: "POST",
            auth: true,
            body: JSON.stringify({ ids: unreadIds }),
          }).catch(() => {});
          // Optimistically update local state
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
    [],
  );

  const handleClose = React.useCallback(() => setAnchorEl(null), []);

  return (
    <>
      <IconButton
        color="inherit"
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
            : undefined
        }
      >
        {hasUnread ? (
          <NotificationsRoundedIcon fontSize="small" />
        ) : (
          <NotificationsOutlinedIcon fontSize="medium" />
        )}
      </IconButton>

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
            width: { xs: 320, sm: 360 },
            maxHeight: 460,
            display: "flex",
            flexDirection: "column",
            borderRadius: 2,
            overflow: "hidden",
          },
        }}
      >
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
          {fetching && <CircularProgress size={14} sx={{ color: "text.disabled" }} />}
        </Stack>
        <Divider />

        {/* Scrollable notification list */}
        <Box sx={{ overflowY: "auto", flex: 1 }}>
          {notifications.length === 0 ? (
            <Box sx={{ py: 5, px: 2, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                You&apos;re all caught up.
              </Typography>
            </Box>
          ) : (
            notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                {index > 0 && <Divider sx={{ opacity: 0.5 }} />}
                <NotificationRow
                  notification={notification}
                  avatarBaseUrl={avatarBaseUrl}
                />
              </React.Fragment>
            ))
          )}
        </Box>
      </Popover>
    </>
  );
}
