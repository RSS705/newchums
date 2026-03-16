"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";

const LABEL: Record<string, string> = {
  event_invite: "plan invitation emails",
  event_changed_canceled: "emails when a plan you're attending is updated or cancelled",
  join_request_received: "emails when someone requests to join your plan",
  join_request_accepted: "emails when your join request is accepted",
  join_request_declined: "emails when your join request is declined",
  host_join: "emails when someone confirms they're going to your plan",
  host_maybe: "emails when someone RSVPs as maybe to your plan",
  host_leave: "emails when someone can no longer make it to your plan",
  attendee_removed: "emails when you are removed from a plan",
};

type Status = "loading" | "success" | "invalid" | "error";

export default function UnsubscribeClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("loading");
  const [prefKey, setPrefKey] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("invalid");
      return;
    }

    apiFetch("/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { ok: boolean; key?: string };
        if (data.ok) {
          setPrefKey(data.key ?? null);
          setStatus("success");
        } else {
          setStatus("invalid");
        }
      })
      .catch(() => setStatus("error"));
  }, [searchParams]);

  const label = prefKey ? (LABEL[prefKey] ?? "these emails") : "these emails";

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        px: 2,
        py: 6,
      }}
    >
      <Box
        sx={{
          maxWidth: 480,
          width: "100%",
          bgcolor: "background.paper",
          borderRadius: 3,
          boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
          p: { xs: 3, sm: 5 },
        }}
      >
        {status === "loading" && (
          <Stack alignItems="center" spacing={2}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary">
              Processing your request…
            </Typography>
          </Stack>
        )}

        {status === "success" && (
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <CheckCircleOutlineRoundedIcon sx={{ fontSize: 32, color: "success.main", flexShrink: 0 }} />
              <Typography variant="h6" fontWeight={700}>
                You&apos;re unsubscribed
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              You&apos;ll no longer receive {label} from NewChums.
              Other notifications you&apos;ve enabled are not affected.
            </Typography>
            <Stack spacing={1.5} pt={0.5}>
              <Button
                component={Link}
                href="/settings"
                variant="outlined"
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Manage all notification settings
              </Button>
              <Button
                component={Link}
                href="/"
                sx={{ textTransform: "none", color: "text.secondary" }}
              >
                Back to NewChums
              </Button>
            </Stack>
          </Stack>
        )}

        {status === "invalid" && (
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <ErrorOutlineRoundedIcon sx={{ fontSize: 32, color: "warning.main", flexShrink: 0 }} />
              <Typography variant="h6" fontWeight={700}>
                Link expired or invalid
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              This unsubscribe link may have expired or already been used.
              You can manage your notification preferences directly in Settings.
            </Typography>
            <Button
              component={Link}
              href="/settings"
              variant="outlined"
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Go to notification settings
            </Button>
          </Stack>
        )}

        {status === "error" && (
          <Stack spacing={2.5}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <ErrorOutlineRoundedIcon sx={{ fontSize: 32, color: "error.main", flexShrink: 0 }} />
              <Typography variant="h6" fontWeight={700}>
                Something went wrong
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
              We couldn&apos;t process your request right now. Please try again, or manage your
              preferences directly in Settings.
            </Typography>
            <Button
              component={Link}
              href="/settings"
              variant="outlined"
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              Go to notification settings
            </Button>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
