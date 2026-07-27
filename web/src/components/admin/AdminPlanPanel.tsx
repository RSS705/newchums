"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import { apiFetch } from "@/lib/apiClient";

export type PlanAdminView = {
  locationVisibility: string;
  exactLocation: {
    name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    onlineLink: string | null;
  };
};

type TranscriptMessage = {
  id: string;
  body: string;
  createdAt: string;
  senderId: string;
  senderName: string;
  senderHandle: string | null;
};

/**
 * Super-admin-only moderation panel on the plan detail page. Server-gated:
 * the `adminView` payload only exists on super-admin responses. Everything
 * here is explicitly labeled "Admin view" so screenshots can never be
 * mistaken for what normal users see. The chat transcript is READ-ONLY:
 * fetched from a dedicated audited endpoint with no read-state or presence
 * side effects for anyone.
 */
export default function AdminPlanPanel({
  eventId,
  adminView,
}: {
  eventId: string;
  adminView: PlanAdminView;
}) {
  const [transcriptOpen, setTranscriptOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<TranscriptMessage[] | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [oldestCursor, setOldestCursor] = React.useState<string | null>(null);
  const [transcriptError, setTranscriptError] = React.useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);

  const loc = adminView.exactLocation;
  const hiddenFromSomeViewers = adminView.locationVisibility !== "exact_everyone";

  React.useEffect(() => {
    if (!transcriptOpen) return;
    let cancelled = false;
    setMessages(null);
    setTranscriptError(null);
    apiFetch(`/admin/events/${eventId}/chat-transcript`, { auth: true })
      .then((r) => r.json())
      .then((json: { ok: boolean; messages?: TranscriptMessage[]; hasMore?: boolean; oldestCursor?: string | null; error?: string }) => {
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error ?? "Failed to load transcript");
        setMessages(json.messages ?? []);
        setHasMore(json.hasMore === true);
        setOldestCursor(json.oldestCursor ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setTranscriptError(err instanceof Error ? err.message : "Failed to load transcript");
      });
    return () => {
      cancelled = true;
    };
  }, [transcriptOpen, eventId]);

  async function loadOlder() {
    if (!oldestCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch(
        `/admin/events/${eventId}/chat-transcript?before=${encodeURIComponent(oldestCursor)}`,
        { auth: true },
      );
      const json = (await res.json()) as { ok: boolean; messages?: TranscriptMessage[]; hasMore?: boolean; oldestCursor?: string | null };
      if (json.ok) {
        setMessages((prev) => [...(json.messages ?? []), ...(prev ?? [])]);
        setHasMore(json.hasMore === true);
        setOldestCursor(json.oldestCursor ?? null);
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, borderRadius: 3, borderColor: "warning.main", bgcolor: "warning.light" }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <ShieldRoundedIcon sx={{ fontSize: 18, color: "warning.dark" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Admin view
          </Typography>
          <Chip
            label="Not visible to members"
            size="small"
            variant="outlined"
            sx={{ fontSize: "0.6875rem", height: 20 }}
          />
        </Stack>

        <Box>
          <Typography variant="body2" fontWeight={600}>
            Exact location{hiddenFromSomeViewers ? " (hidden or approximate for some viewers)" : ""}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            {loc.onlineLink ? (
              <>Online: {loc.onlineLink}</>
            ) : (
              <>
                {[loc.name, loc.address].filter(Boolean).join(", ") || "No location details on record"}
                {loc.lat != null && loc.lng != null ? (
                  <>
                    {" "}
                    (
                    <a
                      href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                    </a>
                    )
                  </>
                ) : null}
              </>
            )}
          </Typography>
        </Box>

        <Box>
          <Button
            variant="outlined"
            size="small"
            color="warning"
            startIcon={<ForumRoundedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setTranscriptOpen(true)}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            View chat transcript (read-only)
          </Button>
        </Box>
      </Stack>

      <Dialog open={transcriptOpen} onClose={() => setTranscriptOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <ShieldRoundedIcon sx={{ fontSize: 18, color: "warning.dark" }} />
            <span>Chat transcript</span>
            <Chip label="Admin view, read-only" size="small" variant="outlined" sx={{ fontSize: "0.6875rem", height: 20 }} />
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            Moderation access. This view sends nothing, marks nothing as read, and never affects
            anyone&apos;s unread counts. Each open is recorded in the admin audit log.
          </Typography>
          {messages === null && !transcriptError && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {transcriptError && (
            <Typography variant="body2" color="error">
              {transcriptError}
            </Typography>
          )}
          {messages !== null && messages.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No chat messages on this plan.
            </Typography>
          )}
          {messages !== null && messages.length > 0 && (
            <Stack spacing={1.25}>
              {hasMore && (
                <Button size="small" onClick={() => void loadOlder()} disabled={loadingOlder} sx={{ textTransform: "none", alignSelf: "center" }}>
                  {loadingOlder ? "Loading..." : "Load older messages"}
                </Button>
              )}
              {messages.map((m) => (
                <Box key={m.id}>
                  <Typography variant="caption" color="text.secondary">
                    {m.senderName}
                    {m.senderHandle ? ` (${m.senderHandle})` : ""} &middot;{" "}
                    {new Date(m.createdAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                    {m.body}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTranscriptOpen(false)} sx={{ textTransform: "none" }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
