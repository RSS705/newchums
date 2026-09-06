"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { SECTION_SCROLL_MARGIN } from "@/lib/scrollOffsets";
import ProfileSectionHeader from "./ProfileSectionHeader";

type KudosItem = {
  tag: string;
  label: string;
  emoji: string;
  count: number;
};

type PublicProfileKudosSectionProps = {
  /** Handle (without leading @) for the profile being viewed. */
  handle: string;
  /** True when the logged-in viewer is the profile owner. Only shapes the
   *  subtitle: every viewer sees the same tags. */
  isOwner: boolean;
  /** Forwards auth on the fetch so the API can detect the owner. */
  viewerLoggedIn: boolean;
};

/** Public Tags section on /u/<handle> (kudos internally). Aggregated
 *  counts per tag, never who gave what, shown to anyone who can see the
 *  profile, even a tag given once. The top three read as tiles, the rest
 *  as chips. Renders nothing when there are no tags, so a profile without
 *  any carries no empty stub. */
export default function PublicProfileKudosSection({ handle, isOwner, viewerLoggedIn }: PublicProfileKudosSectionProps) {
  // No handle means nothing to fetch; start resolved so the effect never
  // has to set state synchronously.
  const [items, setItems] = useState<KudosItem[] | null>(handle ? null : []);

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

  if (!items || items.length === 0) return null;

  const total = items.reduce((sum, it) => sum + it.count, 0);
  const featured = items.slice(0, 3);
  const rest = items.slice(3);

  return (
    <Box id="kudos" sx={{ scrollMarginTop: SECTION_SCROLL_MARGIN }}>
      <AppCard>
        <ProfileSectionHeader
          icon={<WorkspacePremiumRoundedIcon sx={{ fontSize: 20 }} />}
          title="Tags"
          meta={<Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{total}</Typography>}
          subtitle={
            isOwner
              ? "What people from your plans gave you. Nobody sees who gave what."
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: 0.5,
                py: { xs: 1.75, sm: 2.25 },
                px: 1,
                borderRadius: 2.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: (theme) => (theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)"),
                minWidth: 0,
              }}
            >
              <Typography component="span" sx={{ fontSize: { xs: "1.75rem", sm: "2rem" }, lineHeight: 1 }} aria-hidden>
                {it.emoji}
              </Typography>
              <Typography variant="h6" fontWeight={800} sx={{ fontSize: { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.1, letterSpacing: "-0.01em" }}>
                ×{it.count}
              </Typography>
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ lineHeight: 1.3 }}>
                {it.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {rest.length > 0 && (
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
            {rest.map((it) => (
              <Chip
                key={it.tag}
                label={`${it.emoji} ${it.label} ×${it.count}`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600, fontSize: "0.75rem", height: 28, "& .MuiChip-label": { px: 1 } }}
              />
            ))}
          </Stack>
        )}
      </AppCard>
    </Box>
  );
}
