"use client";

import * as React from "react";
import { signIn } from "next-auth/react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CircularProgress from "@mui/material/CircularProgress";
import FormHelperText from "@mui/material/FormHelperText";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CelebrationRoundedIcon from "@mui/icons-material/CelebrationRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import HelpOutlineRoundedIcon from "@mui/icons-material/HelpOutlineRounded";
import RadioButtonUncheckedRoundedIcon from "@mui/icons-material/RadioButtonUncheckedRounded";
import LockPersonRoundedIcon from "@mui/icons-material/LockPersonRounded";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";
import { AppButton, AppCard, AppTextField } from "@/components/ui";
import NCDatePicker from "@/components/fields/NCDatePicker";
import TurnstileWidget from "@/components/contact/TurnstileWidget";
import LegalConsentNotice from "@/components/legal/LegalConsentNotice";
import { trackEvent } from "@/lib/analytics";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 45;

/** Segmented 6-box code input. The value is a plain digit string that fills
 *  left to right (no holes): typing appends and advances, Backspace removes
 *  the last digit and steps back, pasting distributes, and focusing any box
 *  snaps to the first empty one. The parent still owns the value, so the
 *  existing auto-verify-at-6-digits effect is untouched. */
function CodeDigitsInput({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const activeIndex = Math.min(value.length, 5);

  const appendDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    const next = (value + digits).slice(0, 6);
    onChange(next);
    refs.current[Math.min(next.length, 5)]?.focus();
  };

  return (
    <Stack
      direction="row"
      spacing={{ xs: 0.75, sm: 1 }}
      justifyContent="center"
      // One group semantically; each box labels itself for screen readers.
      role="group"
      aria-label="6-digit code from your email"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Box
          key={i}
          component="input"
          ref={(el: HTMLInputElement | null) => { refs.current[i] = el; }}
          value={value[i] ?? ""}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of 6`}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            // Under fast typing a keystroke can land in a box that already
            // shows its digit (focus advances asynchronously), so the raw
            // target value may include the stored digit. Strip that prefix
            // and append only what is genuinely new (covers single keys,
            // autofill, and paste runs alike).
            const raw = e.target.value.replace(/\D/g, "");
            const current = value[i] ?? "";
            const fresh = current && raw.startsWith(current) ? raw.slice(current.length) : raw;
            appendDigits(fresh);
          }}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Backspace") {
              e.preventDefault();
              if (value.length === 0) return;
              const next = value.slice(0, -1);
              onChange(next);
              refs.current[Math.min(next.length, 5)]?.focus();
            }
          }}
          onPaste={(e: React.ClipboardEvent<HTMLInputElement>) => {
            e.preventDefault();
            appendDigits(e.clipboardData.getData("text"));
          }}
          onFocus={() => {
            // No holes: focus always lands on the first empty box.
            if (i !== activeIndex) refs.current[activeIndex]?.focus();
          }}
          sx={{
            width: { xs: 38, sm: 46 },
            height: { xs: 48, sm: 56 },
            p: 0,
            textAlign: "center",
            fontSize: { xs: "1.25rem", sm: "1.5rem" },
            fontWeight: 700,
            fontFamily: "inherit",
            color: "text.primary",
            bgcolor: "background.paper",
            border: "2px solid",
            borderColor: error ? "error.main" : i === activeIndex && !disabled ? "primary.main" : "divider",
            borderRadius: 2,
            outline: "none",
            caretColor: "transparent",
            transition: "border-color 120ms ease",
            "&:focus": { borderColor: error ? "error.main" : "primary.main" },
            "&:disabled": { opacity: 0.6 },
          }}
        />
      ))}
    </Stack>
  );
}

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
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  // Bumped when the user returns to the form from the code stage; remounts
  // the Turnstile widget because its previous token was consumed by the
  // earlier request.
  const [formEpoch, setFormEpoch] = React.useState(0);

  const [codeValue, setCodeValue] = React.useState("");
  const [codeFocused, setCodeFocused] = React.useState(false);
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

  // Quiet tertiary-action treatment (matches the PlanWrapUp footer links):
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

  // One shared spacing and type rhythm across every stage so the four stages
  // read as a single component rather than four unrelated panels.
  const STAGE_SPACING = 1.75;
  const HEADER_SPACING = 0.75;
  // Base rhythm for the code stage: every gap there is a multiple of this.
  const CODE_UNIT = 1;
  const headingSx = { fontSize: { xs: "1.125rem", sm: "1.25rem" } } as const;
  // Theme shadow rather than a hardcoded brand-orange glow, so the badge
  // stays correct under the dark palette.
  const heroBadgeSx = {
    width: 44,
    height: 44,
    borderRadius: "50%",
    bgcolor: "primary.main",
    color: "primary.contrastText",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: 2,
  } as const;

  // Answer control on the form stage. A first-class field: same label
  // treatment as the text fields under it, same height, two equal columns.
  // ToggleButtonGroup gives a grouped set of pressed-state buttons, so the
  // accessibility tree expresses "one of two" and keyboard reachability is
  // native. Selected state differs by fill, weight, border, AND a check
  // icon, so it never depends on hue alone.
  const answerOption = (value: SignupIntent, label: string) => {
    const selected = intent === value;
    return (
      <ToggleButton
        value={value}
        aria-label={label}
        sx={{
          flex: "1 1 0",
          height: 56,
          borderRadius: 2,
          textTransform: "none",
          fontSize: "1rem",
          fontWeight: selected ? 700 : 500,
          gap: 0.75,
          color: "text.secondary",
          borderColor: "divider",
          // MUI's own .Mui-selected rule wins on specificity, so the selected
          // treatment has to be declared there. Fill + weight + border + the
          // check icon all change together, so the state never depends on
          // hue alone. text.primary keeps contrast correct on either palette.
          "&.Mui-selected": {
            bgcolor: "primary.light",
            color: "text.primary",
            borderColor: "primary.main",
            borderWidth: 2,
            "&:hover": { bgcolor: "primary.light" },
          },
        }}
      >
        {selected ? (
          <CheckCircleRoundedIcon sx={{ fontSize: 20 }} />
        ) : (
          <RadioButtonUncheckedRoundedIcon sx={{ fontSize: 20, opacity: 0.65 }} />
        )}
        {label}
      </ToggleButton>
    );
  };

  const answerField = (
    <Box>
      <Typography
        component="span"
        id="plan-signup-answer-label"
        variant="subtitle1"
        fontWeight={600}
        sx={{ display: "block", mb: 0.625 }}
      >
        Your answer
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={intent}
        aria-labelledby="plan-signup-answer-label"
        onChange={(_, next) => {
          // Exclusive groups emit null when the active button is re-pressed;
          // keep the current answer rather than clearing it.
          if (next === "going" || next === "maybe") selectIntent(next);
        }}
        sx={{ display: "flex", gap: 1, "& .MuiToggleButtonGroup-grouped": { border: 1, borderRadius: 2 } }}
      >
        {answerOption("going", "Going")}
        {answerOption("maybe", "Maybe")}
      </ToggleButtonGroup>
    </Box>
  );

  // ── Stage: intent picker ───────────────────────────────────────────────
  if (stage.kind === "intent") {
    return (
      <AppCard sx={{ width: "100%" }}>
        <Stack spacing={STAGE_SPACING}>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ ...headingSx, mb: 0.5 }}>
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
    const statusMessage =
      codeStatus.kind === "verifying"
        ? "Checking your code..."
        : codeStatus.kind === "error"
          ? codeStatus.message
          : (codeStatus.kind === "idle" ? codeStatus.info : null) ?? "";
    const reserveStatusLine = Boolean(statusMessage) || codeFocused || codeValue.length > 0;
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
        {/* One rhythm for this whole stage: CODE_UNIT (8px). Lines that
            belong together sit at 1 unit, groups are separated by 2 units,
            and no gap exceeds the header-to-content gap. */}
        <Stack spacing={CODE_UNIT * 2}>
          <Stack spacing={CODE_UNIT} alignItems="center" sx={{ textAlign: "center" }}>
            <Box sx={heroBadgeSx}>
              {codeStatus.kind === "navigating" ? (
                <CelebrationRoundedIcon sx={{ fontSize: 22 }} />
              ) : (
                <MarkEmailReadRoundedIcon sx={{ fontSize: 22 }} />
              )}
            </Box>
            <Typography variant="h5" fontWeight={700} sx={headingSx}>
              {codeStatus.kind === "navigating" ? "You're verified" : "Enter your code"}
            </Typography>
            {codeStatus.kind === "navigating" ? (
              <Typography variant="body2" color="text.secondary">
                Taking you back to the plan{intent ? " to lock in your RSVP" : ""}.
              </Typography>
            ) : (
              /* The edit action sits inline at the end of the sentence it
                 refers to, so it reads as part of that line instead of
                 floating as its own row and manufacturing a gap. Its own
                 padding is neutralised for the same reason. */
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                We sent a 6-digit code to <strong>{stage.sentTo}</strong>.{" "}
                <Box
                  component="button"
                  type="button"
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
                  sx={{
                    p: 0,
                    m: 0,
                    minWidth: 0,
                    border: 0,
                    background: "none",
                    font: "inherit",
                    color: "primary.main",
                    fontWeight: 700,
                    textDecoration: "underline",
                    cursor: "pointer",
                    "&:hover": { color: "primary.dark" },
                    "&:disabled": { color: "text.disabled", cursor: "default" },
                    "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2 },
                  }}
                >
                  Wrong email? Edit
                </Box>
              </Typography>
            )}
          </Stack>

          {codeStatus.kind !== "navigating" && (
            <>
              {/* The input is the optical centre: one unit of air above it
                  (from the recap) and one below (to the resend group), with
                  the status pinned tight underneath like helper text. */}
              <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
                <Stack spacing={CODE_UNIT * 2} sx={{ width: "100%", maxWidth: 320 }}>
                  {intent && (
                    <Box
                      sx={{
                        alignSelf: "center",
                        px: 1.25,
                        py: 0.375,
                        borderRadius: 5,
                        bgcolor: "primary.light",
                        color: "primary.dark",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        lineHeight: 1.4,
                      }}
                    >
                      RSVP: {intent === "going" ? "Going" : "Maybe"}
                    </Box>
                  )}
                  <Box
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                  >
                    <CodeDigitsInput
                      value={codeValue}
                      onChange={(digits) => {
                        setCodeValue(digits);
                        if (codeStatus.kind === "error") setCodeStatus({ kind: "idle" });
                      }}
                      disabled={busy}
                      error={codeStatus.kind === "error"}
                    />
                    {/* Live region is always mounted for screen readers. Its
                        line is reserved as soon as the field is focused or has
                        digits in it, so a message appearing or clearing while
                        the user is working never shifts the layout, but the
                        untouched state does not carry an empty band of dead
                        space under the input. */}
                    <Typography
                      variant="body2"
                      role="status"
                      aria-live="polite"
                      color={codeStatus.kind === "error" ? "error" : "text.secondary"}
                      sx={{
                        textAlign: "center",
                        lineHeight: "18px",
                        mt: reserveStatusLine ? 0.5 : 0,
                        minHeight: reserveStatusLine ? 18 : 0,
                      }}
                    >
                      {statusMessage}
                    </Typography>
                  </Box>
                </Stack>
              </Box>

              <Stack spacing={0.5} alignItems="center">
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
                  Not seeing it? Check spam, or tap the button in the email.
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
        <Stack spacing={STAGE_SPACING} alignItems="center" sx={{ textAlign: "center" }}>
          <Stack spacing={HEADER_SPACING} alignItems="center">
            <Box sx={heroBadgeSx}>
              <LockPersonRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Typography variant="h5" fontWeight={700} sx={headingSx}>
              You already have a NewChums account
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
              Sign in as <strong>{stage.email}</strong> to RSVP
              {planTitle ? <> for <strong>{planTitle}</strong></> : null}.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              We&apos;ve also emailed you a sign-in link in case that&apos;s
              easier. Either way, you&apos;ll come straight back to this plan.
            </Typography>
          </Stack>
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
      <Stack spacing={STAGE_SPACING}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ ...headingSx, mb: 0.5 }}>
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

        {answerField}

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

        <LegalConsentNotice action="continuing" />

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
