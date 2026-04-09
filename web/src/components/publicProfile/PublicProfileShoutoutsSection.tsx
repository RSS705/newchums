"use client";

import { useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import Link from "next/link";
import { AppCard, useToast } from "@/components/ui";
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

type PublicProfileShoutoutsSectionProps = {
  /** Handle (without leading @) for the profile being viewed. */
  handle: string;
  /** True when the logged-in viewer is the profile owner. Drives the inline
   *  hide/unhide control and the dimmed-preview state. */
  isOwner: boolean;
  /** True when there is any logged-in viewer at all. Used to forward auth on
   *  the fetch so the API can detect the owner case and return their items
   *  even when the section is hidden. */
  viewerLoggedIn: boolean;
  /** Initial value of the owner's `is_hidden_shoutouts` flag, taken from the
   *  /public/users/:handle payload. The component owns its own copy after
   *  mount so the inline toggle can flip optimistically. */
  initiallyHidden: boolean;
};

function formatReceived(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

/** Public Shout-outs section on /u/<handle>. Renders approved shout-outs the
 *  recipient has received. Hidden from non-owner viewers when the recipient
 *  has toggled `is_hidden_shoutouts` on; the owner sees the same content
 *  dimmed with an inline "Show on my public profile" control so they can
 *  reverse the toggle without leaving the page.
 *
 *  Empty state: when there are no approved shout-outs the entire card is
 *  suppressed for everyone (including the owner). No empty stubs. */
export default function PublicProfileShoutoutsSection({
  handle,
  isOwner,
  viewerLoggedIn,
  initiallyHidden,
}: PublicProfileShoutoutsSectionProps) {
  const [items, setItems] = useState<ShoutoutItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(initiallyHidden);
  const [toggling, setToggling] = useState(false);
  const avatarBase = getAvatarBaseUrl();
  const toast = useToast();

  useEffect(() => {
    if (!handle) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/public/users/${encodeURIComponent(handle)}/shoutouts`, {
          auth: viewerLoggedIn,
        });
        if (!res.ok) {
          if (!cancelled) {
            setItems([]);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          items?: ShoutoutItem[];
          hidden?: boolean;
        };
        if (cancelled) return;
        setItems(data.ok && Array.isArray(data.items) ? data.items : []);
        // Trust the server's hidden flag for the canonical state. For non-
        // owners the API zeroes out items when hidden so this is moot, but
        // for owners it ensures we render the dimmed-preview state even if
        // the parent's initiallyHidden hint was stale.
        if (typeof data.hidden === "boolean") setHidden(data.hidden);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle, viewerLoggedIn]);

  const handleToggleHidden = async () => {
    if (toggling) return;
    const next = !hidden;
    setHidden(next);
    setToggling(true);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ is_hidden_shoutouts: next }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setHidden(!next);
        toast.error("Couldn't update shout-out visibility");
      } else {
        toast.success(next ? "Shout-outs hidden from your public profile" : "Shout-outs visible on your public profile");
      }
    } catch {
      setHidden(!next);
      toast.error("Couldn't update shout-out visibility");
    } finally {
      setToggling(false);
    }
  };

  // Suppress entirely while loading and on the empty case (for everyone).
  if (loading) return null;
  if (!items || items.length === 0) return null;

  // Non-owners with the section hidden see nothing. The API already returns
  // empty items in that case, so this is a defense-in-depth check.
  if (hidden && !isOwner) return null;

  return (
    <AppCard
      id="shoutouts"
      sx={{
        borderRadius: { xs: 2.5, sm: 3 },
        overflow: "hidden",
        scrollMarginTop: 88,
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Stack
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={1}
            sx={{ flexWrap: "wrap", rowGap: 0.5 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}
              >
                Shout-outs
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.25, maxWidth: 560 }}
              >
                Notes from people they&rsquo;ve joined plans with.
              </Typography>
              {hidden && isOwner && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "block",
                    mt: 0.5,
                    color: "text.disabled",
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: 0.2,
                    textTransform: "uppercase",
                  }}
                >
                  Hidden from visitors
                </Typography>
              )}
            </Box>
            {isOwner && (
              <Button
                variant="text"
                size="small"
                disabled={toggling}
                onClick={handleToggleHidden}
                startIcon={
                  hidden ? (
                    <VisibilityOutlinedIcon sx={{ fontSize: "1rem !important" }} />
                  ) : (
                    <VisibilityOffOutlinedIcon sx={{ fontSize: "1rem !important" }} />
                  )
                }
                sx={{
                  fontSize: "0.75rem",
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                  textTransform: "none",
                  fontWeight: 500,
                  borderRadius: 2,
                  color: "text.disabled",
                  px: 1.25,
                  py: 0.5,
                  flexShrink: 0,
                  "&:hover": {
                    color: "text.secondary",
                    backgroundColor: "action.hover",
                  },
                }}
              >
                {hidden ? "Show on my public profile" : "Hide from my public profile"}
              </Button>
            )}
          </Stack>
        </Box>

        <Stack
          spacing={1.25}
          sx={{
            opacity: hidden && isOwner ? 0.55 : 1,
            transition: "opacity 0.2s ease",
          }}
        >
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
