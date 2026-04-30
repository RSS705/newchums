"use client";

import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import FilterAltRoundedIcon from "@mui/icons-material/FilterAltRounded";
import { AppCard } from "@/components/ui";

/** Metrics surfaced in the per-plan override UI. Kept separate from the full
 *  server-side `PREF_METRIC_LABELS` map so we can list hosting_skills without
 *  exposing it as a user-facing override (it only moves from hosted feedback). */
export const PREF_METRICS = ["reliability", "sociability", "presentation", "age"] as const;
export type PrefMetric = (typeof PREF_METRICS)[number];

export const PREF_METRIC_LABELS: Record<PrefMetric, string> = {
  reliability: "Reliability",
  sociability: "Sociability",
  presentation: "Cleanliness & consideration",
  age: "Age range",
};

type Props = {
  open: boolean;
  onToggleOpen: () => void;
  disableAll: boolean;
  onChangeDisableAll: (value: boolean) => void;
  disabledMetrics: Record<string, boolean>;
  onChangeDisabledMetrics: (
    updater: (prev: Record<string, boolean>) => Record<string, boolean>
  ) => void;
};

export default function MatchingPreferencesSection({
  open,
  onToggleOpen,
  disableAll,
  onChangeDisableAll,
  disabledMetrics,
  onChangeDisabledMetrics,
}: Props) {
  return (
    <AppCard>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        onClick={onToggleOpen}
        sx={{ cursor: "pointer", userSelect: "none" }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            bgcolor: "primary.light",
            color: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <FilterAltRoundedIcon sx={{ fontSize: 22 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
          >
            Matching preferences for this plan
          </Typography>
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
          >
            Relax filtering for this plan without changing your profile settings.
          </Typography>
        </Box>
        <ExpandMoreRoundedIcon
          sx={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "text.secondary",
            flexShrink: 0,
          }}
        />
      </Stack>

      <Collapse in={open}>
        <Stack spacing={2} sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Your profile chum preferences are used by default when matching people to your plans.
            You can relax those rules for this plan only, without changing your profile settings.
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={disableAll}
                onChange={(e) => {
                  onChangeDisableAll(e.target.checked);
                  if (e.target.checked) onChangeDisabledMetrics(() => ({}));
                }}
              />
            }
            label="Disable all preference filtering for this plan"
            sx={{ alignItems: "center", gap: 0.5 }}
          />

          {!disableAll && (
            <Stack spacing={1} sx={{ pl: 0.5 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                Or disable specific metrics for this plan:
              </Typography>
              {PREF_METRICS.map((metric) => (
                <FormControlLabel
                  key={metric}
                  control={
                    <Switch
                      size="small"
                      checked={!!disabledMetrics[metric]}
                      onChange={(e) =>
                        onChangeDisabledMetrics((prev) => ({
                          ...prev,
                          [metric]: e.target.checked,
                        }))
                      }
                    />
                  }
                  label={
                    <Typography variant="body2">
                      Skip <strong>{PREF_METRIC_LABELS[metric]}</strong> filtering
                    </Typography>
                  }
                  sx={{ gap: 0.5 }}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Collapse>
    </AppCard>
  );
}
