"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import type { DatePickerProps } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import * as React from "react";

type BasePickerProps = DatePickerProps<boolean>;
export type NCDatePickerProps = Omit<
  BasePickerProps,
  "value" | "onChange" | "label"
> & {
  /** Current value as YYYY-MM-DD (empty string = no selection) */
  value: string;
  /** Called with YYYY-MM-DD when user selects a date */
  onChange: (value: string) => void;
  label: string;
  helperText?: string;
  error?: boolean;
  id?: string;
  /** When true, omit top margin (e.g. first field in AuthDividerForm) */
  noTopMargin?: boolean;
};

/**
 * Reusable date picker aligned with template Calendar Add Event modal.
 * Uses MUI X DatePicker + AdapterDayjs. Expects LocalizationProvider at app root.
 * API: value/onChange as YYYY-MM-DD for form/API compatibility.
 */
export default function NCDatePicker({
  value,
  onChange,
  label,
  helperText,
  error = false,
  id,
  noTopMargin,
  slotProps,
  ...rest
}: NCDatePickerProps) {
  const fieldId = id ?? `date-${label.replace(/\s/g, "-")}`;
  const dayjsValue = value && dayjs(value, "YYYY-MM-DD").isValid() ? dayjs(value) : null;

  const handleChange = (newValue: Dayjs | null) => {
    onChange(newValue && newValue.isValid() ? newValue.format("YYYY-MM-DD") : "");
  };

  return (
    <Box sx={{ mt: noTopMargin ? 0 : 2 }}>
      <Typography
        component="label"
        htmlFor={fieldId}
        variant="subtitle1"
        fontWeight={600}
        sx={{
          display: "block",
          mb: 0.625,
          cursor: "text",
        }}
      >
        {label}
      </Typography>
      <DatePicker
        value={dayjsValue}
        onChange={handleChange}
        slotProps={{
          textField: {
            id: fieldId,
            fullWidth: true,
            variant: "outlined",
            size: "medium",
            error,
            helperText,
          },
          ...slotProps,
        }}
        {...rest}
      />
    </Box>
  );
}
