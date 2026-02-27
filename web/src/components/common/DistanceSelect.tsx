"use client";

import { AppTextField } from "@/components/ui";
import { TRAVEL_RADIUS_OPTIONS, type TravelRadiusKm } from "@/config/travelRadius";

export type DistanceSelectProps = {
  value: TravelRadiusKm | number;
  onChange: (value: number) => void;
  label?: string;
  helperText?: string | null;
  fullWidth?: boolean;
  sx?: Record<string, unknown>;
};

export default function DistanceSelect({
  value,
  onChange,
  label = "Travel distance",
  helperText = null,
  fullWidth = false,
  sx,
}: DistanceSelectProps) {
  return (
    <AppTextField
      select
      label={label}
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      helperText={helperText}
      SelectProps={{ native: true }}
      sx={{ minWidth: fullWidth ? undefined : 145, width: fullWidth ? "100%" : undefined, ...sx }}
    >
      {TRAVEL_RADIUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </AppTextField>
  );
}
