"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import type { MtgRevealPayload } from "../mtgTypes";
import BadgeChip from "./BadgeChip";

/**
 * The Reveal on the group home after the lock (spec 10.2): the viewer's lock
 * badges and the Group Mind's mythics, with the way into the full Reveal.
 */
export default function RevealSummary({ communityId, slug }: { communityId: string; slug: string }) {
  const [data, setData] = useState<MtgRevealPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/mtg/communities/${communityId}/reveal?view=summary`, { auth: true });
        const body = await res.json();
        if (cancelled) return;
        if (res.ok && body.ok) setData(body as MtgRevealPayload);
        else setFailed(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [communityId]);

  const href = `/communities/${slug}/reveal`;
  const me = data?.players.find((p) => p.isViewer) ?? null;
  const mythics = data?.mind.mythic ?? [];
  const sectionLabel = { textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 800 } as const;

  return (
    <AppCard>
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: "50%", bgcolor: "primary.light", color: "primary.dark", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <AutoAwesomeRoundedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.2 }}>The Reveal</Typography>
          <Typography variant="caption" color="text.secondary">
            {data
              ? `${data.entries} ${data.entries === 1 ? "entry" : "entries"} locked in. Everyone's picks are out.`
              : failed ? "Everyone's picks are out." : "Loading…"}
          </Typography>
        </Box>
      </Stack>

      {me && me.badges.length > 0 && (
        <Box sx={{ mb: 1.75 }}>
          <Typography variant="caption" color="text.secondary" sx={sectionLabel}>Your badges</Typography>
          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
            {me.badges.map((b) => <BadgeChip key={`${b.code}-${b.name}`} badge={b} />)}
          </Stack>
        </Box>
      )}
      {me && me.pickCount === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          You&apos;re following along this season.
        </Typography>
      )}

      {mythics.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={sectionLabel}>Group Mind mythics</Typography>
          <Box sx={{ mt: 0.75, display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: { xs: 0.75, sm: 1 }, maxWidth: 520 }}>
            {mythics.map((m) => (
              <Box
                key={m.card.id}
                component={Link}
                href={href}
                aria-label={`Group Mind #${m.slot}: ${m.card.name}`}
                title={m.card.name}
                sx={{ position: "relative", display: "block", aspectRatio: "488 / 680", borderRadius: "4.5% / 3.2%", overflow: "hidden", bgcolor: "grey.100", border: "1px solid", borderColor: "divider" }}
              >
                {m.card.imageNormal ? (
                  // Scryfall art is shown whole, never cropped, per their rules.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.card.imageNormal} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                ) : (
                  <Stack sx={{ height: "100%", p: 0.5 }} alignItems="center" justifyContent="center">
                    <Typography variant="caption" sx={{ fontSize: "0.625rem", fontWeight: 700, textAlign: "center", lineHeight: 1.1, color: "text.primary" }}>{m.card.name}</Typography>
                  </Stack>
                )}
                <Box sx={{ position: "absolute", top: 3, left: 3, minWidth: 20, height: 20, px: 0.5, borderRadius: 10, bgcolor: "rgba(17,24,39,0.82)", color: "#fff", fontSize: "0.6875rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {m.slot}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      <Button component={Link} href={href} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none" }}>
        See everyone&apos;s picks
      </Button>
    </AppCard>
  );
}
