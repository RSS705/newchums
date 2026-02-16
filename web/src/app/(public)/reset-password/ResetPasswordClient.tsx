"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

type ConfirmResponse = { ok: boolean; error?: string };

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <AppCard sx={{ width: "100%", maxWidth: 520 }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Reset password
          </Typography>
          <Stack
            component="form"
            spacing={1.5}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              if (!token) {
                setError("Missing reset token.");
                return;
              }
              if (password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
              }
              setIsSubmitting(true);
              try {
                const response = await fetch("/api/auth/password-reset/confirm", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token, password }),
                });
                const data = (await response.json()) as ConfirmResponse;
                if (!response.ok || !data.ok) {
                  if (data.error === "INVALID_OR_EXPIRED") {
                    setError("Reset link is invalid or expired.");
                  } else if (data.error === "INVALID_INPUT") {
                    setError("Password must be at least 8 characters.");
                  } else {
                    setError("Unable to reset password.");
                  }
                  return;
                }
                router.push("/login");
              } catch {
                setError("Unable to reset password.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <AppTextField
              type="password"
              label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <AppTextField
              type="password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              helperText={error ?? " "}
              error={Boolean(error)}
            />
            <AppButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Updating..." : "Update password"}
            </AppButton>
          </Stack>
        </Stack>
      </AppCard>
    </Box>
  );
}
