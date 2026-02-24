"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import * as React from "react";
import { apiFetch } from "@/lib/apiClient";
import AuthField from "@/components/auth/AuthField";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";

type RequestResponse = { ok: boolean; resetUrl?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [resetUrl, setResetUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5, textAlign: "center" }}>
          Forgot your password?
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2, textAlign: "center" }}>
          Please enter the email address associated with your account and we&apos;ll
          email you a link to reset your password.
        </Typography>
        <Stack
          component="form"
          spacing={2}
          mt={3}
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setSubmitted(false);
            setResetUrl(null);

            try {
              const response = await apiFetch("/auth/password-reset/request", {
                method: "POST",
                body: JSON.stringify({ email }),
              });
              const data = (await response.json()) as RequestResponse;
              if (!response.ok || !data.ok) {
                setError("Something went wrong. Please try again.");
                return;
              }
              setSubmitted(true);
              if (data.resetUrl) {
                setResetUrl(data.resetUrl);
              }
            } catch {
              setError("Something went wrong. Please try again.");
            }
          }}
        >
          <AuthField
            id="forgot-email"
            label="Email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            helperText={error ?? undefined}
            error={Boolean(error)}
          />
          <AppButton type="submit" fullWidth size="large">
            Send reset link
          </AppButton>
          <AppButton
            component={Link}
            href="/login"
            variant="outlined"
            fullWidth
            size="large"
            color="primary"
          >
            Back to login
          </AppButton>
        </Stack>
        {submitted ? (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            If an account exists, a reset link has been sent.
          </Typography>
        ) : null}
        {resetUrl ? (
          <Typography
            color="text.secondary"
            sx={{ mt: 2, wordBreak: "break-all" }}
          >
            Dev reset link: {resetUrl}
          </Typography>
        ) : null}
      </AppCard>
    </AuthSplitLayout>
  );
}
