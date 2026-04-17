"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";

type Props = {
  email: string;
  token: string;
  next: string;
  alreadySignedInSameEmail: boolean;
};

/**
 * Client-side half of the magic-link flow. Server already resolved the
 * wrong-session interstitial case. This component's only job is to:
 *   - redirect to `next` when the user is already signed in as the same email
 *   - otherwise call signIn("magic-link", ...) which consumes the one-time
 *     token on the API side and sets the session cookie on redirect
 */
export default function MagicClient({ email, token, next, alreadySignedInSameEmail }: Props) {
  const [status, setStatus] = React.useState<"loading" | "error" | "expired">("loading");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const submittedRef = React.useRef(false);

  React.useEffect(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    if (!email || !token) {
      setStatus("error");
      return;
    }

    if (alreadySignedInSameEmail) {
      window.location.href = next;
      return;
    }

    signIn("magic-link", {
      email,
      token,
      redirect: true,
      redirectTo: next,
    }).catch((err: unknown) => {
      const code =
        typeof err === "object" && err && "code" in err
          ? String((err as { code?: unknown }).code ?? "")
          : "";
      if (code === "MagicLinkExpired") {
        setStatus("expired");
      } else if (code === "MagicLinkAccountSuspended") {
        setStatus("error");
        setErrorMessage("Your account has been suspended. Please contact support.");
      } else {
        setStatus("error");
      }
      submittedRef.current = false;
    });
  }, [email, token, next, alreadySignedInSameEmail]);

  if (status === "expired") {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={600} color="error">
              Link expired
            </Typography>
            <Typography variant="body1" color="text.secondary">
              This confirmation link has expired or has already been used. Head back to
              the plan and submit the form again to get a fresh link.
            </Typography>
            <AppButton variant="contained" href={next} fullWidth>
              Back to the plan
            </AppButton>
          </Stack>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  if (status === "error") {
    return (
      <AuthSplitLayout>
        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          <Stack spacing={2}>
            <Typography variant="h5" fontWeight={600} color="error">
              Something went wrong
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {errorMessage ?? "We couldn't confirm this link. Please try again from the plan page."}
            </Typography>
            <AppButton variant="contained" href={next} fullWidth>
              Back to the plan
            </AppButton>
          </Stack>
        </AppCard>
      </AuthSplitLayout>
    );
  }

  // "loading"
  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Typography variant="body1" color="text.secondary">
          Confirming your sign-in&hellip;
        </Typography>
      </AppCard>
    </AuthSplitLayout>
  );
}
