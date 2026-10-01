"use client";

import { useEffect, useId, useState } from "react";
import Skeleton from "@mui/material/Skeleton";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import GroupHistoryChart from "../charts/GroupHistoryChart";
import NumbersToggle from "../charts/NumbersToggle";
import { IconTitle } from "../pageBits";
import { type MtgHistoryPayload, formatDayKey, seasonQuery } from "../mtgTypes";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const firstName = (p: { name: string | null; username: string | null; isViewer: boolean }) =>
  p.isViewer ? "You" : p.name?.trim().split(/\s+/)[0] || (p.username ? `@${p.username}` : "Member");

/**
 * Everyone's points, day by day, on one chart (Version 26): the group home's
 * card under the Reveal, from the first standings on. The lines are the
 * players ranked on the latest day, in rank order, so the legend reads like
 * the standings. Nothing shows until there are standings, and a group with
 * nobody ranked shows nothing either.
 */
export default function GroupHistory({ communityId, setCode, past = false }: { communityId: string; setCode: string; past?: boolean }) {
  const [data, setData] = useState<MtgHistoryPayload | null | "failed">(null);
  const [numbersOpen, setNumbersOpen] = useState(false);
  const numbersId = useId();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch(`/mtg/communities/${communityId}/history${past ? seasonQuery(setCode) : ""}`, { auth: true });
        const body = (await res.json()) as { ok?: boolean } & MtgHistoryPayload;
        if (cancelled) return;
        setData(res.ok && body.ok ? body : "failed");
      } catch {
        if (!cancelled) setData("failed");
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [communityId, setCode, past]);

  if (data === "failed") return null;
  if (data === null) {
    return (
      <AppCard>
        <IconTitle icon={<ShowChartRoundedIcon sx={{ fontSize: 18 }} />} title="Points over time" caption="Everyone in the group, day by day." />
        <Skeleton variant="rounded" sx={{ height: { xs: 220, sm: 260 } }} />
      </AppCard>
    );
  }
  if (data.dates.length === 0 || data.players.length === 0) return null;

  const days = data.dates.map((d) => ({ key: d.date, label: formatDayKey(d.date) }));
  const series = data.players.map((p) => ({ key: p.userId, name: firstName(p), isViewer: p.isViewer, values: p.totals }));
  const leader = data.players[0];
  const dayWord = data.dates.length === 1 ? "1 day" : `${data.dates.length} days`;
  const summary = `${data.players.length} players' points over ${dayWord} of standings${leader ? `, ${firstName(leader)} leading on the latest with ${whole(leader.totals[leader.totals.length - 1] ?? 0)}` : ""}.`;

  return (
    <AppCard>
      <IconTitle
        icon={<ShowChartRoundedIcon sx={{ fontSize: 18 }} />}
        title="Points over time"
        caption="Everyone in the group, day by day."
        action={<NumbersToggle open={numbersOpen} onToggle={() => setNumbersOpen((v) => !v)} tableId={numbersId} />}
      />
      <GroupHistoryChart
        days={days}
        series={series}
        format={whole}
        reference={{ value: data.randomPicks, label: `Random picks score about ${whole(data.randomPicks)}` }}
        summary={summary}
        tableOpen={numbersOpen}
        tableId={numbersId}
      />
    </AppCard>
  );
}
