"use client";

import { useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Link from "next/link";
import { AppCard } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

type ShoutoutItem = {
  id: string;
  message: string;
  receivedAt: string;
  planId: string;
  planTitle: string;
  planStartsAt: string;
  sender: {
    userId: string;
    displayName: string;
    username: string | null;
  };
};

function formatReceived(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

/** Private "Shout-outs received" section on the user's own /profile page.
 *  Renders approved shout-outs left by other participants on plans the user
 *  attended. Hidden from the public profile in v1. */
export default function ProfileShoutoutsReceivedSection() {
  const [items, setItems] = useState<ShoutoutItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const avatarBase = getAvatarBaseUrl();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/profile/shoutouts", { auth: true });
        if (!res.ok) {
          if (!cancelled) { setItems([]); setLoading(false); }
          return;
        }
        const data = (await res.json()) as { ok?: boolean; items?: ShoutoutItem[] };
        if (cancelled) return;
        setItems(data.ok && Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hide the section entirely while loading or when the user has no
  // approved shout-outs yet — keeps /profile clean for the empty case so
  // there's no visible "blank state" card. The section appears the moment
  // a shout-out lands.
  if (loading || !items || items.length === 0) return null;

  return (
    <AppCard id="shoutouts" sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden", scrollMarginTop: 88 }}>
      <Stack spacing={2}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
              Shout-outs received
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.375} sx={{ color: "text.disabled" }}>
              <LockOutlinedIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ fontSize: "0.6875rem", fontWeight: 600 }}>
                Only visible to you
              </Typography>
            </Stack>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, maxWidth: 560 }}>
            Notes from other participants on plans you've attended.
          </Typography>
        </Box>

        <Stack spacing={1.25}>
            {items.map((s) => {
              const profileHref = s.sender.username
                ? `/u/${s.sender.username.replace(/^@/, "")}`
                : null;
              const planHref = `/events/${s.planId}`;
              return (
                <Box
                  key={s.id}
                  sx={{
                    p: { xs: 1.75, sm: 2 },
                    borderRadius: 2.5,
                    border: "1px solid",
                    borderColor: "grey.200",
                    background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 75%)",
                  }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <Avatar
                      src={`${avatarBase}/users/${s.sender.userId}/avatar`}
                      sx={{ width: 36, height: 36, fontSize: "0.9375rem", flexShrink: 0, mt: 0.25 }}
                    >
                      {s.sender.displayName[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack
                        direction="row"
                        alignItems="baseline"
                        spacing={0.75}
                        sx={{ flexWrap: "wrap", rowGap: 0.25 }}
                      >
                        <Typography
                          component={profileHref ? Link : "span"}
                          {...(profileHref ? { href: profileHref } : {})}
                          sx={{
                            fontWeight: 700,
                            fontSize: "0.9375rem",
                            color: profileHref ? "primary.dark" : "text.primary",
                            textDecoration: "none",
                            "&:hover": profileHref ? { textDecoration: "underline" } : {},
                          }}
                        >
                          {s.sender.displayName}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.disabled", fontSize: "0.75rem" }}>
                          on{" "}
                          <Box
                            component={Link}
                            href={planHref}
                            sx={{
                              color: "text.secondary",
                              textDecoration: "none",
                              fontWeight: 600,
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {s.planTitle}
                          </Box>
                          {" · "}
                          {formatReceived(s.receivedAt)}
                        </Typography>
                      </Stack>
                      <Typography
                        sx={{
                          mt: 0.625,
                          fontSize: "0.9375rem",
                          lineHeight: 1.5,
                          color: "text.primary",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {s.message}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              );
            })}
        </Stack>
      </Stack>
    </AppCard>
  );
}
