"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
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

// ── Range options ────────────────────────────────────────────────────────────

type RangeKey = "30" | "90" | "180" | "365" | "0";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
  { key: "180", label: "6m" },
  { key: "365", label: "1y" },
  { key: "0", label: "All" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const BRAND = "#E65B13";
const BRAND_LIGHT = "#F59E0B";
const GREY = "#6B7280";
const GREEN = "#16A34A";
const RED = "#DC2626";
const BLUE = "#2563EB";

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
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
  return `Last ${window} \u00b7 ${granularityLabel(g)} data points`;
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

// ── Definitions panel ────────────────────────────────────────────────────────

const DEFINITIONS: Array<{ term: string; def: string }> = [
  { term: "Total Registered Accounts", def: "Total user accounts in the system, shown cumulatively over time." },
  { term: "New Accounts / Day", def: "Number of user accounts created per time bucket (day, week, or month depending on range)." },
  { term: "Plans Created / Day", def: "Number of plans (published or later canceled) created per time bucket. Excludes drafts." },
  { term: "Participated in \u22651 plan", def: "Users who hosted at least one plan OR RSVP\u2019d \u201cgoing\u201d to at least one plan (published or canceled). This is the broadest engagement metric." },
  { term: "Participated in \u22652 plans", def: "Subset of the above: users whose distinct plan count (hosting + going RSVPs) is two or more. Indicates repeat engagement." },
  { term: "Hosted \u22651 plan", def: "Users who are the host of at least one published or canceled plan. A core product assumption is ~10% of users may eventually host." },
  { term: "Active (7d / 30d)", def: "Users who made at least one authenticated API request within the trailing 7 or 30 days. Tracked via last_active_at, updated at most once per hour. Early proxy for retention \u2014 will be tightened as product usage patterns emerge." },
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

// ── Main component ───────────────────────────────────────────────────────────

export default function AdminKPIsClient() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("90");

  const fetchKpis = useCallback(async (days: RangeKey) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/admin/kpis?days=${days}`, { auth: true });
      if (!res.ok) throw new Error("Failed to load KPIs");
      const json = (await res.json()) as { ok: boolean; data: KPIData };
      if (!json.ok) throw new Error("Failed to load KPIs");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchKpis(range);
  }, [fetchKpis, range]);

  const granularity = data?.granularity ?? "day";
  const bucketLabel = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";

  return (
    <Box sx={{ maxWidth: 960, mx: "auto", py: { xs: 2, sm: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "flex-start", sm: "center" }}
        spacing={1}
        sx={{ mb: 0.5 }}
      >
        <Typography variant="h5" fontWeight={700}>
          System KPIs
        </Typography>
        <ToggleButtonGroup
          value={range}
          exclusive
          onChange={(_, v) => { if (v) setRange(v as RangeKey); }}
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
          {RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key} disabled={loading}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {data ? rangeSummary(data.rangeDays, granularity) : "Loading\u2026"}
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
                label="Participated in ≥1 plan"
                value={pct(participation.participatedOne, participation.totalUsers)}
                sub={`${participation.participatedOne.toLocaleString()} of ${participation.totalUsers.toLocaleString()} users`}
                tooltip="Users who hosted OR RSVP'd going to at least one plan."
                color={BRAND}
              />
              <StatCard
                label="Participated in ≥2 plans"
                value={pct(participation.participatedTwo, participation.participatedOne)}
                sub={`${participation.participatedTwo.toLocaleString()} of ${participation.participatedOne.toLocaleString()} participants`}
                tooltip="Of users who participated at least once, how many did so twice or more."
                color={BRAND}
              />
              <StatCard
                label="Hosted ≥1 plan"
                value={pct(participation.hostedOne, participation.totalUsers)}
                sub={`${participation.hostedOne.toLocaleString()} of ${participation.totalUsers.toLocaleString()} users`}
                tooltip="Users who created and hosted at least one plan. Target benchmark: ~10% of users."
                color={GREEN}
              />
            </Stack>

            <Grid container spacing={2} sx={{ mb: 5 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Participated in ≥1 plan"
                  subtitle="% of all users who hosted or RSVP'd going to at least one plan."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="participatedOnePct"
                  color={BRAND}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Participated in ≥2 plans"
                  subtitle="% of single-plan participants who engaged with two or more plans."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="participatedTwoPct"
                  color={BRAND_LIGHT}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <PctChart
                  title="Hosted ≥1 plan"
                  subtitle="% of all users who hosted at least one plan."
                  data={participation.series}
                  granularity={granularity}
                  dataKey="hostedOnePct"
                  color={GREEN}
                />
              </Grid>
            </Grid>

            {/* ── 3. Return behavior ── */}
            <SectionTitle>Return behavior</SectionTitle>
            <SectionSubtitle>
              Users who made at least one authenticated API request in the given window.
              Tracked via <code style={{ fontSize: "0.85em" }}>last_active_at</code>, updated
              at most once per hour.
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
                value={planHealth.completionRate != null ? pct(planHealth.completed, planHealth.totalPast) : "—"}
                sub={`${planHealth.completed} completed of ${planHealth.totalPast} past plans`}
                tooltip="Past-start-time published plans that were not canceled / all past published+canceled plans."
                color={GREEN}
              />
              <StatCard
                label="Cancellation rate"
                value={planHealth.cancellationRate != null ? pct(planHealth.canceled, planHealth.totalAll) : "—"}
                sub={`${planHealth.canceled} canceled of ${planHealth.totalAll} total plans`}
                tooltip="Canceled plans / all published+canceled plans (including future)."
                color={RED}
              />
              <StatCard
                label="Avg fill rate"
                value={planHealth.avgFillRate != null ? fmtPct(planHealth.avgFillRate) : "—"}
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
