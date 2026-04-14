"use client";

import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
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
      <Box
        onClick={onToggleOpen}
        sx={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}
      >
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", flex: 1 }}>
          Matching preferences for this plan
        </Typography>
        <ExpandMoreRoundedIcon
          sx={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            color: "text.secondary",
          }}
        />
      </Box>

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
