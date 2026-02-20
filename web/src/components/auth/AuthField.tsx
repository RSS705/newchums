"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { TextFieldProps } from "@mui/material/TextField";
import TextField from "@mui/material/TextField";

/**
 * Auth form field with label above (template CustomFormLabel + CustomTextField pattern).
 * Uses subtitle1-style label (600 weight) with 5px bottom, 18px top spacing.
 */
type AuthFieldProps = Omit<TextFieldProps, "label"> & {
  label: string;
  /** Used for htmlFor on the label */
  id?: string;
  /** When true, omit top margin (e.g. first field in a form) */
  noTopMargin?: boolean;
};

export default function AuthField({
  id,
  label,
  helperText,
  noTopMargin,
  ...textFieldProps
}: AuthFieldProps) {
  const fieldId = id ?? textFieldProps.name ?? `field-${label}`;
  const hasHelper = helperText !== undefined && helperText !== "";

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
      <TextField
        id={fieldId}
        variant="outlined"
        fullWidth
        size="medium"
        {...textFieldProps}
        label={undefined}
        helperText={hasHelper ? helperText : undefined}
      />
    </Box>
  );
}
