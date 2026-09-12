"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import Tooltip from "@mui/material/Tooltip";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { SECTION_SCROLL_MARGIN } from "@/lib/scrollOffsets";
import ProfileSectionHeader from "./ProfileSectionHeader";

type KudosItem = {
  tag: string;
  label: string;
  emoji: string;
  count: number;
  /** Only sent to the profile owner. True when the tag is hidden from visitors. */
  hidden?: boolean;
};

type PublicProfileKudosSectionProps = {
  /** Handle (without leading @) for the profile being viewed. */
  handle: string;
  /** True when the logged-in viewer is the profile owner. Unlocks the
   *  per-tag hide control; everyone else sees only the visible tags. */
  isOwner: boolean;
  /** Forwards auth on the fetch so the API can detect the owner. */
  viewerLoggedIn: boolean;
};

/** Public Tags section on /u/<handle> (kudos internally). Aggregated
 *  counts per tag, never who gave what, shown to anyone who can see the
 *  profile, even a tag given once. The top three read as tiles, the rest
 *  as chips. Renders nothing when there are no tags, so a profile without
 *  any carries no empty stub.
 *
 *  The owner gets a small eye button on each tag: hiding one takes it off
 *  the public profile and out of the total, and the owner keeps seeing it
 *  dimmed so it can be put back. Hiding is presentation only, the tags
 *  themselves are never deleted. */
export default function PublicProfileKudosSection({ handle, isOwner, viewerLoggedIn }: PublicProfileKudosSectionProps) {
  // No handle means nothing to fetch; start resolved so the effect never
  // has to set state synchronously.
  const [items, setItems] = useState<KudosItem[] | null>(handle ? null : []);
  const [pendingTag, setPendingTag] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/public/users/${encodeURIComponent(handle)}/kudos`, { auth: viewerLoggedIn });
        if (!res.ok) { if (!cancelled) setItems([]); return; }
        const data = (await res.json()) as { ok?: boolean; items?: KudosItem[] };
        if (cancelled) return;
        setItems(data.ok && Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => { cancelled = true; };
  }, [handle, viewerLoggedIn]);

  /** Flip one tag's visibility. Optimistic, reverted if the call fails. */
  const toggleHidden = useCallback(async (tag: string, nextHidden: boolean) => {
    setPendingTag(tag);
    setItems((prev) => (prev ? prev.map((it) => (it.tag === tag ? { ...it, hidden: nextHidden } : it)) : prev));
    try {
      const res = await apiFetch(`/me/kudos/${encodeURIComponent(tag)}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden: nextHidden }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("failed");
      toast.success(nextHidden ? "Hidden from your profile" : "Back on your profile");
    } catch {
      setItems((prev) => (prev ? prev.map((it) => (it.tag === tag ? { ...it, hidden: !nextHidden } : it)) : prev));
      toast.error("Couldn't change that tag");
    } finally {
      setPendingTag(null);
    }
  }, [toast]);

  if (!items || items.length === 0) return null;

  // The owner's total mirrors what a visitor would count, so a hidden tag
  // stops contributing the moment it is hidden.
  const total = items.reduce((sum, it) => (it.hidden ? sum : sum + it.count), 0);
  const featured = items.slice(0, 3);
  const rest = items.slice(3);

  /** Hover hint for both shapes. Plain Tooltip, not TapTooltip: these are
   *  buttons, so a tap should act rather than open an explanation. */
  const hideHint = (hidden: boolean) =>
    hidden ? "Hidden from your profile. Tap to show it again." : "Hide this tag from your profile";

  const tileHideButton = (it: KudosItem) => {
    if (!isOwner) return null;
    const hidden = it.hidden === true;
    return (
      <Tooltip title={hideHint(hidden)} placement="top">
        <IconButton
          size="small"
          aria-label={hidden ? `Show ${it.label} on your profile` : `Hide ${it.label} from your profile`}
          disabled={pendingTag === it.tag}
          onClick={(e) => { e.stopPropagation(); toggleHidden(it.tag, !hidden); }}
          sx={{
            position: "absolute",
            top: 2,
            right: 2,
            p: 0.25,
            color: hidden ? "primary.main" : "text.disabled",
            opacity: hidden ? 1 : 0.5,
            "&:hover": { opacity: 1, color: "text.secondary", bgcolor: "transparent" },
          }}
        >
          {hidden
            ? <VisibilityOffOutlinedIcon sx={{ fontSize: 15 }} />
            : <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />}
        </IconButton>
      </Tooltip>
    );
  };

  return (
    <Box id="kudos" sx={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
      <AppCard>
        <ProfileSectionHeader
          icon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 20 }} />}
          title="Tags"
          meta={<Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{total}</Typography>}
          subtitle={
            isOwner
              ? "What people from your plans gave you. Nobody sees who gave what, and you can hide any tag with the eye."
              : "Given by people they've been on plans with."
          }
        />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: featured.length === 1 ? "1fr" : "repeat(2, 1fr)", sm: `repeat(${Math.min(3, featured.length)}, 1fr)` },
            gap: 1.25,
            mt: 2,
          }}
        >
          {featured.map((it) => (
            <Box
              key={it.tag}
              sx={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 0.5,
                py: { xs: 1.75, sm: 2.25 },
                px: 1,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: it.hidden ? "text.disabled" : "divider",
                borderStyle: it.hidden ? "dashed" : "solid",
                bgcolor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)"),
                minWidth: 0,
              }}
            >
              {tileHideButton(it)}
              <Typography component="span" sx={{ fontSize: { xs: "1.75rem", sm: "2rem" }, lineHeight: 1, opacity: it.hidden ? 0.45 : 1 }} aria-hidden>
                {it.emoji}
              </Typography>
              <Typography variant="h6" fontWeight={800} sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.1, letterSpacing: "-0.01em", opacity: it.hidden ? 0.45 : 1 }}>
                ×{it.count}
              </Typography>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ lineHeight: 1.3, opacity: it.hidden ? 0.45 : 1 }}>
                {it.label}
              </Typography>
              {it.hidden && (
                <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Hidden
                </Typography>
              )}
            </Box>
          ))}
        </Box>

        {rest.length > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            {rest.map((it) => {
              const hidden = it.hidden === true;
              const chip = (
                <Chip
                  label={`${it.emoji} ${it.label} ×${it.count}`}
                  size="small"
                  variant="outlined"
                  onDelete={isOwner ? () => toggleHidden(it.tag, !hidden) : undefined}
                  deleteIcon={
                    hidden
                      ? <VisibilityOffOutlinedIcon aria-label={`Show ${it.label} on your profile`} />
                      : <VisibilityOutlinedIcon aria-label={`Hide ${it.label} from your profile`} />
                  }
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    height: 28,
                    opacity: hidden ? 0.55 : 1,
                    borderStyle: hidden ? "dashed" : "solid",
                    "& .MuiChip-label": { px: 1 },
                    "& .MuiChip-deleteIcon": {
                      fontSize: 15,
                      ml: -0.25,
                      mr: 0.5,
                      color: hidden ? "primary.main" : "text.disabled",
                      opacity: hidden ? 1 : 0.5,
                      "&:hover": { opacity: 1, color: "text.secondary" },
                    },
                  }}
                />
              );
              return (
                <Box key={it.tag} component="span" sx={{ display: "inline-flex" }}>
                  {isOwner ? <Tooltip title={hideHint(hidden)} placement="top">{chip}</Tooltip> : chip}
                </Box>
              );
            })}
          </Stack>
        )}
      </AppCard>
    </Box>
  );
}
