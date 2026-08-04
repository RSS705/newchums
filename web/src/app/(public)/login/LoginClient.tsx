"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import AuthDividerForm from "@/components/auth/AuthDividerForm";
import AuthErrorBanner from "@/components/auth/AuthErrorBanner";
import AuthField from "@/components/auth/AuthField";
import AuthFooterLink from "@/components/auth/AuthFooterLink";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import LegalConsentNotice from "@/components/legal/LegalConsentNotice";
import TurnstileWidget from "@/components/contact/TurnstileWidget";
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";
import GlobalStyles from "@mui/material/GlobalStyles";
import MarkEmailReadRoundedIcon from "@mui/icons-material/MarkEmailReadRounded";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [emailUnverified, setEmailUnverified] = React.useState(false);
  const [suspended, setSuspended] = React.useState(false);
  // Email-link sign-in is the primary method: it works for every account,
  // including the growing share created passwordless through the plan-signup
  // flow, who used to be led straight into a password form that could only
  // fail. Password entry stays available behind one tap.
  // Both sign-in paths render at once (Aug 2026): the email link as the
  // primary action, the password field visible below it. The old
  // link/password toggle hid the password field behind a text link, which
  // read as a broken page to returning password users.
  const [linkNotice, setLinkNotice] = React.useState<string | null>(null);
  const [linkStatus, setLinkStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  // Latch that says "fire the sign-in link as soon as we have everything we
  // need." Set when the credentials submit returns PasswordSetupPending so
  // the user doesn't have to click a separate button; cleared the instant
  // the actual fetch runs so we don't auto-fire on every re-render.
  const [autoSendPending, setAutoSendPending] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  // Bumped whenever a token is consumed (tokens are single use); keying the
  // widget on it forces a remount so a fresh token is issued and the visible
  // widget state always matches the token we actually hold. Mirrors the
  // formEpoch pattern in PlanSignupCard.
  const [turnstileEpoch, setTurnstileEpoch] = React.useState(0);
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  const emailPrefill = searchParams.get("email");
  const nextParam = searchParams.get("next");
  const errorParam = searchParams.get("error");
  const resetSuccess = searchParams.get("reset") === "success";
  const emailChanged = searchParams.get("emailChanged") === "1";
  const redirectTarget = getSafeRedirectPath(nextParam);

  const isSuspendedParam =
    errorParam === "AccountSuspended" ||
    errorParam === "OAuthAccountSuspended" ||
    errorParam === "UserSuspended";

  React.useEffect(() => {
    if (emailPrefill) {
      setEmail(emailPrefill);
    }
  }, [emailPrefill]);

  React.useEffect(() => {
    if (emailChanged) {
      signOut({ redirect: false });
    }
  }, [emailChanged]);

  // Autofill lands without the events React listens to. Chrome fills saved
  // credentials before hydration, and password managers write values
  // directly, so React can hold "" while a real password sits in the field:
  // the page then offers a sign-in link to someone who has a password right
  // in front of them, and pressing it emails them instead of signing them
  // in. (It appeared to "fix itself on click" because the click was the
  // first event that made the browser commit the fill.) These read the DOM
  // back into state; every write happens inside an async callback, never
  // synchronously in the effect body.
  const syncAutofilledFields = React.useCallback(() => {
    const emailEl = document.getElementById("login-email") as HTMLInputElement | null;
    const passwordEl = document.getElementById("login-password") as HTMLInputElement | null;
    // Only ever adopt a non-empty DOM value: clearing a field is a real
    // onChange, so this must not fight someone deleting what they typed.
    if (emailEl?.value) setEmail((prev) => (prev === emailEl.value ? prev : emailEl.value));
    if (passwordEl?.value) setPassword((prev) => (prev === passwordEl.value ? prev : passwordEl.value));
  }, []);

  React.useEffect(() => {
    // A short ladder rather than a single check: the fill can land before
    // hydration or a beat after it, depending on browser and manager.
    const timers = [0, 150, 400, 900, 1800].map((delay) =>
      window.setTimeout(syncAutofilledFields, delay),
    );
    // Backstop for fills that arrive later than the ladder (an extension
    // finishing an unlock, say): the first interaction re-reads the fields.
    const onInteract = () => syncAutofilledFields();
    const events = ["pointerdown", "keydown", "focusin"] as const;
    for (const type of events) window.addEventListener(type, onInteract, { passive: true });
    // Real browser autofill fires no input event, but it does apply
    // :-webkit-autofill, which the no-op animation below turns into an
    // animationstart. Matching on the target id rather than the animation
    // name keeps this working whether or not the style engine hashes the
    // name. Capture phase because animations on inputs do not bubble
    // reliably in every engine.
    const onAnimationStart = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.id === "login-email" || target.id === "login-password")) {
        syncAutofilledFields();
      }
    };
    document.addEventListener("animationstart", onAnimationStart, true);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      for (const type of events) window.removeEventListener(type, onInteract);
      document.removeEventListener("animationstart", onAnimationStart, true);
    };
  }, [syncAutofilledFields]);

  /** Live field values. State can lag the DOM by a frame after an autofill,
   *  so anything that ACTS on these (which path to take, what to submit)
   *  reads here rather than trusting state. */
  const readFields = React.useCallback(() => {
    const emailEl = document.getElementById("login-email") as HTMLInputElement | null;
    const passwordEl = document.getElementById("login-password") as HTMLInputElement | null;
    return {
      email: emailEl ? emailEl.value : email,
      password: passwordEl ? passwordEl.value : password,
    };
  }, [email, password]);

  const sendSigninLink = React.useCallback(async (emailOverride?: string) => {
    const targetEmail = (emailOverride ?? email).trim().toLowerCase();
    if (!targetEmail) return;
    setLinkStatus("sending");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      const res = await fetch(`${apiBase}/auth/signin-link/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: targetEmail,
          next: redirectTarget,
          turnstile_token: turnstileToken ?? "",
        }),
      });
      if (res.ok) {
        setLinkStatus("sent");
        setError(null);
      } else {
        setLinkStatus("error");
        setError("We couldn't send the sign-in link. Try resending below.");
      }
    } catch {
      setLinkStatus("error");
      setError("We couldn't send the sign-in link. Try resending below.");
    } finally {
      // The token is single use and the request consumed it, whatever the
      // outcome. Drop it and remount the widget so a retry ("Resend the
      // sign-in link") gets a fresh token instead of submitting a spent one.
      setTurnstileToken(null);
      setTurnstileEpoch((n) => n + 1);
    }
  }, [email, redirectTarget, turnstileToken]);

  // Auto-fire the sign-in link once PasswordSetupPending was reported and we
  // have a Turnstile token (when Turnstile is configured). The latch is
  // cleared synchronously so this effect doesn't re-trigger on the next
  // render after `sendSigninLink` updates from new closure values.
  React.useEffect(() => {
    if (!autoSendPending) return;
    if (turnstileSiteKey && !turnstileToken) return;
    setAutoSendPending(false);
    void sendSigninLink();
  }, [autoSendPending, turnstileSiteKey, turnstileToken, sendSigninLink]);

  const formContent = (
    <Stack spacing={2.5}>
      <GlobalStyles
        styles={{
          "@keyframes nc-autofill-seen": { from: {}, to: {} },
          "input:-webkit-autofill": {
            animationName: "nc-autofill-seen",
            animationDuration: "1ms",
          },
        }}
      />
      <AuthErrorBanner code={isSuspendedParam ? "AccountSuspended" : suspended ? "AccountSuspended" : null} />
      {emailChanged && !isSuspendedParam && !suspended && (
        <Typography variant="body2" color="success.main" sx={{ textAlign: "center", fontWeight: 500 }}>
          Your email has been updated. Please sign in with your new email.
        </Typography>
      )}
      {resetSuccess && !emailChanged && !isSuspendedParam && !suspended && (
        <Typography variant="body2" color="success.main" sx={{ textAlign: "center", fontWeight: 500 }}>
          Your password has been reset. Sign in with your new password.
        </Typography>
      )}
      <Box sx={{ textAlign: "center", mx: "auto" }}>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
          Welcome back
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
          Sign in to get back to your plans and gatherings
        </Typography>
      </Box>

      <AppButton
        variant="outlined"
        fullWidth
        size="large"
        color="inherit"
        startIcon={
          <Box
            component="img"
            src="/images/google-icon.svg"
            alt=""
            sx={{ width: 20, height: 20 }}
          />
        }
        onClick={() => signIn("google", { redirectTo: redirectTarget })}
        sx={{
          borderColor: "divider",
          color: "text.primary",
          "&:hover": {
            borderColor: "primary.main",
            backgroundColor: "action.hover",
            color: "text.primary",
          },
        }}
      >
        Sign in with Google
      </AppButton>

      <AuthDividerForm
        dividerText=""
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          // Read the fields live: a password that was autofilled a frame ago
          // is in the DOM but may not be in state yet, and branching on
          // state there would email a link to someone who has a password
          // sitting in the form. A typed password signs in with it; an empty
          // one takes the sign-in-link path.
          const fields = readFields();
          if (!fields.password.trim()) {
            if (linkStatus === "sending" || !fields.email.trim()) return;
            if (turnstileSiteKey && !turnstileToken) return;
            void sendSigninLink(fields.email);
            return;
          }
          const result = await signIn("credentials", {
            email: fields.email,
            password: fields.password,
            redirect: false,
            redirectTo: redirectTarget,
          });
          if (result?.error) {
            // Auth.js passes our custom codes via result.code for CredentialsSignin
            const code = result.code;
            if (code === "AccountSuspended") {
              setSuspended(true);
              return;
            }
            const isUnverified =
              code === "EmailNotVerified" ||
              result.error?.toLowerCase().includes("verify");
            if (isUnverified) {
              setEmailUnverified(true);
              setError("Please verify your email before signing in.");
              return;
            }
            if (code === "EmailNotFound") {
              setError("No account found with this email.");
              return;
            }
            if (code === "OAuthAccount" || code === "NoPasswordOnFile") {
              setError("This account doesn\u2019t have a password yet. Use \u201cForgot password?\u201d below to set one, or sign in with Google.");
              return;
            }
            if (code === "PasswordSetupPending") {
              // Account was created via the lightweight plan-entry flow and
              // never had a password set. Safety net for someone who chose
              // the password field anyway: fall back to the link path and
              // auto-send so they get the email without another click (the
              // send waits for Turnstile when configured).
              setLinkStatus("sending");
              setAutoSendPending(true);
              setError(null);
              setLinkNotice("This account signs in by email link, no password needed. Sending yours now.");
              return;
            }
            if (code === "InvalidPassword") {
              setError("Incorrect password.");
              return;
            }
            // CredentialsSignin without our custom code - show a friendly generic message
            setError(
              "Sign in failed. Please check your email and password and try again."
            );
            return;
          }
          // Full browser navigation on successful credentials sign-in. A
          // client-side `router.replace` reuses Next.js's Router Cache,
          // which was populated BEFORE login with the unauthenticated
          // (app) layout; the server is never consulted again so the
          // authed shell never re-renders, and the user keeps seeing the
          // logged-out sidebar/header until they hard-refresh. Google
          // OAuth already works correctly because it goes through a full
          // /api/auth/callback/* redirect, which naturally invalidates the
          // Router Cache; credentials login with redirect:false does not,
          // so we force a full load here to match that behavior.
          window.location.assign(redirectTarget);
        }}
      >
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
            setEmailUnverified(false);
            setSuspended(false);
            setLinkNotice(null);
            setLinkStatus("idle");
            setAutoSendPending(false);
            // Deliberately NOT clearing the Turnstile token here. The token
            // proves this browser passed the bot check and is independent of
            // whatever email is typed. Clearing it on keystrokes deadlocked
            // the page: the widget resolves once, keeps displaying success,
            // and the next keystroke wiped the only token it will ever issue,
            // leaving the send button permanently disabled.
          }}
          required
        />
        <AuthField
          id="login-password"
          label="Password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
            setEmailUnverified(false);
            setSuspended(false);
            setLinkNotice(null);
            setLinkStatus("idle");
            setAutoSendPending(false);
            // Deliberately NOT clearing the Turnstile token here; it is
            // independent of the form contents. See the email field's
            // matching comment for the deadlock this caused.
          }}
          required={false}
          helperText={
            error ? (
              <Stack component="span" spacing={0.75}>
                <span>{error}</span>
                {emailUnverified && (
                  <Typography
                    component={Link}
                    href={`/auth/verify/pending?email=${encodeURIComponent(email)}`}
                    variant="body2"
                    sx={{
                      color: "primary.main",
                      fontWeight: 500,
                      display: "block",
                      "&:hover": { color: "primary.dark", textDecoration: "underline" },
                    }}
                  >
                    Resend verification email
                  </Typography>
                )}
              </Stack>
            ) : (
              "No password? Leave this empty and the button below emails you a one-click sign-in link."
            )
          }
          error={Boolean(error)}
        />

        {linkNotice && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5, textAlign: "center" }}>
            {linkNotice}
          </Typography>
        )}

        {/* Action area: the sent-state card, or the single intent button.
            The link path stays reachable without a password (invitee-flow
            accounts have none); a passwordless account that types a password
            anyway is caught by the PasswordSetupPending branch above, which
            sends exactly one link instead. */}
        {(
          linkStatus === "sent" ? (
            <Box
              sx={{
                mt: 1,
                p: { xs: 2.5, sm: 3 },
                borderRadius: 3,
                background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
                border: 1,
                borderColor: "primary.light",
              }}
            >
              <Stack spacing={1.5} alignItems="center" sx={{ textAlign: "center" }}>
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 14px rgba(230, 91, 19, 0.35)",
                  }}
                >
                  <MarkEmailReadRoundedIcon sx={{ fontSize: 28 }} />
                </Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Check your email
                </Typography>
                <Typography variant="body2" color="text.primary">
                  If <Box component="span" sx={{ fontWeight: 600 }}>{email}</Box> has a
                  NewChums account, a sign-in link is on its way. One click and
                  you&apos;re in.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  The link is valid for 15 minutes. Didn&apos;t see it? Check
                  your spam or promotions folder.
                </Typography>
                <Typography
                  component="button"
                  type="button"
                  onClick={() => {
                    // The widget is unmounted while this panel is showing, so
                    // after the previous send consumed the token there may be
                    // no fresh one yet. Never fire a doomed request: drop
                    // back to the form, where the remounted widget issues a
                    // new token and the button enables the moment it does.
                    if (turnstileSiteKey && !turnstileToken) {
                      setLinkStatus("idle");
                      return;
                    }
                    void sendSigninLink();
                  }}
                  variant="caption"
                  sx={{
                    background: "none",
                    border: "none",
                    p: 0,
                    cursor: "pointer",
                    color: "primary.main",
                    fontWeight: 500,
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  Resend the sign-in link
                </Typography>
              </Stack>
            </Box>
          ) : (
            <Stack spacing={1.5} alignItems="center" sx={{ mt: 2 }}>
              {/* Quiet Turnstile: solves invisibly and only materialises if
               *  it genuinely needs a person. It still issues the token the
               *  link path is gated on; when TURNSTILE_SECRET_KEY is unset
               *  (dev), the button is enabled immediately. */}
              {turnstileSiteKey && (
                <TurnstileWidget
                  key={turnstileEpoch}
                  siteKey={turnstileSiteKey}
                  appearance="interaction-only"
                  onVerify={(t) => setTurnstileToken(t)}
                  onExpire={() => setTurnstileToken(null)}
                />
              )}
              {/* One action whose label follows intent, mirroring the form's
               *  submit branch: a typed password means password sign-in, an
               *  empty one means the sign-in link. Nobody chooses a method,
               *  they just type what they have. */}
              <AppButton
                type="submit"
                fullWidth
                size="large"
                disabled={
                  !email.trim() ||
                  (!password.trim() &&
                    (linkStatus === "sending" ||
                      (Boolean(turnstileSiteKey) && !turnstileToken)))
                }
              >
                {password.trim()
                  ? "Sign in"
                  : linkStatus === "sending"
                    ? "Sending…"
                    : "Email me a sign-in link"}
              </AppButton>
              {linkStatus === "error" && (
                <Typography variant="caption" color="error">
                  We couldn&apos;t send the link. Please try again in a moment.
                </Typography>
              )}
            </Stack>
          )
        )}



      </AuthDividerForm>

      {/* The necessary-but-not-the-point row: quiet, at the bottom. */}
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Typography
          component={Link}
          href="/forgot-password"
          variant="body2"
          fontWeight={500}
          color="primary"
          sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
        >
          Forgot your password?
        </Typography>
      </Box>
      <AuthFooterLink prompt="New to NewChums?" linkText="Create an account" href="/signup" />
      {/* Google sign-in can create an account, so the page still carries the
          signup consent line; demoted to the footer with the other
          secondaries. */}
      <LegalConsentNotice action="continuing" sx={{ mt: 1.5 }} />
    </Stack>
  );

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>{formContent}</AppCard>
    </AuthSplitLayout>
  );
}
