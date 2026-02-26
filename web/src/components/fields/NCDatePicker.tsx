"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { DateField } from "@mui/x-date-pickers/DateField";
import type { DateFieldProps } from "@mui/x-date-pickers/DateField";
import dayjs, { type Dayjs } from "dayjs";
import * as React from "react";

type BaseFieldProps = DateFieldProps<boolean>;
export type NCDatePickerProps = Omit<
  BaseFieldProps,
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
 * Reusable date field for keyboard-friendly date entry (e.g. date of birth).
 * Uses MUI X DateField (lighter than DatePicker) for responsive typing.
 * Expects LocalizationProvider at app root.
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
      <DateField
        value={dayjsValue}
        onChange={handleChange}
        format="YYYY-MM-DD"
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
