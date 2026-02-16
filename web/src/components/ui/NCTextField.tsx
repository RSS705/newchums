"use client";

import TextField, { type TextFieldProps } from "@mui/material/TextField";

type NCTextFieldProps = TextFieldProps & {
  reserveHelperTextSpace?: boolean;
};

export default function NCTextField({
  reserveHelperTextSpace = true,
  variant = "outlined",
  size = "medium",
  fullWidth = true,
  helperText,
  ...props
}: NCTextFieldProps) {
  return (
    <TextField
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      helperText={helperText ?? (reserveHelperTextSpace ? " " : undefined)}
      {...props}
    />
  );
}

