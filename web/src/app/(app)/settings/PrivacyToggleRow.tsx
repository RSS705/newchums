"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

type PrivacyToggleRowProps = {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  showDivider?: boolean;
  disabled?: boolean;
};

export default function PrivacyToggleRow({
  title,
  description,
  enabled,
  onToggle,
  showDivider = true,
  disabled = false,
}: PrivacyToggleRowProps) {
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
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {description}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
