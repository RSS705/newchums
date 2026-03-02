"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type ConfirmResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  redirectTo?: string;
};

export default function EmailChangeConfirmClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const token = params.get("token");
    const rid = params.get("rid");

    if (!token || !rid) {
      setStatus("error");
      setErrorMessage("This link is incomplete. Please request a new email change.");
      return;
    }

    apiFetch("/account/email-change/confirm", {
      method: "POST",
      body: JSON.stringify({ token, rid }),
    })
      .then(async (res) => {
        const data = (await res.json()) as ConfirmResponse;
        if (res.ok && data.ok && data.redirectTo) {
          setStatus("success");
          router.replace(data.redirectTo);
        } else {
          setStatus("error");
          setErrorMessage(data.message ?? "This link is invalid or has expired.");
        }
      })
      .catch(() => {
        setStatus("error");
        setErrorMessage("Something went wrong. Please try again.");
      });
  }, [params, router]);

  if (status === "loading") {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Typography variant="body1" color="text.secondary">
            Confirming your new email…
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
              Email updated
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Redirecting you to sign in with your new email…
            </Typography>
            <AppButton variant="contained" component={Link} href="/login?emailChanged=1" fullWidth>
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
            Email change failed
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {errorMessage}
          </Typography>
          <AppButton variant="contained" component={Link} href="/settings" fullWidth>
            Back to Settings
          </AppButton>
          <AppButton variant="outlined" component={Link} href="/login" fullWidth>
            Sign in
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
