"use client";

import TextField, { type TextFieldProps } from "@mui/material/TextField";

export type AppTextFieldProps = Omit<TextFieldProps, "variant" | "size">;

export default function AppTextField(props: AppTextFieldProps) {
  const helperText = props.helperText === null ? undefined : (props.helperText ?? " ");

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
