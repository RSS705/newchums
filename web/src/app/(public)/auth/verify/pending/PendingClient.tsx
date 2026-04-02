"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

const POLL_INTERVAL_MS = 3000;
const TIMEOUT_MS = 10 * 60 * 1000;

export default function PendingClient() {
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const [verified, setVerified] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const [resending, setResending] = React.useState(false);

  React.useEffect(() => {
    if (!email) return;

    const start = Date.now();
    const id = setInterval(async () => {
      if (Date.now() - start > TIMEOUT_MS) {
        clearInterval(id);
        setTimedOut(true);
        return;
      }

      const res = await apiFetch(`/auth/email-verify/status?email=${encodeURIComponent(email)}`);
      const data = (await res.json()) as { verified?: boolean };
      if (data.verified) {
        clearInterval(id);
        setVerified(true);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [email]);

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    await apiFetch("/auth/email-verify/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setResending(false);
    setTimedOut(false);
  };

  if (!email) {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Typography color="text.secondary">
            No email specified. Please complete signup to receive a verification link.
          </Typography>
          <AppButton href="/signup" sx={{ mt: 2 }} fullWidth>
            Sign up
          </AppButton>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  if (verified) {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={600}>
              Email verified
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Your email has been verified. You can now sign in.
            </Typography>
            <AppButton variant="contained" href="/login" fullWidth>
              Continue to sign in
            </AppButton>
          </Stack>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  if (timedOut) {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={600}>
              Still waiting?
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Verification links expire after 24 hours. You can request a new one below.
            </Typography>
            <AppButton variant="contained" onClick={handleResend} disabled={resending} fullWidth>
              {resending ? "Sending…" : "Resend verification email"}
            </AppButton>
            <AppButton href="/login" fullWidth>
              Back to sign in
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
          <Typography variant="h5" fontWeight={600}>
            Check your email
          </Typography>
          <Typography variant="body1" color="text.secondary">
            We&apos;ve sent a verification link to <strong>{email}</strong>. Click the link in that
            email to verify your account.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This page will update automatically when you&apos;ve verified. You can also close it and
            return later.
          </Typography>
          <AppButton variant="outlined" onClick={handleResend} disabled={resending} fullWidth>
            {resending ? "Sending…" : "Resend verification email"}
          </AppButton>
          <AppButton href="/login" fullWidth>
            Back to sign in
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
