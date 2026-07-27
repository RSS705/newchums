"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import { AppButton, AppCard, AppTextField } from "@/components/ui";
import NCDatePicker from "@/components/fields/NCDatePicker";
import TurnstileWidget from "@/components/contact/TurnstileWidget";
import { trackEvent } from "@/lib/analytics";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 45;

export type SignupIntent = "going" | "maybe";

type Props = {
  /**
   * The URL to return the user to after verification (magic-link click or
   * code entry). Usually the current plan URL including share/invite token
   * and section=confirmation. The card appends its own `intent` param.
   */
  planUrlWithTokens: string;
  /** Plan title, for friendly copy. Optional. */
  planTitle?: string;
  /** Optional email to pre-fill (from an invite token). */
  prefillEmail?: string;
  /** Show a brief note that direct sign-in is an option. */
  showSignInHint?: boolean;
  /**
   * Pre-selected RSVP intent (e.g. from a `?rsvp=going` email CTA). When
   * set, the intent picker stage is skipped and the form opens with the
   * intent chip selected.
   */
  initialIntent?: SignupIntent | null;
};

type Stage =
  | { kind: "intent" }
  | { kind: "form" }
  | { kind: "code"; sentTo: string }
  | { kind: "existing_account"; email: string; loginUrl: string };

type CodeStatus =
  | { kind: "idle"; info?: string }
  | { kind: "verifying" }
  | { kind: "navigating" }
  | { kind: "error"; message: string; resendHint?: boolean };

/**
 * Lightweight plan-signup card (B1 intent-first flow). Shown on the plan
 * details page when an unauthenticated visitor arrives via a share or
 * invite token.
 *
 * Stages:
 *   intent -> Going / Maybe as the primary action, before any form.
 *   form   -> email + DOB + legal + captcha (intent changeable via chips).
 *   code   -> single 6-digit input; the email also carries a magic link
 *             that does the same thing. Resend with server-enforced
 *             cooldown; "Wrong email? Edit" returns to the form.
 *   existing_account -> sign-in panel, unchanged behavior from the
 *             pre-OTP flow (login round trip preserves the intent).
 *
 * On a correct code the server returns a one-time session grant which is
 * exchanged through the existing Auth.js magic-link provider, then the
 * page hard-navigates back to the plan (post-auth rule: session identity
 * changed, so no client-side route reuse). The plan page then applies the
 * intent through the normal RSVP endpoint, only if no RSVP exists yet.
 */
export default function PlanSignupCard({
  planUrlWithTokens,
  planTitle,
  prefillEmail,
  showSignInHint = true,
  initialIntent = null,
}: Props) {
  const [intent, setIntent] = React.useState<SignupIntent | null>(initialIntent);
  const [stage, setStage] = React.useState<Stage>(
    initialIntent ? { kind: "form" } : { kind: "intent" },
  );

  const [email, setEmail] = React.useState(prefillEmail ?? "");
  const [dob, setDob] = React.useState("");
  const [acceptedLegal, setAcceptedLegal] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  // Bumped when the user returns to the form from the code stage; remounts
  // the Turnstile widget because its previous token was consumed by the
  // earlier request.
  const [formEpoch, setFormEpoch] = React.useState(0);

  const [codeValue, setCodeValue] = React.useState("");
  const [codeStatus, setCodeStatus] = React.useState<CodeStatus>({ kind: "idle" });
  const [resending, setResending] = React.useState(false);
  const [cooldownUntil, setCooldownUntil] = React.useState<number | null>(null);
  const [cooldownNow, setCooldownNow] = React.useState(() => Date.now());

  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  // Invitee-funnel event: first interaction with the card, keyed to the
  // first focus of the email field. Once per mount.
  const formStartedRef = React.useRef(false);
  const handleEmailFocus = React.useCallback(() => {
    if (formStartedRef.current) return;
    formStartedRef.current = true;
    trackEvent("rsvp_form_started");
  }, []);

  const selectIntent = React.useCallback((next: SignupIntent) => {
    setIntent(next);
    trackEvent("rsvp_intent_selected", { status: next });
  }, []);

  /** Return URL with the current intent folded in. */
  const buildNextUrl = React.useCallback(
    (forIntent: SignupIntent | null) =>
      forIntent
        ? `${planUrlWithTokens}${planUrlWithTokens.includes("?") ? "&" : "?"}intent=${forIntent}`
        : planUrlWithTokens,
    [planUrlWithTokens],
  );

  // Cooldown ticker for the resend button. The immediate set keeps the first
  // render accurate (cooldownNow is otherwise stale from mount).
  React.useEffect(() => {
    if (cooldownUntil === null) return;
    setCooldownNow(Date.now());
    const id = window.setInterval(() => setCooldownNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);
  const cooldownRemaining = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000)) : 0;

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

    setSubmitting(true);
    setFormError(null);
    try {
      const res = await fetch(`${apiBase}/auth/plan-signup/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          date_of_birth: dob,
          accepted_legal: true,
          turnstile_token: turnstileToken ?? "",
          next: buildNextUrl(intent),
          intent: intent ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; state: "existing_account" | "pending"; next: string; resend_cooldown_seconds?: number }
        | { ok: false; error?: string; message?: string; retry_after_seconds?: number }
        | null;

      if (!data || !("ok" in data)) {
        setFormError("Something went wrong. Please try again.");
        return;
      }
      if (!data.ok) {
        const error = data.error ?? "";
        if (error === "UNDERAGE") {
          setFieldErrors({ dob: "NewChums is currently available to people 18 and older." });
          return;
        }
        if (error === "LEGAL_REQUIRED") {
          setFieldErrors({ legal: "Please agree to the Terms of Use and Privacy Policy." });
          return;
        }
        if (error === "INVALID_DATE" || error === "FUTURE_DATE") {
          setFieldErrors({ dob: "Please enter a valid date of birth." });
          return;
        }
        if (error === "INVALID_EMAIL") {
          setFieldErrors({ email: "Please enter a valid email address." });
          return;
        }
        if (error === "TURNSTILE_REQUIRED" || error === "TURNSTILE_FAILED") {
          setFieldErrors({ turnstile: "Verification failed. Please try again." });
          return;
        }
        if (error === "COOLDOWN") {
          // A code was sent moments ago (e.g. a quick double submit).
          // Move to the code stage and let the cooldown timer run.
          setStage({ kind: "code", sentTo: trimmedEmail });
          setCodeStatus({ kind: "idle", info: "We sent you a code a moment ago. Check your inbox." });
          setCooldownUntil(Date.now() + (data.retry_after_seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS) * 1000);
          return;
        }
        if (error === "RATE_LIMITED") {
          setFormError("Too many attempts. Please wait a few minutes and try again.");
          return;
        }
        setFormError(data.message ?? "Something went wrong. Please try again.");
        return;
      }

      // Funnel event: request accepted by the server. `result` mirrors the
      // server's state ("pending" = code emailed, "existing_account" =
      // verified account already exists). No email or other PII in params.
      trackEvent("rsvp_form_submitted", { result: data.state });

      if (data.state === "existing_account") {
        // Surface an inline explanation rather than hard-redirecting to /login
        // so the user isn't bounced without context. The button still lands
        // them on /login with `next` preserved (including the intent param)
        // so post-auth returns to the plan and can apply the intent if they
        // have no RSVP yet.
        const loginUrl = `/login?next=${encodeURIComponent(data.next)}&email=${encodeURIComponent(trimmedEmail)}`;
        setStage({ kind: "existing_account", email: trimmedEmail, loginUrl });
        return;
      }
      // state === "pending": the code email is on its way.
      setCodeValue("");
      setCodeStatus({ kind: "idle" });
      setStage({ kind: "code", sentTo: trimmedEmail });
      setCooldownUntil(Date.now() + (data.resend_cooldown_seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS) * 1000);
    } catch {
      setFormError("We couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const verifyCode = React.useCallback(
    async (sentTo: string, code: string) => {
      setCodeStatus({ kind: "verifying" });
      try {
        const res = await fetch(`${apiBase}/auth/plan-signup/verify-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: sentTo, code }),
        });
        const data = (await res.json().catch(() => null)) as
          | { ok: true; grant_token: string; intent: string | null; event_id: string | null }
          | { ok: false; error?: string; attempts_remaining?: number }
          | null;

        if (!data || !("ok" in data)) {
          setCodeStatus({ kind: "error", message: "Something went wrong. Please try again." });
          return;
        }
        if (!data.ok) {
          const error = data.error ?? "";
          if (error === "CODE_INCORRECT") {
            trackEvent("rsvp_otp_entered", { result: "wrong" });
            const remaining = data.attempts_remaining;
            setCodeValue("");
            setCodeStatus({
              kind: "error",
              message:
                remaining != null && remaining > 0
                  ? `That code doesn't match. ${remaining} ${remaining === 1 ? "try" : "tries"} left.`
                  : "That code doesn't match.",
            });
            return;
          }
          if (error === "CODE_EXPIRED") {
            trackEvent("rsvp_otp_entered", { result: "expired" });
            setCodeValue("");
            setCodeStatus({
              kind: "error",
              message: "That code has expired, or we sent a newer one. Tap Resend for a fresh code.",
              resendHint: true,
            });
            return;
          }
          if (error === "CODE_ATTEMPTS_EXCEEDED") {
            trackEvent("rsvp_otp_entered", { result: "capped" });
            setCodeValue("");
            setCodeStatus({
              kind: "error",
              message: "Too many tries with that code. Tap Resend to get a fresh one.",
              resendHint: true,
            });
            return;
          }
          if (error === "RATE_LIMITED") {
            setCodeStatus({ kind: "error", message: "Too many attempts. Please wait a few minutes and try again." });
            return;
          }
          if (error === "ACCOUNT_SUSPENDED") {
            setCodeStatus({ kind: "error", message: "Your account has been suspended. Please contact support." });
            return;
          }
          setCodeStatus({ kind: "error", message: "Something went wrong. Please try again." });
          return;
        }

        trackEvent("rsvp_otp_entered", { result: "ok" });
        // Exchange the one-time grant for a session via the existing
        // magic-link provider, then hard-navigate back to the plan. A full
        // navigation is required after the session identity changes; the
        // plan page applies the intent through the normal RSVP endpoint.
        const result = await signIn("magic-link", {
          email: sentTo,
          token: data.grant_token,
          redirect: false,
        });
        if (result?.error) {
          setCodeStatus({
            kind: "error",
            message: "Your code was right, but signing you in failed. Tap Resend and try once more.",
            resendHint: true,
          });
          return;
        }
        setCodeStatus({ kind: "navigating" });
        window.location.assign(buildNextUrl(intent));
      } catch {
        setCodeStatus({ kind: "error", message: "We couldn't reach the server. Please try again." });
      }
    },
    [apiBase, buildNextUrl, intent],
  );

  // Auto-submit once 6 digits are present. Errors clear the input, so this
  // cannot loop on the same wrong code.
  React.useEffect(() => {
    if (stage.kind !== "code") return;
    if (codeValue.length !== 6) return;
    if (codeStatus.kind === "verifying" || codeStatus.kind === "navigating") return;
    void verifyCode(stage.sentTo, codeValue);
  }, [codeValue, stage, codeStatus.kind, verifyCode]);

  async function handleResend(sentTo: string) {
    if (resending || cooldownRemaining > 0) return;
    setResending(true);
    try {
      const res = await fetch(`${apiBase}/auth/plan-signup/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sentTo, next: buildNextUrl(intent), intent: intent ?? undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true; resend_cooldown_seconds?: number }
        | { ok: false; error?: string; retry_after_seconds?: number }
        | null;
      if (data && "ok" in data && data.ok) {
        trackEvent("rsvp_code_resent");
        setCodeValue("");
        setCodeStatus({ kind: "idle", info: "New code sent. The old one no longer works." });
        setCooldownUntil(Date.now() + (data.resend_cooldown_seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS) * 1000);
      } else if (data && "ok" in data && !data.ok && data.error === "COOLDOWN") {
        setCooldownUntil(Date.now() + (data.retry_after_seconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS) * 1000);
      } else if (data && "ok" in data && !data.ok && data.error === "RATE_LIMITED") {
        setCodeStatus({ kind: "error", message: "Too many emails requested. Please wait a few minutes." });
      } else {
        setCodeStatus({ kind: "error", message: "We couldn't send a new code. Please try again." });
      }
    } catch {
      setCodeStatus({ kind: "error", message: "We couldn't reach the server. Please try again." });
    } finally {
      setResending(false);
    }
  }

  // Quiet tertiary-action treatment (matches the PlanFeedback footer links):
  // plain text on transparent, never the theme's peach text-button fill, so
  // these read as quiet escapes rather than competing with real buttons.
  const quietActionSx = {
    textTransform: "none",
    fontWeight: 600,
    fontSize: "0.8125rem",
    color: "text.secondary",
    backgroundColor: "transparent",
    "&:hover": { bgcolor: "action.hover", color: "text.primary" },
    "&.Mui-disabled": { backgroundColor: "transparent", color: "text.disabled" },
  } as const;

  const renderIntentChips = (centered: boolean) => (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      useFlexGap
      flexWrap="wrap"
      justifyContent={centered ? "center" : "flex-start"}
    >
      <Typography variant="body2" color="text.secondary">
        Your answer:
      </Typography>
      <Chip
        icon={<CheckCircleRoundedIcon />}
        label="Going"
        color={intent === "going" ? "primary" : "default"}
        variant={intent === "going" ? "filled" : "outlined"}
        onClick={() => selectIntent("going")}
        size="small"
      />
      <Chip
        icon={<HelpOutlineRoundedIcon />}
        label="Maybe"
        color={intent === "maybe" ? "primary" : "default"}
        variant={intent === "maybe" ? "filled" : "outlined"}
        onClick={() => selectIntent("maybe")}
        size="small"
      />
    </Stack>
  );

  // ── Stage: intent picker ───────────────────────────────────────────────
  if (stage.kind === "intent") {
    return (
      <AppCard sx={{ width: "100%" }}>
        <Stack spacing={2}>
          <Box>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" }, mb: 0.5 }}
            >
              {planTitle ? `Are you in for ${planTitle}?` : "Are you in?"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Pick your answer. You&apos;ll confirm your email right here to lock it in.
            </Typography>
          </Box>
          {/* Constrained action area: equal-width pair on desktop instead of
              two buttons stretching the full card, stacked on mobile. */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{ width: "100%", maxWidth: 560 }}
          >
            <AppButton
              variant="contained"
              fullWidth
              startIcon={<CheckCircleRoundedIcon />}
              onClick={() => {
                selectIntent("going");
                setStage({ kind: "form" });
              }}
              sx={{ flex: "1 1 0" }}
            >
              I&apos;m going
            </AppButton>
            <AppButton
              variant="outlined"
              fullWidth
              startIcon={<HelpOutlineRoundedIcon />}
              onClick={() => {
                selectIntent("maybe");
                setStage({ kind: "form" });
              }}
              sx={{ flex: "1 1 0" }}
            >
              Maybe
            </AppButton>
          </Stack>
          <Button
            variant="text"
            size="small"
            onClick={() => setStage({ kind: "form" })}
            sx={{ ...quietActionSx, alignSelf: "flex-start", ml: -0.75 }}
          >
            Not sure yet? Continue without answering
          </Button>
        </Stack>
      </AppCard>
    );
  }

  // ── Stage: code entry ──────────────────────────────────────────────────
  if (stage.kind === "code") {
    const busy = codeStatus.kind === "verifying" || codeStatus.kind === "navigating";
    return (
      <AppCard
        sx={(theme) => ({
          width: "100%",
          // Theme tokens, not hardcoded hex: the warm wash has to invert with
          // the palette or the text becomes unreadable in dark mode.
          background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.background.paper} 65%)`,
          borderColor: theme.palette.primary.light,
        })}
      >
        <Stack spacing={2}>
          <Stack spacing={1} alignItems="center" sx={{ textAlign: "center" }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                bgcolor: "primary.main",
                color: "primary.contrastText",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 14px rgba(230, 91, 19, 0.35)",
              }}
            >
              {codeStatus.kind === "navigating" ? (
                <CelebrationRoundedIcon sx={{ fontSize: 28 }} />
              ) : (
                <MarkEmailReadRoundedIcon sx={{ fontSize: 28 }} />
              )}
            </Box>
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" } }}
            >
              {codeStatus.kind === "navigating" ? "You're verified" : "Enter your code"}
            </Typography>
            {codeStatus.kind === "navigating" ? (
              <Typography variant="body1" color="text.primary">
                Taking you back to the plan{intent ? " to lock in your RSVP" : ""}.
              </Typography>
            ) : (
              <>
                <Typography variant="body1" color="text.primary" sx={{ wordBreak: "break-word" }}>
                  We sent a 6-digit code to <strong>{stage.sentTo}</strong>.
                </Typography>
                <Button
                  variant="text"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    // Turnstile tokens are single use; remount the widget for
                    // the re-submit.
                    setFormEpoch((n) => n + 1);
                    setTurnstileToken(null);
                    setCodeValue("");
                    setCodeStatus({ kind: "idle" });
                    setStage({ kind: "form" });
                  }}
                  sx={quietActionSx}
                >
                  Wrong email? Edit
                </Button>
              </>
            )}
          </Stack>

          {codeStatus.kind !== "navigating" && (
            <>
              {renderIntentChips(true)}
              {/* Single centered column: chips, input, status, and actions all
                  share one axis. The flex wrapper does the centering (auto
                  margins do not win against the parent Stack's stretch).
                  Input mechanics are unchanged; only the width constraint and
                  digit sizing are presentational. */}
              <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <Box sx={{ width: "100%", maxWidth: 340 }}>
                <AppTextField
                  label="6-digit code"
                  value={codeValue}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setCodeValue(digits);
                    if (codeStatus.kind === "error") setCodeStatus({ kind: "idle" });
                  }}
                  fullWidth
                  disabled={busy}
                  error={codeStatus.kind === "error"}
                  slotProps={{
                    htmlInput: {
                      inputMode: "numeric",
                      pattern: "[0-9]*",
                      autoComplete: "one-time-code",
                      maxLength: 6,
                      style: { letterSpacing: "0.45em", fontSize: "1.5rem", textAlign: "center" },
                      "aria-label": "6-digit code from your email",
                    },
                  }}
                />
              </Box>
              </Box>
              <Typography
                variant="body2"
                role="status"
                aria-live="polite"
                color={codeStatus.kind === "error" ? "error" : "text.secondary"}
                sx={{ minHeight: 20, textAlign: "center" }}
              >
                {codeStatus.kind === "verifying"
                  ? "Checking your code..."
                  : codeStatus.kind === "error"
                    ? codeStatus.message
                    : codeStatus.info ?? ""}
              </Typography>

              <Stack spacing={0.75} alignItems="center">
                <Button
                  variant="text"
                  size="small"
                  disabled={busy || resending || cooldownRemaining > 0}
                  onClick={() => void handleResend(stage.sentTo)}
                  sx={{
                    ...quietActionSx,
                    // Once the countdown hits zero this reads as a real action.
                    color: "primary.main",
                    "&:hover": { bgcolor: "action.hover", color: "primary.dark" },
                  }}
                >
                  {resending
                    ? "Sending..."
                    : cooldownRemaining > 0
                      ? `Resend code (${cooldownRemaining}s)`
                      : "Resend code"}
                </Button>
                <Typography variant="caption" color="text.disabled" align="center">
                  You can also use the one-tap button in the email. Not seeing it? Check spam or promotions.
                </Typography>
              </Stack>
            </>
          )}
        </Stack>
      </AppCard>
    );
  }

  // ── Stage: existing account ────────────────────────────────────────────
  if (stage.kind === "existing_account") {
    return (
      <AppCard
        sx={(theme) => ({
          width: "100%",
          // Theme tokens, not hardcoded hex: the warm wash has to invert with
          // the palette or the text becomes unreadable in dark mode.
          background: `linear-gradient(135deg, ${theme.palette.primary.light} 0%, ${theme.palette.background.paper} 65%)`,
          borderColor: theme.palette.primary.light,
        })}
      >
        <Stack spacing={2} alignItems="center" sx={{ py: 1, textAlign: "center" }}>
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
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
          <Typography variant="body1" color="text.primary" sx={{ wordBreak: "break-word" }}>
            Sign in as <strong>{stage.email}</strong> to RSVP
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
              window.location.href = stage.loginUrl;
            }}
          >
            Sign in to continue
          </AppButton>
          <Button
            variant="text"
            size="small"
            onClick={() => {
              setFormEpoch((n) => n + 1);
              setTurnstileToken(null);
              setStage({ kind: "form" });
            }}
            sx={quietActionSx}
          >
            Use a different email
          </Button>
        </Stack>
      </AppCard>
    );
  }

  // ── Stage: form ────────────────────────────────────────────────────────
  return (
    <AppCard sx={{ width: "100%" }}>
      <Stack spacing={2}>
        <Box>
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ fontSize: { xs: "1.25rem", sm: "1.375rem" }, mb: 0.5 }}
          >
            {intent
              ? "Lock in your RSVP"
              : planTitle
                ? `RSVP to ${planTitle}`
                : "RSVP to this plan"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter your email and birthday. We&apos;ll email you a 6-digit code to confirm.
          </Typography>
        </Box>

        {renderIntentChips(false)}

        <AppTextField
          label="Your email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={handleEmailFocus}
          error={Boolean(fieldErrors.email)}
          helperText={fieldErrors.email ?? null}
          fullWidth
          autoComplete="email"
          disabled={submitting}
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
          disabled={submitting}
          noTopMargin
        />

        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
                disabled={submitting}
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
          <Box key={formEpoch}>
            <TurnstileWidget siteKey={turnstileSiteKey} onVerify={(t) => setTurnstileToken(t)} />
            {fieldErrors.turnstile && (
              <FormHelperText error>{fieldErrors.turnstile}</FormHelperText>
            )}
          </Box>
        )}

        {formError && (
          <Typography variant="body2" color="error" role="status" aria-live="polite">
            {formError}
          </Typography>
        )}

        <AppButton
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting}
          startIcon={
            submitting ? <CircularProgress size={16} color="inherit" /> : undefined
          }
          fullWidth
        >
          {submitting ? "Sending..." : "Send my code"}
        </AppButton>

        {showSignInHint && (
          <Typography variant="caption" color="text.secondary" align="center">
            Already have a NewChums account?{" "}
            <Link href={`/login?next=${encodeURIComponent(buildNextUrl(intent))}`}>
              Sign in
            </Link>
            .
          </Typography>
        )}
      </Stack>
    </AppCard>
  );
}
