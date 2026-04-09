"use client";

import { useEffect, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
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
  /** Per-card visibility flag (migration 076). When true, non-owner viewers
   *  do not receive this item from the API at all; it's only surfaced here
   *  so the profile owner can render it in a dimmed "hidden from visitors"
   *  state and toggle it back via the inline icon button. */
  hiddenByRecipient: boolean;
  sender: {
    userId: string;
    displayName: string;
    username: string | null;
  };
};

type PublicProfileShoutoutsSectionProps = {
  /** Handle (without leading @) for the profile being viewed. */
  handle: string;
  /** True when the logged-in viewer is the profile owner. Drives the per-
   *  card hide/unhide icon button and the dimmed-preview state. */
  isOwner: boolean;
  /** True when there is any logged-in viewer at all. Used to forward auth on
   *  the fetch so the API can detect the owner case and return their items
   *  even when the section is hidden. */
  viewerLoggedIn: boolean;
  /** Initial value of the owner's section-level `is_hidden_shoutouts` flag,
   *  taken from the /public/users/:handle payload. Controls only whether
   *  the whole Shout-outs section is hidden from visitors; per-card
   *  visibility is a separate dimension handled below. The section-level
   *  toggle lives in Settings -> Privacy; there is intentionally no inline
   *  control for it. */
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
 *  recipient has received.
 *
 *  Two independent visibility dimensions are at play:
 *    1. Section-level (`users.is_hidden_shoutouts`, migration 074) -
 *       controlled exclusively from Settings -> Privacy. When true, the
 *       section is hidden from all non-owner viewers. The owner still sees
 *       the section here in a dimmed "Hidden from visitors" preview with
 *       a caption explaining the state.
 *    2. Per-card (`shoutouts.hidden_by_recipient`, migration 076) -
 *       controlled via the subtle eye/eye-off IconButton on each card
 *       (owner-only). Non-owner viewers never receive hidden rows from the
 *       API. Owners see them dimmed with the icon in the "show" state.
 *
 *  Empty state: when there are no visible shout-outs for the current viewer
 *  (non-owner: all approved minus any `hidden_by_recipient = true`; owner:
 *  all approved) the whole card is suppressed. No empty stubs. */
export default function PublicProfileShoutoutsSection({
  handle,
  isOwner,
  viewerLoggedIn,
  initiallyHidden,
}: PublicProfileShoutoutsSectionProps) {
  const [items, setItems] = useState<ShoutoutItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [sectionHidden, setSectionHidden] = useState(initiallyHidden);
  // Per-card in-flight toggles, keyed by shoutout id. Used to disable the
  // icon button while a request is in flight so a rapid double-click can't
  // race two mutations.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
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
        const fetchedItems = data.ok && Array.isArray(data.items)
          ? data.items.map((it) => ({ ...it, hiddenByRecipient: Boolean(it.hiddenByRecipient) }))
          : [];
        setItems(fetchedItems);
        // Trust the server's section-level hidden flag as the canonical
        // state. Non-owners never hit this branch because the API gates
        // them out earlier, but owners need the accurate value so the
        // dimmed-preview and "Hidden from visitors" caption render.
        if (typeof data.hidden === "boolean") setSectionHidden(data.hidden);
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

  const handleToggleCard = async (shoutoutId: string, currentlyHidden: boolean) => {
    if (togglingIds.has(shoutoutId)) return;
    const next = !currentlyHidden;
    // Optimistic local flip so the card responds immediately.
    setItems((prev) =>
      prev
        ? prev.map((it) => (it.id === shoutoutId ? { ...it, hiddenByRecipient: next } : it))
        : prev
    );
    setTogglingIds((prev) => {
      const copy = new Set(prev);
      copy.add(shoutoutId);
      return copy;
    });
    try {
      const res = await apiFetch(`/shoutouts/${encodeURIComponent(shoutoutId)}`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ hidden: next }),
      });
      const data = (await res.json()) as { ok?: boolean; hidden?: boolean };
      if (!res.ok || !data.ok) {
        // Revert on failure.
        setItems((prev) =>
          prev
            ? prev.map((it) =>
                it.id === shoutoutId ? { ...it, hiddenByRecipient: currentlyHidden } : it
              )
            : prev
        );
        toast.error("Couldn't update shout-out visibility");
      }
    } catch {
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              it.id === shoutoutId ? { ...it, hiddenByRecipient: currentlyHidden } : it
            )
          : prev
      );
      toast.error("Couldn't update shout-out visibility");
    } finally {
      setTogglingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(shoutoutId);
        return copy;
      });
    }
  };

  // Suppress entirely while loading and on the empty case (for everyone).
  if (loading) return null;
  if (!items || items.length === 0) return null;

  // Non-owners with the section hidden see nothing. The API already returns
  // empty items in that case, so this is a defense-in-depth check.
  if (sectionHidden && !isOwner) return null;

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
          {sectionHidden && isOwner && (
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
              Section hidden from visitors (Settings &rsaquo; Privacy)
            </Typography>
          )}
        </Box>

        <Stack
          spacing={1.25}
          sx={{
            // The whole list dims slightly when the owner has hidden the
            // section via Settings, purely as an at-a-glance state cue.
            // Per-card dimming is layered on top below.
            opacity: sectionHidden && isOwner ? 0.72 : 1,
            transition: "opacity 0.2s ease",
          }}
        >
          {items.map((s) => {
            const profileHref = s.sender.username
              ? `/u/${s.sender.username.replace(/^@/, "")}`
              : null;
            const planHref = `/events/${s.planId}`;
            const cardHidden = s.hiddenByRecipient;
            const isToggling = togglingIds.has(s.id);
            return (
              <Box
                key={s.id}
                sx={{
                  position: "relative",
                  p: { xs: 1.75, sm: 2 },
                  // Reserve space on the right so the absolute-positioned
                  // icon button never collides with the message text on
                  // narrow screens.
                  pr: isOwner ? { xs: 4.5, sm: 5 } : { xs: 1.75, sm: 2 },
                  borderRadius: 2.5,
                  border: "1px solid",
                  borderColor: "grey.200",
                  background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 75%)",
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  alignItems="flex-start"
                  sx={{
                    opacity: cardHidden ? 0.5 : 1,
                    transition: "opacity 0.2s ease",
                  }}
                >
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

                {isOwner && (
                  <Tooltip
                    title={cardHidden ? "Show this shout-out" : "Hide this shout-out"}
                    arrow
                    placement="top"
                    enterTouchDelay={0}
                  >
                    <span>
                      <IconButton
                        size="small"
                        disabled={isToggling}
                        onClick={() => handleToggleCard(s.id, cardHidden)}
                        aria-label={cardHidden ? "Show this shout-out" : "Hide this shout-out"}
                        sx={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          color: "text.disabled",
                          "&:hover": {
                            color: "text.secondary",
                            backgroundColor: "rgba(0, 0, 0, 0.04)",
                          },
                        }}
                      >
                        {cardHidden ? (
                          <VisibilityOutlinedIcon sx={{ fontSize: "1.0625rem" }} />
                        ) : (
                          <VisibilityOffOutlinedIcon sx={{ fontSize: "1.0625rem" }} />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            );
          })}
        </Stack>
      </Stack>
    </AppCard>
  );
}
