"use client";

import { Fragment } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { srOnly } from "../pageBits";

export type GroupHistorySeries = {
  key: string;
  /** The player as the group sees them: "You", a name or a handle. */
  name: string;
  isViewer: boolean;
  /** One value per day, null where the player had no standing that day. */
  values: Array<number | null>;
};

type Props = {
  /** The days, oldest first, with short labels ("Oct 1"). */
  days: Array<{ key: string; label: string }>;
  series: GroupHistorySeries[];
  format: (value: number) => string;
  /** A dashed threshold, such as what random picks score. */
  reference?: { value: number; label: string };
  /** What the chart shows, for screen readers. */
  summary: string;
  /** Whether the table of every value is open (`NumbersToggle` in the card's title). */
  tableOpen: boolean;
  tableId: string;
};

/** One step off the white card surface; solid hairlines, never dashed. */
const GRID = "#E9EBEE";
const AXIS_TEXT = "#6B7280";
const REFERENCE = "#9CA3AF";

/**
 * The other players' hues, in a fixed order: the blue, green, pink, sky blue
 * and vermilion of the Okabe-Ito palette (chosen to stay apart under every
 * common color vision deficiency), a dark grey and a brown. The viewer's own
 * line takes the brand orange, as it does on their player page. A ninth
 * player and beyond reuse the hues with a dashed line, so identity is never
 * the color alone, and every line is also named in the legend, the tooltip
 * and the table.
 */
const HUES = ["#0072B2", "#009E73", "#CC79A7", "#56B4E9", "#D55E00", "#4B5563", "#8C6D1F"];
const DASHES = ["", "6 4", "2 3"];

function styleFor(index: number, accent: string): { stroke: string; dash: string } {
  if (index < 0) return { stroke: accent, dash: "" };
  return { stroke: HUES[index % HUES.length], dash: DASHES[Math.floor(index / HUES.length) % DASHES.length] };
}

/**
 * Every player's points across the season's days on one chart, drawn to the
 * dataviz rules: 2 px lines (the viewer's a little heavier, with a ringed end
 * dot), a solid hairline grid, a legend that names every line and a crosshair
 * tooltip that lists the day's standings in order. Every value is also in the
 * table behind the card's "Show the numbers" button.
 */
export default function GroupHistoryChart({ days, series, format, reference, summary, tableOpen, tableId }: Props) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const last = days.length - 1;
  // Others' hues follow the order given (the leaderboard's), skipping the viewer.
  const others = series.filter((s) => !s.isViewer).map((s) => s.key);
  const styles = new Map(series.map((s) => [s.key, styleFor(s.isViewer ? -1 : others.indexOf(s.key), accent)]));
  const rows = days.map((d, i) => Object.assign({ label: d.label, key: d.key }, ...series.map((s) => ({ [s.key]: s.values[i] }))) as Record<string, string | number | null>);

  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null)).concat(reference ? [reference.value] : []);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = Math.max((hi - lo) * 0.12, 10);
  const yDomain: [number, number] = [Math.max(0, Math.floor((lo - pad) / 10) * 10), Math.ceil((hi + pad) / 10) * 10];
  // The viewer's line is drawn last, so it sits over the others.
  const drawOrder = [...series.filter((s) => !s.isViewer), ...series.filter((s) => s.isViewer)];

  return (
    <Box>
      <Box component="figure" role="img" aria-label={summary} sx={{ m: 0, height: { xs: 220, sm: 260 } }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} tickMargin={6} />
            <YAxis width={48} domain={yDomain} allowDecimals={false} tickFormatter={(v: number) => format(v)} tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={false} />
            {reference && <ReferenceLine y={reference.value} stroke={REFERENCE} strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ stroke: "#9CA3AF", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const standing = series
                  .map((s) => ({ s, v: (payload[0].payload as Record<string, number | null>)[s.key] ?? null }))
                  .filter((x): x is { s: GroupHistorySeries; v: number } => x.v !== null)
                  .sort((a, b) => b.v - a.v);
                return (
                  <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1.25, py: 0.75, boxShadow: "0 4px 14px rgba(17,24,39,0.10)", maxWidth: 240 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 700, mb: 0.25 }}>{String(label)}</Typography>
                    {standing.map(({ s, v }) => (
                      <Box key={s.key} sx={{ display: "flex", alignItems: "center", gap: 0.75, lineHeight: 1.5 }}>
                        <Box aria-hidden sx={{ width: 14, borderTop: "2.5px solid", borderColor: styles.get(s.key)?.stroke, flexShrink: 0 }} />
                        <Typography variant="caption" sx={{ fontWeight: s.isViewer ? 800 : 500, minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{format(v)}</Typography>
                      </Box>
                    ))}
                  </Box>
                );
              }}
            />
            {drawOrder.map((s) => {
              const st = styles.get(s.key) as { stroke: string; dash: string };
              return (
                <Line
                  key={s.key}
                  type="linear"
                  dataKey={s.key}
                  name={s.name}
                  stroke={st.stroke}
                  strokeWidth={s.isViewer ? 3 : 2}
                  strokeDasharray={st.dash || undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; index?: number }) =>
                    (s.isViewer || days.length === 1) && props.index === last && props.cx !== undefined && props.cy !== undefined
                      ? <circle key={`dot-${s.key}-${props.index}`} cx={props.cx} cy={props.cy} r={s.isViewer ? 4.5 : 3} fill={st.stroke} stroke="#fff" strokeWidth={2} />
                      : <g key={`dot-${s.key}-${props.index}`} />}
                  activeDot={{ r: 5, fill: st.stroke, stroke: "#fff", strokeWidth: 2 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </Box>
      {/* The legend names every line; the viewer's comes first. */}
      <Box component="ul" aria-label="Players on the chart" sx={{ listStyle: "none", m: 0, mt: 1, p: 0, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {[...series.filter((s) => s.isViewer), ...series.filter((s) => !s.isViewer)].map((s) => {
          const st = styles.get(s.key) as { stroke: string; dash: string };
          return (
            <Box component="li" key={s.key} sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              <Box component="svg" aria-hidden width={22} height={8} viewBox="0 0 22 8" sx={{ flexShrink: 0 }}>
                <line x1="1" y1="4" x2="21" y2="4" stroke={st.stroke} strokeWidth={s.isViewer ? 3 : 2.5} strokeLinecap="round" strokeDasharray={st.dash || undefined} />
              </Box>
              <Typography variant="caption" sx={{ fontWeight: s.isViewer ? 800 : 600, color: "text.primary", lineHeight: 1.3 }}>{s.name}</Typography>
            </Box>
          );
        })}
      </Box>
      {reference && (
        <Box aria-hidden sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.75 }}>
          <Box sx={{ width: 18, borderTop: "2px dashed", borderColor: REFERENCE }} />
          <Typography variant="caption" sx={{ color: AXIS_TEXT, lineHeight: 1.3 }}>{reference.label}</Typography>
        </Box>
      )}
      {tableOpen && (
        <Box id={tableId} sx={{ overflowX: "auto", mt: 1 }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
              "& th, & td": { py: 0.5, px: 1, textAlign: "left", borderBottom: "1px solid", borderColor: "divider", whiteSpace: "nowrap" },
              "& th": { fontWeight: 700, color: "text.secondary" },
              "& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
              "& .you": { fontWeight: 800, color: "text.primary" },
            }}
          >
            <Box component="caption" sx={srOnly}>{summary}</Box>
            <thead>
              <tr>
                <th scope="col">Day</th>
                {series.map((s) => <th key={s.key} scope="col" className={`num${s.isViewer ? " you" : ""}`}>{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...days].map((d, i) => ({ d, i })).reverse().map(({ d, i }) => (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  {series.map((s) => (
                    <Fragment key={s.key}>
                      <td className={`num${s.isViewer ? " you" : ""}`}>{s.values[i] === null ? "–" : format(s.values[i] as number)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
    </Box>
  );
}
