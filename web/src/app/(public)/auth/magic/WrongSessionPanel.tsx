"use client";

import { signOut } from "next-auth/react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";

type Props = {
  signedInEmail: string;
  linkEmail: string;
  next: string;
  token: string;
};

/**
 * Interstitial shown when a user clicks a magic link for a different email
 * than the one they're currently signed in as. We explicitly do not swap
 * sessions silently — an attacker-supplied link shouldn't be able to force
 * a signed-in victim into a new identity mid-browsing.
 */
export default function WrongSessionPanel({ signedInEmail, linkEmail, next, token }: Props) {
  const retryUrl = `/auth/magic?token=${encodeURIComponent(token)}&email=${encodeURIComponent(linkEmail)}&next=${encodeURIComponent(next)}`;

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Stack spacing={2}>
          <Typography variant="h5" fontWeight={600}>
            You&rsquo;re signed in already
          </Typography>
          <Typography variant="body1" color="text.secondary">
            This confirmation link is for <strong>{linkEmail}</strong>, but you&rsquo;re
            currently signed in as <strong>{signedInEmail}</strong>. Sign out first to
            continue with the new account.
          </Typography>
          <AppButton
            variant="contained"
            onClick={() => signOut({ redirectTo: retryUrl })}
            fullWidth
          >
            Sign out and continue
          </AppButton>
          <AppButton variant="outlined" href={next} fullWidth>
            Stay signed in as {signedInEmail}
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
