"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

export default function VerifyClient() {
  const params = useSearchParams();
  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading");
  const [verifiedEmail, setVerifiedEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const email = params.get("email");
    const token = params.get("token");

    if (!email || !token) {
      setStatus("error");
      return;
    }

    apiFetch("/auth/email-verify/confirm", {
      method: "POST",
      body: JSON.stringify({ email, token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (res.ok && data.ok) {
          setVerifiedEmail(email);
          setStatus("success");
        } else {
          setStatus("error");
        }
      })
      .catch(() => setStatus("error"));
  }, [params]);

  if (status === "loading") {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Typography variant="body1" color="text.secondary">
            Verifying your email…
          </Typography>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  if (status === "success") {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={600}>
              Email verified
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Your email has been verified. You can close this tab and return to the app to sign in.
            </Typography>
            <AppButton
              variant="contained"
              href={verifiedEmail ? `/login?email=${encodeURIComponent(verifiedEmail)}` : "/login"}
              fullWidth
            >
              Continue to sign in
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
          <Typography variant="h5" fontWeight={600} color="error">
            Verification failed
          </Typography>
          <Typography variant="body1" color="text.secondary">
            The link may have expired or is invalid. Please request a new verification email.
          </Typography>
          <AppButton variant="contained" href="/auth/verify/pending" fullWidth>
            Request new email
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
