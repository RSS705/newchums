"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import type { NotificationTypeConfig } from "./notificationConfig";

type NotificationRowProps = {
  config: NotificationTypeConfig;
  enabled: boolean;
  frequency: string;
  onToggle: (enabled: boolean) => void;
  onFrequencyChange: (frequency: string) => void;
  /** When true, render a divider above the row */
  showDivider?: boolean;
  disabled?: boolean;
};

export default function NotificationRow({
  config,
  enabled,
  frequency,
  onToggle,
  onFrequencyChange,
  showDivider = true,
  disabled = false,
}: NotificationRowProps) {
  const showFrequency = config.allowedFrequencies.length > 0 && enabled;

  return (
    <Box>
      {showDivider && <Divider sx={{ my: 0.75 }} />}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          gap: 1.5,
          py: 1,
        }}
      >
        <Switch
          checked={enabled}
          onChange={(_, checked) => onToggle(checked)}
          disabled={disabled}
          color="primary"
          size="small"
          sx={{ mt: 0.25, flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {config.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {config.description}
          </Typography>
        </Box>
        {showFrequency && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              ml: { xs: 0, sm: "auto" },
              width: { xs: "100%", sm: "auto" },
              flexBasis: { xs: "100%", sm: "auto" },
              justifyContent: { xs: "flex-start", sm: "flex-start" },
            }}
          >
            <Select
              value={frequency}
              onChange={(e) => onFrequencyChange(e.target.value)}
              disabled={disabled}
              size="small"
              sx={{
                minWidth: { xs: "100%", sm: 130 },
                maxWidth: { xs: "none", sm: 160 },
              }}
              aria-label="Frequency"
            >
              {config.allowedFrequencies.map((f) => (
                <MenuItem key={f.value} value={f.value}>
                  {f.label}
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </Box>
    </Box>
  );
}
