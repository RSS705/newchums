"use client";

import Box from "@mui/material/Box";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

export type AppTextFieldProps = Omit<TextFieldProps, "variant" | "size">;

/**
 * TextField with label above (matches NCDatePicker / AuthField pattern).
 * When label is provided, renders Typography above the input; no floating/in-field label.
 */
export default function AppTextField(props: AppTextFieldProps) {
  const { label, id, sx, ...rest } = props;
  const helperText = props.helperText === null ? undefined : (props.helperText ?? " ");
  const fieldId = id ?? (label ? `field-${String(label).replace(/\s/g, "-")}` : undefined);

  if (label) {
    return (
      <Box sx={{ width: "100%", ...sx }}>
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
          fullWidth
          variant="outlined"
          size="medium"
          {...rest}
          label={undefined}
          helperText={helperText}
        />
      </Box>
    );
  }

  return (
    <TextField
      fullWidth
      variant="outlined"
      size="medium"
      {...props}
      helperText={helperText}
    />
  );
}
