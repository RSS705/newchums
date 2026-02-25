"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { apiFetch } from "@/lib/apiClient";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

type ConfirmResponse = { ok?: boolean; error?: string; message?: string };

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [invalidOrExpired, setInvalidOrExpired] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInvalidOrExpired(false);
    if (!token) {
      setError("Missing reset token.");
      setInvalidOrExpired(true);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      const data = (await response.json()) as ConfirmResponse;
      if (!response.ok || !data.ok) {
        if (data.error === "INVALID_OR_EXPIRED") {
          setError("Reset link is invalid or has expired.");
          setInvalidOrExpired(true);
        } else if (data.error === "INVALID_INPUT") {
          setError(data.message ?? "Password must be at least 8 characters.");
        } else {
          setError("Unable to reset password.");
        }
        return;
      }
      router.push("/login?reset=success");
    } catch {
      setError("Unable to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (invalidOrExpired && !token) {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography component="h1" variant="h5" fontWeight={600} color="error">
              Invalid reset link
            </Typography>
            <Typography variant="body1" color="text.secondary">
              No reset token was provided. Please request a new password reset link.
            </Typography>
            <AppButton variant="contained" component={Link} href="/forgot-password" fullWidth>
              Request new link
            </AppButton>
            <AppButton variant="outlined" component={Link} href="/login" fullWidth>
              Back to login
            </AppButton>
          </Stack>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  if (invalidOrExpired && error) {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography component="h1" variant="h5" fontWeight={600} color="error">
              Link expired or invalid
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {error} Request a new link to try again.
            </Typography>
            <AppButton variant="contained" component={Link} href="/forgot-password" fullWidth>
              Request new link
            </AppButton>
            <AppButton variant="outlined" component={Link} href="/login" fullWidth>
              Back to login
            </AppButton>
          </Stack>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4" fontWeight={700}>
            Set your new password
          </Typography>
          <Stack component="form" spacing={1.5} onSubmit={handleSubmit}>
            <AppTextField
              type="password"
              label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              inputProps={{ minLength: 8, autoComplete: "new-password" }}
            />
            <AppTextField
              type="password"
              label="Confirm password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              helperText={error ?? " "}
              error={Boolean(error)}
              inputProps={{ autoComplete: "new-password" }}
            />
            <AppButton type="submit" disabled={isSubmitting} fullWidth>
              {isSubmitting ? "Updating…" : "Update password"}
            </AppButton>
            <AppButton variant="outlined" component={Link} href="/login" fullWidth>
              Back to login
            </AppButton>
          </Stack>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
