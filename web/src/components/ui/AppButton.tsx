"use client";

import Button, { type ButtonProps } from "@mui/material/Button";

export type AppButtonProps = ButtonProps;

export default function AppButton({
  variant = "contained",
  color = "primary",
  ...props
}: AppButtonProps) {
  return <Button variant={variant} color={color} {...props} />;
}
