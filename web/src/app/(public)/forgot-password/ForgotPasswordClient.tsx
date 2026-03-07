"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import { apiFetch } from "@/lib/apiClient";
import AuthField from "@/components/auth/AuthField";
import AuthFooterLink from "@/components/auth/AuthFooterLink";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";

type RequestResponse = { ok?: boolean; error?: string };

export default function ForgotPasswordClient() {
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const q = searchParams.get("email")?.trim();
    if (q) setEmail(q);
  }, [searchParams]);

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

            try {
              const response = await apiFetch("/auth/password-reset/request", {
                method: "POST",
                body: JSON.stringify({ email }),
              });
              const data = (await response.json()) as RequestResponse;
              if (response.status === 404 && data.error === "EMAIL_NOT_FOUND") {
                setError("No account found for that email.");
                return;
              }
              if (response.status === 409 && data.error === "OAUTH_ACCOUNT") {
                setError("This account uses Google sign-in. We cannot reset its password. Please sign in with Google instead.");
                return;
              }
              if (response.status === 400 && data.error === "EMAIL_REQUIRED") {
                setError("Please enter your email address.");
                return;
              }
              if (!response.ok || !data.ok) {
                setError("Something went wrong. Please try again.");
                return;
              }
              setSubmitted(true);
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
            Back to sign in
          </AppButton>
        </Stack>
        {submitted && (
          <Typography color="success.main" sx={{ mt: 2, textAlign: "center", fontWeight: 500 }}>
            Reset link sent — please check your email.
          </Typography>
        )}
        <AuthFooterLink prompt="Don't have an account?" linkText="Sign up" href="/signup" />
      </AppCard>
    </AuthSplitLayout>
  );
}
