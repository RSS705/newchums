"use client";

import { useCallback, useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import Link from "next/link";
import MuiLink from "@mui/material/Link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from "recharts";
import { apiFetch } from "@/lib/apiClient";

// ── Types ────────────────────────────────────────────────────────────────────

type ObjectiveFunnelItem = { key: string; title: string; sequence: number; completedCount: number; completionRate: number };

type ObjectivesKPI = {
  totalUsers: number;
  engagedUsers: number;
  engagementRate: number;
  avgCompletionDepth: number;
  optedOut: number;
  funnel: ObjectiveFunnelItem[];
};

type TimePoint = { date: string; count: number };

type KPIData = {
  rangeDays: number;
  granularity: "day" | "week" | "month";
  growth: {
    totalUsers: number;
    dailySignups: TimePoint[];
    cumulativeUsers: TimePoint[];
    dailyPlans: TimePoint[];
  };
  participation: {
    totalUsers: number;
    participatedOne: number;
    participatedTwo: number;
    hostedOne: number;
    series: Array<{
      date: string;
      participatedOnePct: number | null;
      participatedTwoPct: number | null;
      hostedOnePct: number | null;
    }>;
  };
  activity: {
    totalUsers: number;
    active7d: number;
    active30d: number;
    series: Array<{
      date: string;
      active30dPct: number | null;
      active7dPct: number | null;
    }>;
  };
  planHealth: {
    completed: number;
    canceled: number;
    totalPast: number;
    totalAll: number;
    completionRate: number | null;
    cancellationRate: number | null;
    avgFillRate: number | null;
    fillRatePlanCount: number;
    series: Array<{
      date: string;
      completionPct: number | null;
      cancellationPct: number | null;
    }>;
  };
};

type RatioMetric = { numerator: number; denominator: number };

type GrowthLoopData = {
  firstPlanActivation: RatioMetric;
  repeatAttendance: RatioMetric;
  hostConversion: RatioMetric;
  hostedCompleted: RatioMetric;
  firstTimersPerPlan: { completedPlans: number; totalFirstTimers: number; avgPerPlan: number | null };
  hostsReachCompleted: RatioMetric;
  hostFollowThrough: RatioMetric;
  daysToSecond: { sampleSize: number; medianDays: number | null };
  planOpportunity: { upcomingPlans: number; activeUsers: number };
};

type FilterOptions = {
  cities: string[];
  interests: { id: string; name: string }[];
  communities: { id: string; name: string }[];
};

type FunnelData = {
  rangeDays: number;
  invitee: {
    verified: number;
    rsvpRecordedUsers: number;
  };
  host: {
    signups: number;
    firstPlans: number;
    plansReached3Rsvps: number;
    hostsReached3Rsvps: number;
    secondPlans: number;
  };
};

// ── Range options ────────────────────────────────────────────────────────────

type RangeKey = "30" | "90" | "180" | "365" | "0";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "180", label: "6m" },
  { key: "365", label: "1y" },
  { key: "0", label: "All" },
];

// ── Colors ──────────────────────────────────────────────────────────────────

const BRAND = "#E65B13";
const BRAND_LIGHT = "#F59E0B";
const GREY = "#6B7280";
const GREEN = "#16A34A";
const RED = "#DC2626";
const BLUE = "#2563EB";
const AMBER = "#D97706";

// ── Thresholds ──────────────────────────────────────────────────────────────

type Threshold = { below: number; watch: number };

const THRESHOLDS: Record<string, Threshold> = {
  firstPlanActivation: { below: 0.15, watch: 0.30 },
  repeatAttendance: { below: 0.20, watch: 0.35 },
  hostConversion: { below: 0.05, watch: 0.10 },
  hostedCompleted: { below: 0.03, watch: 0.07 },
  firstTimersPerPlan: { below: 0.5, watch: 1.0 },
  hostsReachCompleted: { below: 0.40, watch: 0.60 },
  hostFollowThrough: { below: 0.75, watch: 0.90 },
  daysToSecond: { below: 21, watch: 10 },
};

type MetricStatus = "below" | "watch" | "healthy";

function getStatus(key: string, value: number | null): MetricStatus {
  if (value == null) return "below";
  const t = THRESHOLDS[key];
  if (!t) return "below";
  if (key === "daysToSecond") {
    // Inverted: lower is better
    if (value > t.below) return "below";
    if (value > t.watch) return "watch";
    return "healthy";
  }
  if (value < t.below) return "below";
  if (value < t.watch) return "watch";
  return "healthy";
}

function statusColor(s: MetricStatus): string {
  if (s === "healthy") return GREEN;
  if (s === "watch") return AMBER;
  return RED;
}

function statusLabel(s: MetricStatus): string {
  if (s === "healthy") return "Healthy";
  if (s === "watch") return "Watch";
  return "Below";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, d: number): string {
  if (d === 0) return "-";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "-";
  return `${(v * 100).toFixed(1)}%`;
}

function shortDate(iso: string, granularity: "day" | "week" | "month"): string {
  try {
    const dateOnly = iso.slice(0, 10);
    const d = new Date(dateOnly + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    if (granularity === "month") {
      return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function granularityLabel(g: "day" | "week" | "month"): string {
  return g === "day" ? "daily" : g === "week" ? "weekly" : "monthly";
}

function rangeSummary(days: number, g: "day" | "week" | "month"): string {
  const window = days <= 30 ? "30 days" : days <= 90 ? "90 days" : days <= 180 ? "6 months" : days <= 365 ? "1 year" : `${Math.round(days / 30)} months`;
  return `Last ${window} · ${granularityLabel(g)} data points`;
}

function ratioValue(r: RatioMetric): number | null {
  if (r.denominator === 0) return null;
  return r.numerator / r.denominator;
}

// ── Reusable building blocks ─────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  );
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
      {children}
    </Typography>
  );
}

function StatCard({
  label,
  value,
  sub,
  tooltip,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tooltip?: string;
  color?: string;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2.5, borderRadius: 3, minWidth: 140, flex: "1 1 0" }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" fontWeight={600}>
          {label}
        </Typography>
        {tooltip && (
          <Tooltip title={tooltip} arrow placement="top">
            <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
          </Tooltip>
        )}
      </Stack>
      <Typography variant="h4" fontWeight={700} sx={{ color: color || "text.primary", lineHeight: 1.2 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      )}
    </Paper>
  );
}

function MiniChart({
  title,
  subtitle,
  data,
  granularity,
  type = "bar",
  color = BRAND,
}: {
  title: string;
  subtitle: string;
  data: TimePoint[];
  granularity: "day" | "week" | "month";
  type?: "bar" | "line";
  color?: string;
}) {
  const formatted = data.map((d) => ({ ...d, label: shortDate(d.date, granularity) }));
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Tooltip title={subtitle} arrow placement="top">
          <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>
      </Stack>
      <Box sx={{ width: "100%", height: 220, mt: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "line" ? (
            <LineChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickMargin={4} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <RechartsTooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          ) : (
            <BarChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickMargin={4} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <RechartsTooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
              <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

function PctChart({
  title,
  subtitle,
  data,
  granularity,
  dataKey = "value",
  color = BRAND,
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, unknown>>;
  granularity: "day" | "week" | "month";
  dataKey?: string;
  color?: string;
}) {
  const formatted = data.map((d) => ({
    ...d,
    label: shortDate(String(d.date ?? ""), granularity),
    [dataKey]: d[dataKey] != null ? Math.round(Number(d[dataKey]) * 1000) / 10 : null,
  }));
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Tooltip title={subtitle} arrow placement="top">
          <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>
      </Stack>
      <Box sx={{ width: "100%", height: 220, mt: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={formatted} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" tickMargin={4} />
            <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} allowDecimals={false} />
            <RechartsTooltip
              contentStyle={{ fontSize: 13, borderRadius: 8 }}
              formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, ""]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

// ── Growth loop metric card ─────────────────────────────────────────────────

function LoopMetricCard({
  title,
  definition,
  value,
  displayValue,
  sub,
  status,
  thresholdKey,
  isInverted,
  unit,
}: {
  title: string;
  definition: string;
  value: number | null;
  displayValue: string;
  sub: string;
  status: MetricStatus;
  thresholdKey: string;
  isInverted?: boolean;
  unit?: string;
}) {
  const t = THRESHOLDS[thresholdKey];
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, height: "100%" }}>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
        <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
          {title}
        </Typography>
        <Tooltip title={definition} arrow placement="top" enterTouchDelay={0}>
          <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
        </Tooltip>
      </Stack>

      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: statusColor(status), lineHeight: 1.2 }}>
          {displayValue}
        </Typography>
        <Chip
          label={statusLabel(status)}
          size="small"
          sx={{
            bgcolor: `${statusColor(status)}14`,
            color: statusColor(status),
            fontWeight: 700,
            fontSize: "0.6875rem",
            height: 22,
          }}
        />
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        {sub}
      </Typography>

      {/* Threshold bar */}
      {t && value != null && (
        <Box sx={{ position: "relative", height: 6, borderRadius: 3, overflow: "hidden", bgcolor: "grey.200" }}>
          {/* Below zone */}
          <Box sx={{ position: "absolute", left: 0, width: `${isInverted ? (1 - t.below / (t.below * 1.5)) * 100 : (t.below / (t.watch * 1.5)) * 100}%`, height: "100%", bgcolor: `${RED}30` }} />
          {/* Watch zone */}
          <Box sx={{
            position: "absolute",
            left: `${isInverted ? (1 - t.below / (t.below * 1.5)) * 100 : (t.below / (t.watch * 1.5)) * 100}%`,
            width: `${isInverted ? ((t.below - t.watch) / (t.below * 1.5)) * 100 : ((t.watch - t.below) / (t.watch * 1.5)) * 100}%`,
            height: "100%",
            bgcolor: `${AMBER}30`,
          }} />
          {/* Healthy zone */}
          <Box sx={{
            position: "absolute",
            right: 0,
            width: `${isInverted ? (t.watch / (t.below * 1.5)) * 100 : (1 - t.watch / (t.watch * 1.5)) * 100}%`,
            height: "100%",
            bgcolor: `${GREEN}30`,
          }} />
        </Box>
      )}

      {/* Threshold labels */}
      {t && (
        <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: "block", fontSize: "0.625rem" }}>
          {isInverted
            ? `Healthy: <${t.watch}${unit ?? ""} | Watch: ${t.watch}${unit ?? ""}-${t.below}${unit ?? ""} | Below: >${t.below}${unit ?? ""}`
            : `Below: <${unit === "x" ? t.below : `${Math.round(t.below * 100)}%`} | Watch: ${unit === "x" ? `${t.below}-${t.watch}` : `${Math.round(t.below * 100)}%-${Math.round(t.watch * 100)}%`} | Healthy: >${unit === "x" ? t.watch : `${Math.round(t.watch * 100)}%`}`
          }
        </Typography>
      )}
    </Paper>
  );
}

// ── Composite loop status ───────────────────────────────────────────────────

type LoopStatus = "below_replacement" | "fragile" | "promising" | "strong";

function computeLoopStatus(data: GrowthLoopData): { status: LoopStatus; score: number; max: number } {
  const metrics: { key: string; value: number | null }[] = [
    { key: "firstPlanActivation", value: ratioValue(data.firstPlanActivation) },
    { key: "repeatAttendance", value: ratioValue(data.repeatAttendance) },
    { key: "hostConversion", value: ratioValue(data.hostConversion) },
    { key: "firstTimersPerPlan", value: data.firstTimersPerPlan.avgPerPlan },
    { key: "hostsReachCompleted", value: ratioValue(data.hostsReachCompleted) },
    { key: "hostFollowThrough", value: ratioValue(data.hostFollowThrough) },
    { key: "daysToSecond", value: data.daysToSecond.medianDays },
  ];

  let score = 0;
  for (const m of metrics) {
    const s = getStatus(m.key, m.value);
    if (s === "watch") score += 1;
    if (s === "healthy") score += 2;
  }

  const max = metrics.length * 2;
  let status: LoopStatus = "below_replacement";
  if (score >= 11) status = "strong";
  else if (score >= 8) status = "promising";
  else if (score >= 5) status = "fragile";

  return { status, score, max };
}

const LOOP_STATUS_CONFIG: Record<LoopStatus, { label: string; color: string; bg: string }> = {
  below_replacement: { label: "Below replacement", color: RED, bg: "#FEF2F2" },
  fragile: { label: "Fragile", color: AMBER, bg: "#FFFBEB" },
  promising: { label: "Promising", color: BLUE, bg: "#EFF6FF" },
  strong: { label: "Strong", color: GREEN, bg: "#F0FDF4" },
};

// ── Existing definitions panel ──────────────────────────────────────────────

const DEFINITIONS: Array<{ term: string; def: string }> = [
  { term: "Total Registered Accounts", def: "Total user accounts in the system, shown cumulatively over time." },
  { term: "New Accounts / Day", def: "Number of user accounts created per time bucket (day, week, or month depending on range)." },
  { term: "Plans Created / Day", def: "Number of plans (published or later canceled) created per time bucket. Excludes drafts." },
  { term: "Participated in 1+ plan", def: "Users who hosted at least one plan OR RSVP'd 'going' to at least one plan (published or canceled). This is the broadest engagement metric." },
  { term: "Participated in 2+ plans", def: "Subset of the above: users whose distinct plan count (hosting + going RSVPs) is two or more. Indicates repeat engagement." },
  { term: "Hosted 1+ plan", def: "Users who are the host of at least one published or canceled plan. A core product assumption is ~10% of users may eventually host." },
  { term: "Active (7d / 30d)", def: "Users who made at least one authenticated API request within the trailing 7 or 30 days. Tracked via last_active_at, updated at most once per hour. Early proxy for retention." },
  { term: "Activity log", def: "Per-request log of authenticated API requests (who, when, method, path, status). Retained for 90 days; opens from the Return behavior section. Each user's recent requests also appear in their User Diagnostics view." },
  { term: "MAU", def: "Monthly Active Users = Active Users in last 30 days (same definition)." },
  { term: "Plan Completion Rate", def: "Past-start-time published plans that were not canceled, divided by all past-start-time published+canceled plans. Measures how often plans actually happen." },
  { term: "Cancellation Rate", def: "Canceled plans divided by all published+canceled plans (including future). Shows cancellation prevalence." },
  { term: "Avg Fill Rate", def: "For past plans with a seat cap (max_seats > 0): average of (going RSVPs / max_seats), capped at 100% per plan. Excludes uncapped plans." },
];

function DefinitionsPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
        onClick={() => setOpen((o) => !o)}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <InfoOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Metric definitions
          </Typography>
        </Stack>
        <IconButton size="small" aria-label={open ? "collapse" : "expand"}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Divider />
        <Box sx={{ px: 2.5, py: 2 }}>
          {DEFINITIONS.map((d) => (
            <Box key={d.term} sx={{ mb: 1.5, "&:last-child": { mb: 0 } }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 0.15 }}>
                {d.term}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
                {d.def}
              </Typography>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Funnel section (first-party product events) ─────────────────────────────

type FunnelRangeKey = "7" | "30" | "0";

const FUNNEL_RANGES: Array<{ key: FunnelRangeKey; label: string }> = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "0", label: "All" },
];

type FunnelRow = {
  label: string;
  tooltip: string;
  /** null = the step only exists in GA (client-side event). */
  count: number | null;
  sub?: string;
  conversion?: string;
};

function FunnelTable({ title, subtitle, rows }: { title: string; subtitle: string; rows: FunnelRow[] }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Box sx={{ px: 2.5, py: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>
      <Divider />
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Step</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Count</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Conversion</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <span>{r.label}</span>
                    <Tooltip title={r.tooltip} arrow placement="top" enterTouchDelay={0}>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }} />
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  {r.count == null ? (
                    <Tooltip title="Client-only step. GA is the source for this count; no first-party mirror exists." arrow placement="top" enterTouchDelay={0}>
                      <Chip label="see GA" size="small" variant="outlined" sx={{ fontSize: "0.6875rem", height: 20 }} />
                    </Tooltip>
                  ) : (
                    <>
                      <Typography component="span" variant="body2" fontWeight={700}>
                        {r.count.toLocaleString()}
                      </Typography>
                      {r.sub && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                          {r.sub}
                        </Typography>
                      )}
                    </>
                  )}
                </TableCell>
                <TableCell align="right">{r.conversion ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

function FunnelSection() {
  const [funnelRange, setFunnelRange] = useState<FunnelRangeKey>("30");
  // Single async-set result keyed by the range it answered; loading and error
  // are derived, so the effect body never calls setState synchronously.
  const [funnelResult, setFunnelResult] = useState<
    { range: FunnelRangeKey; data?: FunnelData; error?: string } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/admin/kpis/funnel?days=${funnelRange}`, { auth: true })
      .then((r) => r.json())
      .then((json: { ok: boolean; data?: FunnelData }) => {
        if (cancelled) return;
        if (!json.ok || !json.data) throw new Error("Failed to load funnel data");
        setFunnelResult({ range: funnelRange, data: json.data });
      })
      .catch((err) => {
        if (cancelled) return;
        setFunnelResult({
          range: funnelRange,
          error: err instanceof Error ? err.message : "Failed to load funnel data",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [funnelRange]);

  const funnelLoading = funnelResult === null || funnelResult.range !== funnelRange;
  const funnelError = funnelLoading ? null : funnelResult?.error ?? null;
  const funnel = funnelLoading ? null : funnelResult?.data ?? null;

  const inviteeRows: FunnelRow[] = funnel
    ? [
        {
          label: "Form started",
          tooltip: "First focus on the plan-signup card's email field (GA event rsvp_form_started). Fires once per visit to the card.",
          count: null,
        },
        {
          label: "Form submitted",
          tooltip: "Plan-signup request accepted by the server (GA event rsvp_form_submitted, result pending or existing_account).",
          count: null,
        },
        {
          label: "Verified account",
          tooltip: "Plan-signup magic-link verification completed (first-party event rsvp_verified). Once per user. No conversion shown because the previous step is GA-only.",
          count: funnel.invitee.verified,
        },
        {
          label: "RSVP recorded",
          tooltip: "People who entered via plan signup and went on to RSVP to a plan (first-party event rsvp_recorded, counted as distinct users). Conversion is against verified accounts.",
          count: funnel.invitee.rsvpRecordedUsers,
          conversion: pct(funnel.invitee.rsvpRecordedUsers, funnel.invitee.verified),
        },
      ]
    : [];

  const hostRows: FunnelRow[] = funnel
    ? [
        {
          label: "Signups (verified)",
          tooltip: "Users who completed verification on any signup path: email+password, Google, or plan signup (first-party event signup_completed). Once per user.",
          count: funnel.host.signups,
        },
        {
          label: "First plan created",
          tooltip: "Hosts creating their first plan (first-party event first_plan_created; QA plans excluded). Conversion is against signups in the window.",
          count: funnel.host.firstPlans,
          conversion: pct(funnel.host.firstPlans, funnel.host.signups),
        },
        {
          label: "Plan reached 3+ RSVPs",
          tooltip: "Plans that gained a third non-host going RSVP (first-party event plan_reached_3_rsvps, once per plan). Count is plans; conversion is distinct hosts with such a plan against first-plan hosts.",
          count: funnel.host.plansReached3Rsvps,
          sub: `(${funnel.host.hostsReached3Rsvps.toLocaleString()} ${funnel.host.hostsReached3Rsvps === 1 ? "host" : "hosts"})`,
          conversion: pct(funnel.host.hostsReached3Rsvps, funnel.host.firstPlans),
        },
        {
          label: "Second plan created",
          tooltip: "Hosts creating their second plan, the real retention signal (first-party event second_plan_created). Conversion is against first-plan hosts, not the 3+ RSVP step.",
          count: funnel.host.secondPlans,
          conversion: pct(funnel.host.secondPlans, funnel.host.firstPlans),
        },
      ]
    : [];

  return (
    <>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 0.5 }}
      >
        <Typography variant="h6" fontWeight={700}>
          Funnel
        </Typography>
        <ToggleButtonGroup
          value={funnelRange}
          exclusive
          onChange={(_, v) => { if (v) setFunnelRange(v as FunnelRangeKey); }}
          size="small"
          sx={{
            "& .MuiToggleButton-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              px: 1.5,
              py: 0.5,
            },
            "& .Mui-selected": {
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
            },
          }}
        >
          {FUNNEL_RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key} disabled={funnelLoading}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      <SectionSubtitle>
        Counts at each step of the invitee and host loops, from the first-party
        product_events mirror (server-detectable steps only). Client-only steps
        are marked &ldquo;see GA&rdquo;: GA runs in production only and ad blockers eat a
        share of it, so treat those numbers as directional.
      </SectionSubtitle>

      {funnelLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!funnelLoading && funnelError && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
          <Typography color="error" variant="body2">{funnelError}</Typography>
        </Paper>
      )}

      {!funnelLoading && !funnelError && funnel && (
        <Grid container spacing={2} sx={{ mb: 5 }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <FunnelTable
              title="Invitee loop"
              subtitle="Share or invite link to a recorded RSVP."
              rows={inviteeRows}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FunnelTable
              title="Host loop"
              subtitle="Signup to a repeat plan. Second plans are the retention signal."
              rows={hostRows}
            />
          </Grid>
        </Grid>
      )}
    </>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminKPIsClient() {
  // Existing KPI state
  const [data, setData] = useState<KPIData | null>(null);
  const [objKpi, setObjKpi] = useState<ObjectivesKPI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("90");

  // Growth loop state
  const [loopData, setLoopData] = useState<GrowthLoopData | null>(null);
  const [loopLoading, setLoopLoading] = useState(true);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [filterCity, setFilterCity] = useState<string | null>(null);
  const [filterInterest, setFilterInterest] = useState<string>("");
  const [filterCommunity, setFilterCommunity] = useState<string>("");

  const fetchKpis = useCallback(async (days: RangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const [kpiRes, objRes] = await Promise.all([
        apiFetch(`/admin/kpis?days=${days}`, { auth: true }),
        apiFetch("/admin/objectives/kpi", { auth: true }),
      ]);
      if (!kpiRes.ok) throw new Error("Failed to load KPIs");
      const json = (await kpiRes.json()) as { ok: boolean; data: KPIData };
      if (!json.ok) throw new Error("Failed to load KPIs");
      setData(json.data);

      if (objRes.ok) {
        const objJson = (await objRes.json()) as { ok: boolean; kpi: ObjectivesKPI };
        if (objJson.ok) setObjKpi(objJson.kpi);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
    setLoading(false);
  }, []);

  const fetchLoopData = useCallback(async () => {
    setLoopLoading(true);
    setLoopError(null);
    try {
      const params = new URLSearchParams();
      if (filterCity) params.set("city", filterCity);
      if (filterInterest) params.set("interestId", filterInterest);
      if (filterCommunity) params.set("communityId", filterCommunity);
      const qs = params.toString();
      const res = await apiFetch(`/admin/kpis/growth-loop${qs ? `?${qs}` : ""}`, { auth: true });
      if (!res.ok) throw new Error("Failed to load growth loop data");
      const json = (await res.json()) as { ok: boolean; data: GrowthLoopData };
      if (!json.ok) throw new Error("Failed to load growth loop data");
      setLoopData(json.data);
    } catch (err) {
      setLoopError(err instanceof Error ? err.message : "Unknown error");
    }
    setLoopLoading(false);
  }, [filterCity, filterInterest, filterCommunity]);

  useEffect(() => {
    // Load filters on mount
    apiFetch("/admin/kpis/growth-loop/filters", { auth: true })
      .then((r) => r.json())
      .then((json: { ok?: boolean } & FilterOptions) => {
        if (json.ok) setFilters(json as unknown as FilterOptions);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { fetchKpis(range); }, [fetchKpis, range]);
  useEffect(() => { fetchLoopData(); }, [fetchLoopData]);

  const granularity = data?.granularity ?? "day";
  const bucketLabel = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";

  const loopStatus = loopData ? computeLoopStatus(loopData) : null;

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", py: { xs: 2, sm: 3 } }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Growth Dashboard
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Local growth loop metrics and system-wide KPIs for NewChums.
      </Typography>

      {/* ═══════════════ Growth Loop Section ═══════════════ */}

      {/* North-star banner */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3 },
          borderRadius: 3,
          mb: 3,
          bgcolor: "#FFF7ED",
          borderColor: "#FDBA7440",
        }}
      >
        <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1, color: BRAND }}>
          Can one local niche in one city become self-sustaining with modest seeding?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 1.5 }}>
          This dashboard tracks the core assumptions behind NewChums&apos; local propagation model.
          The loop: people encounter a real plan &#8594; some attend &#8594; some attend again &#8594; some become hosts &#8594; completed plans bring in first-time attendees &#8594; enough local activity appears quickly enough to keep the loop alive.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Use the filters below to evaluate a specific city, interest, or community wedge. All metrics are all-time within the filtered scope.
        </Typography>
      </Paper>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Typography variant="body2" fontWeight={700} sx={{ mb: 1.5 }}>
          Wedge filters
        </Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Autocomplete
            freeSolo
            options={filters?.cities ?? []}
            value={filterCity ?? ""}
            onChange={(_, v) => setFilterCity(typeof v === "string" && v.trim() ? v.trim() : null)}
            onInputChange={(_, v) => {
              if (!v.trim()) setFilterCity(null);
            }}
            renderInput={(params) => (
              <TextField {...params} label="City" placeholder="e.g. London, ON" size="small" sx={{ minWidth: 200 }} />
            )}
            sx={{ flex: 1 }}
          />
          <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
            <Select
              displayEmpty
              value={filterInterest}
              onChange={(e) => setFilterInterest(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">All interests</MenuItem>
              {(filters?.interests ?? []).map((i) => (
                <MenuItem key={i.id} value={i.id}>{i.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1, minWidth: 180 }}>
            <Select
              displayEmpty
              value={filterCommunity}
              onChange={(e) => setFilterCommunity(e.target.value)}
              sx={{ borderRadius: 2 }}
            >
              <MenuItem value="">All communities</MenuItem>
              {(filters?.communities ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Loop status */}
      {loopLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {!loopLoading && loopError && (
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mb: 3 }}>
          <Typography color="error" variant="body2">{loopError}</Typography>
        </Paper>
      )}

      {!loopLoading && loopData && loopStatus && (() => {
        const cfg = LOOP_STATUS_CONFIG[loopStatus.status];
        return (
          <>
            {/* Status summary */}
            <Paper
              variant="outlined"
              sx={{
                p: 2.5,
                borderRadius: 3,
                mb: 3,
                bgcolor: cfg.bg,
                borderColor: `${cfg.color}30`,
              }}
            >
              <Stack direction="row" alignItems="center" spacing={2}>
                <Box sx={{ width: 48, height: 48, borderRadius: "50%", bgcolor: `${cfg.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Typography fontWeight={800} sx={{ color: cfg.color, fontSize: "1.125rem" }}>
                    {loopStatus.score}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: cfg.color }}>
                    Local loop: {cfg.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                    Composite score {loopStatus.score}/{loopStatus.max}. Each of 7 metrics scores 0 (below), 1 (watch), or 2 (healthy).
                    {filterCity ? ` Filtered to: ${filterCity}.` : " Showing all data."}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {/* Metric cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="First-plan activation"
                  definition="Of users who received an invite to a filtered plan, how many attended at least one completed plan? Measures invite-to-first-attendance conversion."
                  value={ratioValue(loopData.firstPlanActivation)}
                  displayValue={pct(loopData.firstPlanActivation.numerator, loopData.firstPlanActivation.denominator)}
                  sub={`${loopData.firstPlanActivation.numerator} of ${loopData.firstPlanActivation.denominator} invited users`}
                  status={getStatus("firstPlanActivation", ratioValue(loopData.firstPlanActivation))}
                  thresholdKey="firstPlanActivation"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Repeat attendance (30d)"
                  definition="Of first-time attendees (with 30+ days of history), how many attended a second plan within 30 days of their first?"
                  value={ratioValue(loopData.repeatAttendance)}
                  displayValue={pct(loopData.repeatAttendance.numerator, loopData.repeatAttendance.denominator)}
                  sub={`${loopData.repeatAttendance.numerator} of ${loopData.repeatAttendance.denominator} first-time attendees`}
                  status={getStatus("repeatAttendance", ratioValue(loopData.repeatAttendance))}
                  thresholdKey="repeatAttendance"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Host conversion (30d)"
                  definition="Of first-time attendees, how many hosted any plan within 30 days of their first attendance?"
                  value={ratioValue(loopData.hostConversion)}
                  displayValue={pct(loopData.hostConversion.numerator, loopData.hostConversion.denominator)}
                  sub={`${loopData.hostConversion.numerator} of ${loopData.hostConversion.denominator} first-time attendees`}
                  status={getStatus("hostConversion", ratioValue(loopData.hostConversion))}
                  thresholdKey="hostConversion"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Hosted a completed plan (45d)"
                  definition="Of first-time attendees, how many hosted a plan that actually completed within 45 days of first attendance?"
                  value={ratioValue(loopData.hostedCompleted)}
                  displayValue={pct(loopData.hostedCompleted.numerator, loopData.hostedCompleted.denominator)}
                  sub={`${loopData.hostedCompleted.numerator} of ${loopData.hostedCompleted.denominator} first-time attendees`}
                  status={getStatus("hostedCompleted", ratioValue(loopData.hostedCompleted))}
                  thresholdKey="hostedCompleted"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="First-timers per completed plan"
                  definition="Average number of first-time attendees generated by each completed plan in the filtered set."
                  value={loopData.firstTimersPerPlan.avgPerPlan}
                  displayValue={loopData.firstTimersPerPlan.avgPerPlan != null ? loopData.firstTimersPerPlan.avgPerPlan.toFixed(1) : "-"}
                  sub={`${loopData.firstTimersPerPlan.totalFirstTimers} first-timers across ${loopData.firstTimersPerPlan.completedPlans} plans`}
                  status={getStatus("firstTimersPerPlan", loopData.firstTimersPerPlan.avgPerPlan)}
                  thresholdKey="firstTimersPerPlan"
                  unit="x"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Hosts who reach a completed plan"
                  definition="Of users who hosted at least one plan in the filtered set, how many have at least one completed (non-canceled, past start time) hosted plan?"
                  value={ratioValue(loopData.hostsReachCompleted)}
                  displayValue={pct(loopData.hostsReachCompleted.numerator, loopData.hostsReachCompleted.denominator)}
                  sub={`${loopData.hostsReachCompleted.numerator} of ${loopData.hostsReachCompleted.denominator} hosts`}
                  status={getStatus("hostsReachCompleted", ratioValue(loopData.hostsReachCompleted))}
                  thresholdKey="hostsReachCompleted"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Host follow-through"
                  definition="Of hosted plans where at least one non-host attendee committed (Going), how often did the plan still go ahead? Excludes auto-canceled no-attendee plans."
                  value={ratioValue(loopData.hostFollowThrough)}
                  displayValue={pct(loopData.hostFollowThrough.numerator, loopData.hostFollowThrough.denominator)}
                  sub={`${loopData.hostFollowThrough.numerator} of ${loopData.hostFollowThrough.denominator} plans with committed attendees`}
                  status={getStatus("hostFollowThrough", ratioValue(loopData.hostFollowThrough))}
                  thresholdKey="hostFollowThrough"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <LoopMetricCard
                  title="Days to second plan (median)"
                  definition="Median number of days between a user's first and second attended plan in the filtered set. Lower is better."
                  value={loopData.daysToSecond.medianDays}
                  displayValue={loopData.daysToSecond.medianDays != null ? `${loopData.daysToSecond.medianDays}d` : "-"}
                  sub={`Based on ${loopData.daysToSecond.sampleSize} users who attended 2+ plans`}
                  status={getStatus("daysToSecond", loopData.daysToSecond.medianDays)}
                  thresholdKey="daysToSecond"
                  isInverted
                  unit="d"
                />
              </Grid>
            </Grid>

            {/* Proxy metric: plan opportunity */}
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3, mb: 5, bgcolor: "grey.50" }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={700}>
                  Relevant plan opportunity (7d)
                </Typography>
                <Tooltip title="Proxy metric: counts upcoming published plans in the next 7 days matching current filters, and active users (30d). The full version would need per-user hobby+distance matching." arrow placement="top">
                  <InfoOutlinedIcon sx={{ fontSize: 15, color: "text.disabled", cursor: "help" }} />
                </Tooltip>
                <Chip label="Proxy" size="small" variant="outlined" sx={{ fontSize: "0.625rem", height: 18, ml: 0.5 }} />
              </Stack>
              <Stack direction="row" spacing={4}>
                <Box>
                  <Typography variant="h5" fontWeight={700}>{loopData.planOpportunity.upcomingPlans}</Typography>
                  <Typography variant="caption" color="text.secondary">upcoming plans (7d)</Typography>
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={700}>{loopData.planOpportunity.activeUsers}</Typography>
                  <Typography variant="caption" color="text.secondary">active users (30d)</Typography>
                </Box>
              </Stack>
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
                Target: 60%+ of active users should have a relevant local plan available. Full implementation requires per-user hobby and distance matching.
              </Typography>
            </Paper>
          </>
        );
      })()}

      {/* ═══════════════ Funnel (first-party product events) ═══════════════ */}

      <FunnelSection />

      <Divider sx={{ mb: 4 }} />

      {/* ═══════════════ Existing System KPIs ═══════════════ */}

      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 0.5 }}
      >
        <Typography variant="h6" fontWeight={700}>
          System KPIs
        </Typography>
        <ToggleButtonGroup
          value={range}
          exclusive
          onChange={(_, v) => { if (v) setRange(v as RangeKey); }}
          size="small"
          sx={{
            flexWrap: "wrap",
            "& .MuiToggleButton-root": {
              textTransform: "none",
              fontWeight: 600,
              fontSize: "0.8125rem",
              px: 1.5,
              py: 0.5,
            },
            "& .Mui-selected": {
              bgcolor: "primary.main",
              color: "primary.contrastText",
              "&:hover": { bgcolor: "primary.dark" },
            },
          }}
        >
          {RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key} disabled={loading}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {data ? rangeSummary(data.rangeDays, granularity) : "Loading..."}
      </Typography>

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 12 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && (error || !data) && (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <Typography color="error">{error || "Failed to load KPI data"}</Typography>
        </Box>
      )}

      {!loading && data && (() => {
        const { growth, participation, activity, planHealth } = data;

        return (
          <>
            {/* ── Definitions ── */}
            <Box sx={{ mb: 4 }}>
              <DefinitionsPanel />
            </Box>

            {/* ── 1. Growth ── */}
            <SectionTitle>Growth</SectionTitle>
            <SectionSubtitle>User and plan creation trends over time.</SectionSubtitle>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }}>
              <StatCard
                label="Total accounts"
                value={growth.totalUsers.toLocaleString()}
                tooltip="Total registered user accounts in the system right now."
              />
              <StatCard
                label={`Signups (period)`}
                value={growth.dailySignups.reduce((s, d) => s + d.count, 0).toLocaleString()}
                tooltip={`New accounts created in the selected range.`}
              />
              <StatCard
                label={`Plans created (period)`}
                value={growth.dailyPlans.reduce((s, d) => s + d.count, 0).toLocaleString()}
                tooltip={`Published or canceled plans created in the selected range (excludes drafts).`}
              />
            </Stack>

            <Grid container spacing={2} sx={{ mb: 5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <MiniChart
                  title="Total accounts"
                  subtitle="Cumulative registered accounts over the selected range."
                  data={growth.cumulativeUsers}
                  granularity={granularity}
                  type="line"
                  color={BRAND}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <MiniChart
                  title={`New accounts / ${bucketLabel}`}
                  subtitle={`User accounts created per ${bucketLabel}.`}
                  data={growth.dailySignups}
                  granularity={granularity}
                  color={BRAND}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <MiniChart
                  title={`Plans created / ${bucketLabel}`}
                  subtitle={`Plans (published or canceled) created per ${bucketLabel}. Excludes drafts.`}
                  data={growth.dailyPlans}
                  granularity={granularity}
                  color={BRAND_LIGHT}
                />
              </Grid>
            </Grid>

            {/* ── 2. Participation ── */}
            <SectionTitle>Participation</SectionTitle>
            <SectionSubtitle>
              How many users are engaging with plans. &ldquo;Participated&rdquo; = hosted or
              RSVP&rsquo;d &ldquo;going&rdquo; to at least one published/canceled plan.
            </SectionSubtitle>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap">
              <StatCard
                label="Participated in 1+ plan"
                value={pct(participation.participatedOne, participation.totalUsers)}
                sub={`${participation.participatedOne.toLocaleString()} of ${participation.totalUsers.toLocaleString()} users`}
                tooltip="Users who hosted OR RSVP'd going to at least one plan."
                color={BRAND}
              />
              <StatCard
                label="Participated in 2+ plans"
                value={pct(participation.participatedTwo, participation.participatedOne)}
                sub={`${participation.participatedTwo.toLocaleString()} of ${participation.participatedOne.toLocaleString()} participants`}
                tooltip="Of users who participated at least once, how many did so twice or more."
                color={BRAND}
              />
              <StatCard
                label="Hosted 1+ plan"
                value={pct(participation.hostedOne, participation.totalUsers)}
                sub={`${participation.hostedOne.toLocaleString()} of ${participation.totalUsers.toLocaleString()} users`}
                tooltip="Users who created and hosted at least one plan. Target benchmark: ~10% of users."
                color={GREEN}
              />
            </Stack>

            <Grid container spacing={2} sx={{ mb: 5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Participated in 1+ plan"
                  subtitle="% of all users who hosted or RSVP'd going to at least one plan."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="participatedOnePct"
                  color={BRAND}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Participated in 2+ plans"
                  subtitle="% of single-plan participants who engaged with two or more plans."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="participatedTwoPct"
                  color={BRAND_LIGHT}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Hosted 1+ plan"
                  subtitle="% of all users who hosted at least one plan."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="hostedOnePct"
                  color={GREEN}
                />
              </Grid>
            </Grid>

            {/* ── 3. Return behavior ── */}
            <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 0.5 }}>
              <Typography variant="h6" fontWeight={700}>
                Return behavior
              </Typography>
              <MuiLink
                component={Link}
                href="/admin/kpis/activity"
                underline="hover"
                variant="body2"
                sx={{
                  fontWeight: 600,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0.5,
                }}
              >
                Activity log
                <ArrowForwardRoundedIcon sx={{ fontSize: 15 }} />
              </MuiLink>
            </Stack>
            <SectionSubtitle>
              Users who made at least one authenticated API request in the given window.
              Tracked via <code style={{ fontSize: "0.85em" }}>last_active_at</code>, updated
              at most once per hour. Open the activity log to see who is active, when, and
              which parts of the app they touch, request by request.
            </SectionSubtitle>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap">
              <StatCard
                label="MAU (30 days)"
                value={pct(activity.active30d, activity.totalUsers)}
                sub={`${activity.active30d.toLocaleString()} of ${activity.totalUsers.toLocaleString()} users`}
                tooltip="Monthly Active Users: unique users with at least one authenticated request in the last 30 days."
                color={BRAND}
              />
              <StatCard
                label="Active (7 days)"
                value={pct(activity.active7d, activity.totalUsers)}
                sub={`${activity.active7d.toLocaleString()} of ${activity.totalUsers.toLocaleString()} users`}
                tooltip="Unique users with at least one authenticated request in the last 7 days."
                color={BLUE}
              />
              <StatCard
                label="Total users"
                value={activity.totalUsers.toLocaleString()}
                tooltip="Total registered accounts for reference."
                color={GREY}
              />
            </Stack>

            <Grid container spacing={2} sx={{ mb: 5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="MAU % (30-day rolling)"
                  subtitle="% of all users active in the trailing 30 days."
                  data={activity.series}
                  granularity={granularity}
                  dataKey="active30dPct"
                  color={BRAND}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Active % (7-day rolling)"
                  subtitle="% of all users active in the trailing 7 days."
                  data={activity.series}
                  granularity={granularity}
                  dataKey="active7dPct"
                  color={BLUE}
                />
              </Grid>
            </Grid>

            {/* ── 4. Plan health ── */}
            <SectionTitle>Plan health</SectionTitle>
            <SectionSubtitle>
              Completion, cancellation, and fill metrics for plans that have been
              published. Completion and fill rates only consider plans whose start
              time has passed.
            </SectionSubtitle>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap">
              <StatCard
                label="Completion rate"
                value={planHealth.completionRate != null ? pct(planHealth.completed, planHealth.totalPast) : "-"}
                sub={`${planHealth.completed} completed of ${planHealth.totalPast} past plans`}
                tooltip="Past-start-time published plans that were not canceled / all past published+canceled plans."
                color={GREEN}
              />
              <StatCard
                label="Cancellation rate"
                value={planHealth.cancellationRate != null ? pct(planHealth.canceled, planHealth.totalAll) : "-"}
                sub={`${planHealth.canceled} canceled of ${planHealth.totalAll} total plans`}
                tooltip="Canceled plans / all published+canceled plans (including future)."
                color={RED}
              />
              <StatCard
                label="Avg fill rate"
                value={planHealth.avgFillRate != null ? fmtPct(planHealth.avgFillRate) : "-"}
                sub={
                  planHealth.fillRatePlanCount > 0
                    ? `Across ${planHealth.fillRatePlanCount} capped past plans`
                    : "No capped past plans yet"
                }
                tooltip="Average of (going RSVPs / max seats) for past plans with a seat cap. Uncapped plans are excluded."
                color={BRAND}
              />
            </Stack>

            <Grid container spacing={2} sx={{ mb: 1.5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Completion rate"
                  subtitle="Cumulative completion rate of past plans."
                  data={planHealth.series}
                  granularity={granularity}
                  dataKey="completionPct"
                  color={GREEN}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Cancellation rate"
                  subtitle="Cumulative cancellation rate of all plans."
                  data={planHealth.series}
                  granularity={granularity}
                  dataKey="cancellationPct"
                  color={RED}
                />
              </Grid>
            </Grid>

            {planHealth.fillRatePlanCount === 0 && (
              <Paper
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover", mb: 2 }}
              >
                <Typography variant="body2" color="text.secondary">
                  <strong>Avg fill rate</strong> is only computed for past plans that have a
                  seat cap (max_seats &gt; 0). There are currently no qualifying plans, so
                  this metric is omitted until capped plans reach their start time.
                </Typography>
              </Paper>
            )}

            {/* ── 5. Objectives / Nudge ── */}
            {objKpi && (
              <>
                <SectionTitle>Objectives &amp; onboarding</SectionTitle>
                <SectionSubtitle>
                  How users are progressing through the next-best-step tutorial system.
                </SectionSubtitle>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2.5 }} flexWrap="wrap">
                  <StatCard
                    label="Engagement rate"
                    value={`${objKpi.engagementRate}%`}
                    sub={`${objKpi.engagedUsers} of ${objKpi.totalUsers} users completed 1+ objective`}
                    tooltip="Percentage of all users who have completed at least one objective."
                    color={BRAND}
                  />
                  <StatCard
                    label="Avg completion depth"
                    value={String(objKpi.avgCompletionDepth)}
                    sub={`of ${objKpi.funnel.length} total objectives`}
                    tooltip="Average number of objectives completed per engaged user."
                    color={BLUE}
                  />
                  <StatCard
                    label="Opted out"
                    value={String(objKpi.optedOut)}
                    sub={objKpi.totalUsers > 0 ? `${((objKpi.optedOut / objKpi.totalUsers) * 100).toFixed(1)}% of users` : ""}
                    tooltip="Users who permanently turned off tutorial tips."
                    color={GREY}
                  />
                </Stack>

                {/* Funnel table */}
                <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 5 }}>
                  <Box sx={{ px: 2.5, py: 1.5 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Objective completion funnel
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Drop-off analysis, ordered by sequence. Look for steep drops between adjacent steps.
                    </Typography>
                  </Box>
                  <Divider />
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Objective</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">Completed</TableCell>
                          <TableCell sx={{ fontWeight: 700 }} align="right">% of users</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {objKpi.funnel.map((f, i) => (
                          <TableRow key={f.key}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{f.title}</TableCell>
                            <TableCell align="right">{f.completedCount}</TableCell>
                            <TableCell align="right">{f.completionRate}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </>
            )}

            <Box sx={{ mt: 5 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="caption" color="text.disabled">
                Data as of page load. Refresh the page or change the range for the latest numbers.
              </Typography>
            </Box>
          </>
        );
      })()}
    </Box>
  );
}
