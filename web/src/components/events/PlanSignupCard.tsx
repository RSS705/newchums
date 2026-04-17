"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppButton, AppCard, AppTextField } from "@/components/ui";
import NCDatePicker from "@/components/fields/NCDatePicker";
import TurnstileWidget from "@/components/contact/TurnstileWidget";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  /** The URL to return the user to after magic-link click. Usually the current plan URL including share/invite token. */
  planUrlWithTokens: string;
  /** Plan title, for friendly copy. Optional. */
  planTitle?: string;
  /** Optional email to pre-fill (from an invite token). */
  prefillEmail?: string;
  /** Show a brief note that direct sign-in is an option. */
  showSignInHint?: boolean;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "check_your_email"; email: string }
  | { kind: "error"; message: string };

/**
 * Lightweight plan-signup card. Shown on the plan details page when an
 * unauthenticated visitor arrives via a share or invite token. Collects
 * email + DOB + legal acceptance in a single form, then either:
 *   - routes to /login?next=... when the email already belongs to a
 *     verified account
 *   - flips into a "check your email" confirmation state when a new
 *     magic link was issued
 */
export default function PlanSignupCard({
  planUrlWithTokens,
  planTitle,
  prefillEmail,
  showSignInHint = true,
}: Props) {
  const [email, setEmail] = React.useState(prefillEmail ?? "");
  const [dob, setDob] = React.useState("");
  const [acceptedLegal, setAcceptedLegal] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  async function handleSubmit() {
    const nextErrors: Record<string, string> = {};
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !EMAIL_RE.test(trimmedEmail)) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!dob) {
      nextErrors.dob = "Please enter your date of birth.";
    }
    if (!acceptedLegal) {
      nextErrors.legal = "Please agree to the Terms of Use and Privacy Policy.";
    }
    if (turnstileSiteKey && !turnstileToken) {
      nextErrors.turnstile = "Please complete the verification.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setStatus({ kind: "submitting" });
    try {
      const res = await fetch(`${apiBase}/auth/plan-signup/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          date_of_birth: dob,
          accepted_legal: true,
          turnstile_token: turnstileToken ?? "",
          next: planUrlWithTokens,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            ok: true;
            state: "existing_account" | "pending";
            next: string;
          }
        | { ok: false; error?: string; message?: string }
        | null;

      if (!data || !("ok" in data)) {
        setStatus({ kind: "error", message: "Something went wrong. Please try again." });
        return;
      }
      if (!data.ok) {
        const error = data.error ?? "";
        if (error === "UNDERAGE") {
          setFieldErrors({ dob: "NewChums is currently available to people 18 and older." });
          setStatus({ kind: "idle" });
          return;
        }
        if (error === "LEGAL_REQUIRED") {
          setFieldErrors({ legal: "Please agree to the Terms of Use and Privacy Policy." });
          setStatus({ kind: "idle" });
          return;
        }
        if (error === "INVALID_DATE" || error === "FUTURE_DATE") {
          setFieldErrors({ dob: "Please enter a valid date of birth." });
          setStatus({ kind: "idle" });
          return;
        }
        if (error === "INVALID_EMAIL") {
          setFieldErrors({ email: "Please enter a valid email address." });
          setStatus({ kind: "idle" });
          return;
        }
        if (error === "TURNSTILE_REQUIRED" || error === "TURNSTILE_FAILED") {
          setFieldErrors({ turnstile: "Verification failed. Please try again." });
          setStatus({ kind: "idle" });
          return;
        }
        if (error === "RATE_LIMITED") {
          setStatus({
            kind: "error",
            message: "Too many attempts. Please wait a few minutes and try again.",
          });
          return;
        }
        setStatus({
          kind: "error",
          message: data.message ?? "Something went wrong. Please try again.",
        });
        return;
      }

      if (data.state === "existing_account") {
        // Existing verified account: route to /login so they can sign in and come back.
        window.location.href = `/login?next=${encodeURIComponent(data.next)}`;
        return;
      }
      // state === "pending"
      setStatus({ kind: "check_your_email", email: trimmedEmail });
    } catch {
      setStatus({ kind: "error", message: "We couldn't reach the server. Please try again." });
    }
  }

  if (status.kind === "check_your_email") {
    return (
      <AppCard sx={{ width: "100%" }}>
        <Stack spacing={1.5}>
          <Typography variant="h6" fontWeight={600}>
            Check your email
          </Typography>
          <Typography variant="body1" color="text.secondary">
            We sent a confirmation link to <strong>{status.email}</strong>. Click it to
            finish and return to {planTitle ? <strong>{planTitle}</strong> : "the plan"}.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            If you opened this page on a different device, just continue there after
            clicking the link. Closing this tab is fine.
          </Typography>
        </Stack>
      </AppCard>
    );
  }

  return (
    <AppCard sx={{ width: "100%" }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={600}>
            Join to RSVP
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Quick sign-up. We&rsquo;ll email you a link to confirm and send you back to
            the plan.
          </Typography>
        </Box>

        <AppTextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email}
          fullWidth
          autoComplete="email"
          disabled={status.kind === "submitting"}
        />

        <Box>
          <NCDatePicker
            label="Date of birth"
            value={dob}
            onChange={setDob}
            error={Boolean(fieldErrors.dob)}
            helperText={
              fieldErrors.dob ??
              "We ask for your date of birth because NewChums is currently limited to people 18 and older."
            }
            disabled={status.kind === "submitting"}
            noTopMargin
          />
        </Box>

        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                disabled={status.kind === "submitting"}
              />
            }
            label={
              <Typography variant="body2">
                I agree to the{" "}
                <Link href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Use
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </Link>
                .
              </Typography>
            }
          />
          {fieldErrors.legal && (
            <FormHelperText error sx={{ ml: 3.5 }}>
              {fieldErrors.legal}
            </FormHelperText>
          )}
        </Box>

        {turnstileSiteKey && (
          <Box>
            <TurnstileWidget siteKey={turnstileSiteKey} onVerify={(t) => setTurnstileToken(t)} />
            {fieldErrors.turnstile && (
              <FormHelperText error>{fieldErrors.turnstile}</FormHelperText>
            )}
          </Box>
        )}

        {status.kind === "error" && (
          <Typography variant="body2" color="error">
            {status.message}
          </Typography>
        )}

        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={status.kind === "submitting"}
          startIcon={
            status.kind === "submitting" ? <CircularProgress size={16} color="inherit" /> : undefined
          }
          fullWidth
        >
          {status.kind === "submitting" ? "Sending..." : "Send me a confirmation email"}
        </AppButton>

        {showSignInHint && (
          <Typography variant="caption" color="text.secondary" align="center">
            Already have a NewChums account?{" "}
            <Link href={`/login?next=${encodeURIComponent(planUrlWithTokens)}`}>
              Sign in
            </Link>
            .
          </Typography>
        )}
      </Stack>
    </AppCard>
  );
}
