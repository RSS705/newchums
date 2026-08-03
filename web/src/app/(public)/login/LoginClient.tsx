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
  const [method, setMethod] = React.useState<"link" | "password">("link");
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

  const sendSigninLink = React.useCallback(async () => {
    setLinkStatus("sending");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      const res = await fetch(`${apiBase}/auth/signin-link/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
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

      {/* Signing in with Google creates the account when there isn't one yet,
          so this surface carries the same consent notice as signup. */}
      <LegalConsentNotice action="continuing" sx={{ mt: 1.25 }} />

      <AuthDividerForm
        dividerText="or use your email"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          if (method === "link") {
            if (linkStatus === "sending" || !email.trim()) return;
            if (turnstileSiteKey && !turnstileToken) return;
            void sendSigninLink();
            return;
          }
          const result = await signIn("credentials", {
            email,
            password,
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
              // "Use a password" anyway: flip back to the link method and
              // auto-send so they get the email without another click (the
              // send waits for Turnstile when configured).
              setMethod("link");
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
        {linkNotice && method === "link" && (
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1.5, textAlign: "center" }}>
            {linkNotice}
          </Typography>
        )}

        {method === "password" && (
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
            // Deliberately NOT clearing the Turnstile token here. The token
            // proves this browser passed the bot check and is independent of
            // whatever email is typed. Clearing it on keystrokes deadlocked
            // the page: the widget resolves once, keeps displaying success,
            // and the next keystroke wiped the only token it will ever issue,
            // leaving the send button permanently disabled.
          }}
          required
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
            ) : undefined
          }
          error={Boolean(error)}
        />
        )}

        {method === "password" && (
        <Box sx={{ my: 2, textAlign: "right" }}>
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
        )}

        {/* Action area. Link mode is primary: it works for every account,
         *  passwordless ones included, and the sent-state card matches the
         *  PlanSignupCard "check your email" tone. Password mode is one tap
         *  away for people who have one; a passwordless account submitting a
         *  password is flipped back to link mode by the
         *  PasswordSetupPending branch above.
         */}
        {method === "link" ? (
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
              {/* Turnstile renders up front so the send button unlocks the
               *  moment it resolves. When TURNSTILE_SECRET_KEY is unset
               *  (dev), the button is enabled immediately. */}
              {turnstileSiteKey && (
                <TurnstileWidget
                  key={turnstileEpoch}
                  siteKey={turnstileSiteKey}
                  onVerify={(t) => setTurnstileToken(t)}
                  onExpire={() => setTurnstileToken(null)}
                />
              )}
              <AppButton
                type="submit"
                fullWidth
                size="large"
                disabled={
                  linkStatus === "sending" ||
                  !email.trim() ||
                  (Boolean(turnstileSiteKey) && !turnstileToken)
                }
              >
                {linkStatus === "sending" ? "Sending…" : "Email me a sign-in link"}
              </AppButton>
              <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
                No password needed. We&apos;ll email you a one-click link.
              </Typography>
              {linkStatus === "error" && (
                <Typography variant="caption" color="error">
                  We couldn&apos;t send the link. Please try again in a moment.
                </Typography>
              )}
            </Stack>
          )
        ) : (
          <AppButton type="submit" fullWidth size="large">
            Sign in
          </AppButton>
        )}

        <Box sx={{ mt: 1.75, textAlign: "center" }}>
          <Typography
            component="button"
            type="button"
            onClick={() => {
              setMethod(method === "link" ? "password" : "link");
              setError(null);
              setLinkNotice(null);
              setLinkStatus("idle");
              setAutoSendPending(false);
            }}
            variant="body2"
            sx={{
              background: "none",
              border: "none",
              p: 0,
              cursor: "pointer",
              color: "primary.main",
              fontWeight: 500,
              "&:hover": { textDecoration: "underline" },
            }}
          >
            {method === "link" ? "Use a password instead" : "Email me a sign-in link instead"}
          </Typography>
        </Box>
      </AuthDividerForm>

      <AuthFooterLink prompt="New to NewChums?" linkText="Create an account" href="/signup" />
    </Stack>
  );

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>{formContent}</AppCard>
    </AuthSplitLayout>
  );
}
