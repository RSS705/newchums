"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
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
  | { kind: "existing_account"; email: string; loginUrl: string }
  | { kind: "check_your_email"; email: string }
  | { kind: "error"; message: string };

/**
 * Lightweight plan-signup card. Shown on the plan details page when an
 * unauthenticated visitor arrives via a share or invite token. Collects
 * email + DOB + legal acceptance in a single form, then either:
 *   - shows an "existing account" panel with a Sign in CTA back to /login
 *     (with email prefilled and the plan URL preserved via `next`) when the
 *     email already belongs to a verified account,
 *   - flips into a "check your email" confirmation state when a new
 *     magic link was issued for a fresh / unverified account.
 *
 * The flow never collects a password: the magic link sent by the server
 * signs the user in and routes them back to the plan. They can set a
 * password later from Settings, or use "Forgot password" any time to
 * establish one.
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
        // Surface an inline explanation rather than hard-redirecting to /login
        // so the user isn't bounced without context. The button still lands
        // them on /login with `next` preserved so post-auth returns to the
        // plan. Email is prefilled for a one-click sign-in.
        const loginUrl = `/login?next=${encodeURIComponent(data.next)}&email=${encodeURIComponent(trimmedEmail)}`;
        setStatus({ kind: "existing_account", email: trimmedEmail, loginUrl });
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
      <AppCard
        sx={{
          width: "100%",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          borderColor: "primary.light",
        }}
      >
        <Stack spacing={2} alignItems="center" sx={{ py: 1, textAlign: "center" }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(230, 91, 19, 0.35)",
            }}
          >
            <MarkEmailReadRoundedIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
          >
            Check your email
          </Typography>
          <Typography variant="body1" color="text.primary">
            We sent a verification link to <strong>{status.email}</strong>.
            Open it to finish setting up your account, then you&apos;ll land
            back on{" "}
            {planTitle ? <strong>{planTitle}</strong> : "the plan"} where you
            can choose your RSVP.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Didn&apos;t see it? Check your spam or promotions folder.
          </Typography>
        </Stack>
      </AppCard>
    );
  }

  if (status.kind === "existing_account") {
    return (
      <AppCard
        sx={{
          width: "100%",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          borderColor: "primary.light",
        }}
      >
        <Stack spacing={2} alignItems="center" sx={{ py: 1, textAlign: "center" }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 14px rgba(230, 91, 19, 0.35)",
            }}
          >
            <LockPersonRoundedIcon sx={{ fontSize: 32 }} />
          </Box>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
          >
            You already have a NewChums account
          </Typography>
          <Typography variant="body1" color="text.primary">
            Sign in as <strong>{status.email}</strong> to RSVP
            {planTitle ? <> for <strong>{planTitle}</strong></> : null}.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            We&apos;ve also emailed you a sign-in link in case that&apos;s
            easier. Either way, you&apos;ll come straight back to this plan.
          </Typography>
          <AppButton
            variant="contained"
            fullWidth
            onClick={() => {
              window.location.href = status.loginUrl;
            }}
          >
            Sign in to continue
          </AppButton>
          <Button
            variant="text"
            size="small"
            onClick={() => setStatus({ kind: "idle" })}
            sx={{ textTransform: "none", color: "text.secondary" }}
          >
            Use a different email
          </Button>
        </Stack>
      </AppCard>
    );
  }

  return (
    <AppCard sx={{ width: "100%" }}>
      <Stack spacing={2}>
        <Box>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" }, mb: 0.5 }}
          >
            {planTitle ? `RSVP to ${planTitle}` : "RSVP to this plan"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Just your email and date of birth to get you in. We&apos;ll send a
            one-click link to verify your address and bring you right back to
            this plan to RSVP. You can set a password once you&apos;re in.
          </Typography>
        </Box>

        <AppTextField
          label="Your email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email ?? null}
          fullWidth
          autoComplete="email"
          disabled={status.kind === "submitting"}
        />

        <NCDatePicker
          label="Date of birth"
          value={dob}
          onChange={setDob}
          error={Boolean(fieldErrors.dob)}
          helperText={
            fieldErrors.dob ??
            "NewChums is currently limited to people 18 and older."
          }
          disabled={status.kind === "submitting"}
          noTopMargin
        />

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
          {status.kind === "submitting" ? "Sending your link..." : "Email me a sign-in link"}
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
