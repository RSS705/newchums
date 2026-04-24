"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { getSafeRedirectPath } from "@/lib/authRedirect";

// Duplicated from api/src/index.ts on purpose: single-pass pilot patch.
// A shared constants module is the right long-term fix and is out of
// scope here. Keep in sync with CURRENT_TERMS_VERSION /
// CURRENT_PRIVACY_VERSION in api/src/index.ts and with the same
// literals in SignupClient.tsx.
const CURRENT_TERMS_VERSION = "2026-03-17";
const CURRENT_PRIVACY_VERSION = "2026-03-17";

/** Small interstitial shown to signed-in users whose legal acceptance
 *  was never recorded (typically Google OAuth users whose sessionStorage
 *  was cleared across the redirect). Matches the visual rhythm of
 *  OnboardingUsernameClient: AuthSplitLayout, AppCard, a short
 *  explanation, a single accept action. After a successful POST we do a
 *  full browser navigation to `returnTo` so the (app) layout re-runs
 *  with fresh session state and the Router Cache does not serve a stale
 *  pre-acceptance render. */
export default function AcceptLegalClient() {
  const searchParams = useSearchParams();
  const returnTo = getSafeRedirectPath(searchParams.get("returnTo"));

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleAccept = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/auth/record-legal-acceptance", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          accepted_terms_version: CURRENT_TERMS_VERSION,
          accepted_privacy_version: CURRENT_PRIVACY_VERSION,
        }),
      });
      if (!res.ok) {
        setError("We couldn't save your response. Please try again in a moment.");
        setSubmitting(false);
        return;
      }
      // Full browser navigation so the (app) layout re-evaluates with
      // the freshly-written accepted_legal_at column and does not serve
      // the stale "legal missing" branch from its cached render.
      window.location.assign(returnTo);
    } catch {
      setError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout>
      <Stack spacing={3} sx={{ width: "100%" }}>
        <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "1.5rem", sm: "1.75rem" },
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
            }}
          >
            One quick thing
          </Typography>
          <Typography
            color="text.secondary"
            sx={{ mt: 1, fontSize: { xs: "0.9375rem", sm: "1rem" }, lineHeight: 1.55 }}
          >
            To keep using NewChums, please review and accept the current Terms of Use and Privacy Policy.
          </Typography>
        </Box>

        <AppCard>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              By continuing you confirm that you&rsquo;ve read and agree to the{" "}
              <Typography
                component={NextLink}
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ color: "primary.main", fontWeight: 600, textDecoration: "underline", "&:hover": { color: "primary.dark" } }}
              >
                Terms of Use
              </Typography>
              {" "}and{" "}
              <Typography
                component={NextLink}
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
                sx={{ color: "primary.main", fontWeight: 600, textDecoration: "underline", "&:hover": { color: "primary.dark" } }}
              >
                Privacy Policy
              </Typography>
              .
            </Typography>

            {error && (
              <Typography role="alert" variant="body2" color="error">
                {error}
              </Typography>
            )}

            <AppButton
              onClick={handleAccept}
              disabled={submitting}
              sx={{ alignSelf: "stretch" }}
            >
              {submitting ? "Saving..." : "I accept"}
            </AppButton>
          </Stack>
        </AppCard>
      </Stack>
    </AuthSplitLayout>
  );
}
