import * as React from "react";
import Button, { type ButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

type NCButtonProps = ButtonProps & {
  loading?: boolean;
  loadingText?: string;
};

export default function NCButton({
  children,
  loading = false,
  loadingText = "Loading...",
  disabled,
  variant = "contained",
  size = "medium",
  ...props
}: NCButtonProps) {
  return (
    <Button disabled={disabled || loading} variant={variant} size={size} {...props}>
      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16} color="inherit" />
          <Typography component="span" variant="button" sx={{ fontWeight: 700 }}>
            {loadingText}
          </Typography>
        </Stack>
      ) : (
        children
      )}
    </Button>
  );
}
