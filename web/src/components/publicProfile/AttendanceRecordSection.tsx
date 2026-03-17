"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import ThumbUpAltRoundedIcon from "@mui/icons-material/ThumbUpAltRounded";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import { useEffect, useState } from "react";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type RatioMetric = { numerator: number; denominator: number };

type AttendanceRecord = {
  followThrough: RatioMetric;
  confirmationRate: RatioMetric;
  plansAttended: number;
  plansHosted: number;
  hostCompletion: RatioMetric;
  memberSince: string | null;
};

type AttendanceRecordSectionProps = {
  userId: string;
  isOwner?: boolean;
};

const MIN_SAMPLE_FOR_RATE = 3;

function formatRate(r: RatioMetric): { display: string; isNew: boolean; tooltip: string } {
  if (r.denominator === 0) {
    return { display: "—", isNew: true, tooltip: "No data yet" };
  }
  if (r.denominator < MIN_SAMPLE_FOR_RATE) {
    const pct = Math.round((r.numerator / r.denominator) * 100);
    return {
      display: `${pct}%`,
      isNew: true,
      tooltip: `${r.numerator} of ${r.denominator}`,
    };
  }
  const pct = Math.round((r.numerator / r.denominator) * 100);
  return {
    display: `${pct}%`,
    isNew: false,
    tooltip: `${r.numerator} of ${r.denominator}`,
  };
}

type MetricCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  isNew?: boolean;
  tooltip?: string;
  accentColor?: string;
};

function MetricCard({ icon, label, value, subtitle, isNew, tooltip, accentColor = "primary.main" }: MetricCardProps) {
  const content = (
    <Box
      sx={{
        flex: "1 1 0",
        minWidth: 0,
        textAlign: "center",
        py: { xs: 2, sm: 2.5 },
        px: 1.25,
      }}
    >
      <Box sx={{ color: accentColor, mb: 1, display: "flex", justifyContent: "center" }}>
        {icon}
      </Box>
      <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center">
        <Typography
          variant="h5"
          fontWeight={900}
          sx={{
            fontSize: { xs: "1.5rem", sm: "1.75rem" },
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
            color: value === "—" ? "text.disabled" : "text.primary",
          }}
        >
          {value}
        </Typography>
        {isNew && value !== "—" && (
          <Chip
            label="New"
            size="small"
            sx={{
              height: 20,
              fontSize: "0.6875rem",
              fontWeight: 700,
              bgcolor: (theme) => `${theme.palette.secondary.main}18`,
              color: "secondary.dark",
              border: "1px solid",
              borderColor: (theme) => `${theme.palette.secondary.main}40`,
            }}
          />
        )}
      </Stack>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          display: "block",
          mt: 0.75,
          fontWeight: 600,
          fontSize: { xs: "0.8rem", sm: "0.85rem" },
          lineHeight: 1.4,
        }}
      >
        {label}
      </Typography>
      {subtitle && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mt: 0.25,
            fontSize: "0.7rem",
            color: "text.disabled",
            fontWeight: 500,
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow placement="top" enterTouchDelay={0}>
        {content}
      </Tooltip>
    );
  }
  return content;
}

export default function AttendanceRecordSection({ userId, isOwner }: AttendanceRecordSectionProps) {
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/public/users/${userId}/attendance-record`, { auth: false })
      .then((res) => res.json())
      .then((data: { ok?: boolean; record?: AttendanceRecord }) => {
        if (!cancelled && data.ok && data.record) {
          setRecord(data.record);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const ft = record ? formatRate(record.followThrough) : null;
  const cr = record ? formatRate(record.confirmationRate) : null;
  const hc = record ? formatRate(record.hostCompletion) : null;

  const totalActivity = record
    ? record.plansAttended + record.plansHosted
    : 0;
  const isNewUser = totalActivity === 0 && !loading;

  return (
    <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        {/* Header */}
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: "50%",
              bgcolor: "primary.light",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <EventAvailableRoundedIcon sx={{ fontSize: 22, color: "primary.main" }} />
          </Box>
          <Typography
            variant="h6"
            fontWeight={800}
            sx={{ fontSize: { xs: "1.05rem", sm: "1.15rem" } }}
          >
            Attendance record
          </Typography>
        </Stack>

        {loading ? (
          <Stack spacing={1.5}>
            <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
            <Skeleton variant="rounded" height={60} sx={{ borderRadius: 2 }} />
          </Stack>
        ) : isNewUser ? (
          /* New user — no plan history yet */
          <Box
            sx={{
              textAlign: "center",
              py: { xs: 2, sm: 3 },
              px: 2,
              bgcolor: (theme) =>
                theme.palette.mode === "light" ? "grey.50" : "grey.900",
              borderRadius: 2,
            }}
          >
            <Chip
              label="Building history"
              size="small"
              sx={{
                mb: 1.5,
                height: 24,
                fontSize: "0.75rem",
                fontWeight: 700,
                bgcolor: (theme) => `${theme.palette.secondary.main}18`,
                color: "secondary.dark",
                border: "1px solid",
                borderColor: (theme) => `${theme.palette.secondary.main}40`,
              }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.65, maxWidth: 340, mx: "auto" }}
            >
              {isOwner
                ? "Your attendance record will grow as you join and host plans. Every plan you follow through on builds your history."
                : "This person is new to NewChums. Their attendance record will grow as they join and host plans."}
            </Typography>
          </Box>
        ) : (
          /* Has history — show metrics */
          <Stack spacing={2}>
            {/* Rate metrics row */}
            <Box
              sx={{
                display: "flex",
                bgcolor: (theme) =>
                  theme.palette.mode === "light" ? "grey.50" : "grey.900",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <MetricCard
                icon={<CheckCircleOutlineRoundedIcon sx={{ fontSize: 28 }} />}
                label="Follow-through"
                value={ft!.display}
                subtitle={ft!.isNew || ft!.display === "—" ? undefined : `${record!.followThrough.numerator} of ${record!.followThrough.denominator}`}
                isNew={ft!.isNew && ft!.display !== "—"}
                tooltip={ft!.display === "—" ? "No plan commitments yet" : ft!.tooltip}
              />
              <Divider orientation="vertical" flexItem />
              <MetricCard
                icon={<ThumbUpAltRoundedIcon sx={{ fontSize: 28 }} />}
                label="Confirmation"
                value={cr!.display}
                subtitle={cr!.isNew || cr!.display === "—" ? undefined : `${record!.confirmationRate.numerator} of ${record!.confirmationRate.denominator}`}
                isNew={cr!.isNew && cr!.display !== "—"}
                tooltip={cr!.display === "—" ? "No confirmation requests yet" : cr!.tooltip}
              />
              {record!.hostCompletion.denominator > 0 && (
                <>
                  <Divider orientation="vertical" flexItem />
                  <MetricCard
                    icon={<StarRoundedIcon sx={{ fontSize: 28 }} />}
                    label="Host completion"
                    value={hc!.display}
                    subtitle={hc!.isNew || hc!.display === "—" ? undefined : `${record!.hostCompletion.numerator} of ${record!.hostCompletion.denominator}`}
                    isNew={hc!.isNew && hc!.display !== "—"}
                    tooltip={hc!.tooltip}
                  />
                </>
              )}
            </Box>

            {/* Count metrics row */}
            <Box
              sx={{
                display: "flex",
                bgcolor: (theme) =>
                  theme.palette.mode === "light" ? "grey.50" : "grey.900",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <MetricCard
                icon={<GroupsRoundedIcon sx={{ fontSize: 28 }} />}
                label="Plans attended"
                value={String(record!.plansAttended)}
                accentColor="primary.main"
              />
              <Divider orientation="vertical" flexItem />
              <MetricCard
                icon={<CampaignRoundedIcon sx={{ fontSize: 28 }} />}
                label="Plans hosted"
                value={String(record!.plansHosted)}
                accentColor="primary.main"
              />
            </Box>

            {/* Contextual helper text */}
            {totalActivity > 0 && totalActivity <= 5 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  textAlign: "center",
                  fontSize: "0.6875rem",
                  lineHeight: 1.5,
                  opacity: 0.85,
                }}
              >
                {isOwner
                  ? "Your record is just getting started — keep joining and hosting plans to build your history."
                  : "This record is still early — it becomes more meaningful with more plans."}
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </AppCard>
  );
}
