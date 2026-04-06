"use client";

import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import HandshakeRoundedIcon from "@mui/icons-material/HandshakeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ThumbUpAltRoundedIcon from "@mui/icons-material/ThumbUpAltRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import { useEffect, useState } from "react";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type RatioMetric = { numerator: number; denominator: number };

type BadgeEntry = {
  type: string;
  tier: "gold" | "silver" | "bronze";
  count: number;
  rank: number;
  totalInArea: number;
};

type AttendanceRecord = {
  goingFollowThrough: RatioMetric;
  followThrough: RatioMetric;
  confirmationRate: RatioMetric;
  plansAttended: number;
  plansHosted: number;
  hostCompletion: RatioMetric;
  memberSince: string | null;
  badges?: BadgeEntry[];
};

type AttendanceRecordSectionProps = {
  userId: string;
  isOwner?: boolean;
  /** Display name (used for non-public profile title when not owner). */
  displayName?: string;
  /** `profile` = edit profile page (can show "Your stats" when owner). `public` = public profile URL. */
  variant?: "profile" | "public";
  /** Whether the current viewer is logged in. When false, reliability metrics are hidden. */
  viewerLoggedIn?: boolean;
};

const MIN_SAMPLE_FOR_RATE = 3;

function formatRate(r: RatioMetric): { display: string; isLimited: boolean; ratio: string; pct: number | null } {
  if (r.denominator === 0) {
    return { display: "100%", isLimited: true, ratio: "0 of 0", pct: 100 };
  }
  const pct = Math.round((r.numerator / r.denominator) * 100);
  const ratio = `${r.numerator} of ${r.denominator}`;
  if (r.denominator < MIN_SAMPLE_FOR_RATE) {
    return { display: `${pct}%`, isLimited: true, ratio, pct };
  }
  return { display: `${pct}%`, isLimited: false, ratio, pct };
}

type MetricCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  ratio?: string;
  tooltipTitle?: string;
};

function MetricCard({ icon, label, value, ratio, tooltipTitle }: MetricCardProps) {
  const isEmpty = value === "-";

  const card = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        py: { xs: 1.75, sm: 2.25 },
        px: { xs: 0.75, sm: 1.25 },
        borderRadius: 2,
        bgcolor: (theme) =>
          theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.04)",
        border: "1px solid",
        borderColor: "divider",
        gap: 0.5,
        minWidth: 0,
      }}
    >
      {icon && (
        <Box
          sx={{
            color: isEmpty ? "text.disabled" : "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 0.25,
          }}
        >
          {icon}
        </Box>
      )}

      <Typography
        variant="h5"
        fontWeight={800}
        sx={{
          fontSize: { xs: "1.375rem", sm: "1.625rem" },
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: isEmpty ? "text.disabled" : "text.primary",
        }}
      >
        {value}
      </Typography>

      {ratio && (
        <Typography
          variant="caption"
          sx={{ fontSize: "0.6875rem", color: "text.disabled", lineHeight: 1.2 }}
        >
          {ratio}
        </Typography>
      )}

      <Typography
        variant="caption"
        fontWeight={600}
        color={isEmpty ? "text.disabled" : "text.secondary"}
        sx={{
          fontSize: { xs: "0.75rem", sm: "0.8125rem" },
          lineHeight: 1.3,
          mt: 0.25,
        }}
      >
        {label}
      </Typography>
    </Box>
  );

  if (tooltipTitle) {
    return (
      <Tooltip title={tooltipTitle} arrow placement="top" enterTouchDelay={0}>
        {card}
      </Tooltip>
    );
  }
  return card;
}

const TIER_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  gold:   { bg: "linear-gradient(135deg, #FFF8E1 0%, #FFF3C4 100%)", border: "#F9D649", icon: "#D4A017" },
  silver: { bg: "linear-gradient(135deg, #F5F5F5 0%, #E8E8E8 100%)", border: "#B0B0B0", icon: "#757575" },
  bronze: { bg: "linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)", border: "#E0A060", icon: "#C17832" },
};

const TIER_LABELS: Record<string, string> = { gold: "Gold", silver: "Silver", bronze: "Bronze" };

const BADGE_TYPE_LABELS: Record<string, string> = { top_attendee: "Top Attendee", top_host: "Top Host" };

function BadgePill({ badge }: { badge: BadgeEntry }) {
  const tier = TIER_COLORS[badge.tier] ?? TIER_COLORS.bronze;
  const tierLabel = TIER_LABELS[badge.tier] ?? badge.tier;
  const typeLabel = BADGE_TYPE_LABELS[badge.type] ?? badge.type;
  const pctLabel = badge.tier === "gold" ? "Top 10%" : badge.tier === "silver" ? "Top 20%" : "Top 30%";
  const activityLabel = badge.type === "top_host" ? "hosting" : "attending";

  const tooltip = `${pctLabel} for ${activityLabel} plans in your area, based on the last 12 months of activity.`;

  return (
    <Tooltip title={tooltip} arrow placement="top" enterTouchDelay={0}>
      <Chip
        icon={<EmojiEventsRoundedIcon sx={{ fontSize: 16, color: `${tier.icon} !important` }} />}
        label={`${tierLabel} ${typeLabel}`}
        size="small"
        sx={{
          fontWeight: 700,
          fontSize: "0.75rem",
          height: 28,
          background: tier.bg,
          border: "1px solid",
          borderColor: tier.border,
          color: tier.icon,
          "& .MuiChip-icon": { ml: 0.5 },
          "& .MuiChip-label": { px: 1 },
        }}
      />
    </Tooltip>
  );
}

function statsSectionTitle({
  variant,
  isOwner,
  displayName,
}: {
  variant: "profile" | "public";
  isOwner?: boolean;
  displayName?: string;
}): string {
  const name = displayName?.trim();
  if (variant === "public") {
    return "Chum Stats";
  }
  if (isOwner) return "Your stats";
  return name ? `${name} stats` : "Stats";
}

export default function AttendanceRecordSection({ userId, isOwner, displayName, variant = "profile", viewerLoggedIn }: AttendanceRecordSectionProps) {
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [reliabilityHidden, setReliabilityHidden] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/public/users/${userId}/attendance-record`, { auth: viewerLoggedIn !== false })
      .then((res) => res.json())
      .then((data: { ok?: boolean; record?: AttendanceRecord & { reliabilityHidden?: boolean } }) => {
        if (!cancelled && data.ok && data.record) {
          setRecord(data.record);
          if (data.record.reliabilityHidden) setReliabilityHidden(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, viewerLoggedIn]);

  const gft = record ? formatRate(record.goingFollowThrough) : null;
  const ft = record ? formatRate(record.followThrough) : null;
  const cr = record ? formatRate(record.confirmationRate) : null;
  const hc = record ? formatRate(record.hostCompletion) : null;

  const hasHosting = record ? record.hostCompletion.denominator > 0 : false;

  const totalActivity = record ? record.plansAttended + record.plansHosted : 0;

  return (
    <AppCard sx={{ overflow: "hidden" }}>
      <Stack spacing={2.5}>
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              bgcolor: "primary.light",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <EventAvailableRoundedIcon sx={{ fontSize: 20, color: "primary.main" }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
            >
              {statsSectionTitle({ variant, isOwner, displayName })}
            </Typography>
            <Typography
              variant="caption"
              color="text.disabled"
              sx={{ fontSize: "0.6875rem" }}
            >
              Based on all-time activity
            </Typography>
          </Box>
        </Stack>

        {/* Local recognition badges */}
        {record?.badges && record.badges.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {record.badges.map((b) => (
              <BadgePill key={b.type} badge={b} />
            ))}
          </Stack>
        )}

        {loading ? (
          <Stack spacing={1.5}>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.25 }}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={90} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.25 }}>
              {[0, 1].map((i) => (
                <Skeleton key={i} variant="rounded" height={78} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            {/* Reliability, hidden from logged-out viewers */}
            {!reliabilityHidden && (
            <Box>
              <Typography
                variant="body2"
                fontWeight={700}
                color="text.secondary"
                sx={{ fontSize: "0.75rem", letterSpacing: "0.04em", textTransform: "uppercase", mb: 1, display: "block" }}
              >
                Reliability
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: hasHosting ? "repeat(2, 1fr)" : { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)" },
                  gap: 1.25,
                }}
              >
                <MetricCard
                  icon={gft!.pct !== null && gft!.pct >= 80 ? <HandshakeRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : null}
                  label="Going follow-through"
                  value={gft!.display}
                  ratio={gft!.ratio || undefined}
                  tooltipTitle={
                    gft!.display === "-"
                      ? "No plan commitments yet"
                      : `Kept a Going RSVP on ${record!.goingFollowThrough.numerator} of ${record!.goingFollowThrough.denominator} plan${record!.goingFollowThrough.denominator === 1 ? "" : "s"}. Measures how often they stick with a Going commitment.`
                  }
                />
                <MetricCard
                  icon={ft!.pct !== null && ft!.pct >= 80 ? <CheckCircleOutlineRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : null}
                  label="Shows up"
                  value={ft!.display}
                  ratio={ft!.ratio || undefined}
                  tooltipTitle={
                    ft!.display === "-"
                      ? "No plan commitments yet"
                      : `Followed through on ${record!.followThrough.numerator} of ${record!.followThrough.denominator} plan${record!.followThrough.denominator === 1 ? "" : "s"} they committed to attend`
                  }
                />
                <MetricCard
                  icon={cr!.pct !== null && cr!.pct >= 80 ? <ThumbUpAltRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : null}
                  label="Attendance checks answered"
                  value={cr!.display}
                  ratio={cr!.ratio || undefined}
                  tooltipTitle={
                    cr!.display === "-"
                      ? "No 24-hour attendance checks received yet"
                      : `Responded to ${record!.confirmationRate.numerator} of ${record!.confirmationRate.denominator} 24-hour attendance check${record!.confirmationRate.denominator === 1 ? "" : "s"}`
                  }
                />
                {hasHosting && (
                  <MetricCard
                    icon={hc!.pct !== null && hc!.pct >= 50 ? <StarRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} /> : null}
                    label="Host follow-through"
                    value={hc!.display}
                    ratio={hc!.ratio || undefined}
                    tooltipTitle={`Of ${record!.hostCompletion.denominator} hosted plan${record!.hostCompletion.denominator === 1 ? "" : "s"} where others committed to join, ${record!.hostCompletion.numerator} still went ahead`}
                  />
                )}
              </Box>
            </Box>
            )}

            {/* Activity */}
            <Box>
              <Typography
                variant="body2"
                fontWeight={700}
                color="text.secondary"
                sx={{ fontSize: "0.75rem", letterSpacing: "0.04em", textTransform: "uppercase", mb: 1, display: "block" }}
              >
                Activity
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: 1.25,
                }}
              >
                <MetricCard
                  icon={<GroupsRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />}
                  label="Plans attended"
                  value={String(record!.plansAttended)}
                />
                <MetricCard
                  icon={<CampaignRoundedIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />}
                  label="Plans hosted"
                  value={String(record!.plansHosted)}
                />
              </Box>
            </Box>

            {totalActivity <= 5 && (
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ textAlign: "center", fontSize: "0.6875rem", lineHeight: 1.5, display: "block" }}
              >
                {isOwner
                  ? "These stats grow as you join and host plans."
                  : "Stats grow with more plan history."}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </AppCard>
  );
}
