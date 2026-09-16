"use client";

import { useId, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { CartesianGrid, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { srOnly } from "../pageBits";

export type HistoryPoint = { key: string; label: string; value: number; detail?: string };

type Props = {
  /** What the line measures, for the table header: "Points", "Rank". */
  valueName: string;
  /** What the optional detail is, for the table header: "Group rank". */
  detailName?: string;
  points: HistoryPoint[];
  format: (value: number) => string;
  /** Rank charts put the best (lowest) value at the top. */
  invert?: boolean;
  /** Axis bounds; by default the data's range with some room around it. */
  domain?: [number, number];
  /** A dashed threshold, such as what random picks score. */
  reference?: { value: number; label: string };
  /** What the chart shows, for screen readers. */
  summary: string;
};

/** One step off the white card surface; solid hairlines, never dashed. */
const GRID = "#E9EBEE";
const AXIS_TEXT = "#6B7280";
const REFERENCE = "#9CA3AF";

/** Rank ticks at round steps from first place ("#1, #10, #20"), at most five. */
function rankTicks([first, last]: [number, number]): number[] {
  const span = Math.max(1, last - first);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 4) ?? Math.ceil(span / 4);
  const ticks = [first];
  for (let t = step; t <= last; t += step) if (t > first) ticks.push(t);
  return ticks;
}

/**
 * A single series across the season's days, drawn to the dataviz rules: a
 * 2 px line in the brand accent, a ringed end dot labelled with the latest
 * value, a solid hairline grid, and a crosshair tooltip that snaps to the
 * nearest day. One series needs no legend; the card's title names it. Every
 * value is also in the table behind "Show the numbers", so the tooltip never
 * gates one.
 */
export default function HistoryLineChart({ valueName, detailName, points, format, invert = false, domain, reference, summary }: Props) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const last = points.length - 1;

  const values = points.map((p) => p.value).concat(reference ? [reference.value] : []);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.12, invert ? 1 : 10);
  const yDomain: [number, number] = domain ?? [Math.max(0, Math.floor((lo - pad) / 10) * 10), Math.ceil((hi + pad) / 10) * 10];

  return (
    <Box>
      {/* An image to screen readers, named by the summary; the table below has every value. */}
      <Box component="figure" role="img" aria-label={summary} sx={{ m: 0, height: { xs: 200, sm: 240 } }}>
        {/* A 1 px starting size instead of -1 until the container is measured, so Recharts doesn't warn on first render. */}
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 1, height: 1 }}>
          <LineChart data={points} margin={{ top: 16, right: 44, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_TEXT }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} tickMargin={6} />
            <YAxis
              width={48}
              domain={yDomain}
              ticks={invert ? rankTicks(yDomain) : undefined}
              reversed={invert}
              allowDecimals={false}
              tickFormatter={(v: number) => format(v)}
              tick={{ fontSize: 11, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
            />
            {/* Labelled below the chart, where the line can never run over it. */}
            {reference && <ReferenceLine y={reference.value} stroke={REFERENCE} strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ stroke: "#9CA3AF", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as HistoryPoint;
                return (
                  <Box sx={{ bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: 1.5, px: 1.25, py: 0.75, boxShadow: "0 4px 14px rgba(17,24,39,0.10)" }}>
                    <Typography sx={{ fontWeight: 800, fontSize: "0.9375rem", lineHeight: 1.2 }}>{format(p.value)}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "nowrap" }}>
                      {p.label}{p.detail ? ` · ${detailName ? `${detailName}: ` : ""}${p.detail}` : ""}
                    </Typography>
                  </Box>
                );
              }}
            />
            <Line
              type="linear"
              dataKey="value"
              stroke={accent}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === last && props.cx !== undefined && props.cy !== undefined
                  ? <circle key={`dot-${props.index}`} cx={props.cx} cy={props.cy} r={4.5} fill={accent} stroke="#fff" strokeWidth={2} />
                  : <g key={`dot-${props.index}`} />}
              activeDot={{ r: 5, fill: accent, stroke: "#fff", strokeWidth: 2 }}
            >
              <LabelList
                dataKey="value"
                content={(props) => {
                  const { x, y, index, value } = props as { x?: number | string; y?: number | string; index?: number; value?: number | string };
                  if (index !== last || x === undefined || y === undefined) return null;
                  return (
                    <text x={Number(x) + 9} y={Number(y) + 4} fontSize={12} fontWeight={800} fill={theme.palette.text.primary}>
                      {format(Number(value))}
                    </text>
                  );
                }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </Box>
      {reference && (
        <Box aria-hidden sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, pl: "48px" }}>
          <Box sx={{ width: 18, borderTop: "2px dashed", borderColor: REFERENCE }} />
          <Typography variant="caption" sx={{ color: AXIS_TEXT, lineHeight: 1.3 }}>{reference.label}</Typography>
        </Box>
      )}
      <Button
        size="small"
        variant="text"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        aria-controls={showTable ? tableId : undefined}
        sx={{ textTransform: "none", fontWeight: 700, minHeight: 44, px: 1, ml: -1 }}
      >
        {showTable ? "Hide the numbers" : "Show the numbers"}
      </Button>
      {showTable && (
        <Box id={tableId} sx={{ overflowX: "auto" }}>
          <Box
            component="table"
            sx={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.8125rem",
              "& th, & td": { py: 0.5, px: 1, textAlign: "left", borderBottom: "1px solid", borderColor: "divider", whiteSpace: "nowrap" },
              "& th": { fontWeight: 700, color: "text.secondary" },
              "& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
            }}
          >
            <Box component="caption" sx={srOnly}>{summary}</Box>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col" className="num">{valueName}</th>
                {detailName && <th scope="col" className="num">{detailName}</th>}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td className="num">{format(p.value)}</td>
                  {detailName && <td className="num">{p.detail ?? "–"}</td>}
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
    </Box>
  );
}
