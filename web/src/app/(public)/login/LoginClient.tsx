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
  const [pendingSetup, setPendingSetup] = React.useState(false);
  const [linkStatus, setLinkStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
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

      <AuthDividerForm
        dividerText="or sign in with"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
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
              // never had a password set. Offer them a fresh magic sign-in
              // link so they can return and finish setup.
              setPendingSetup(true);
              setError("Your password hasn\u2019t been set yet. We can send you a one-click sign-in link so you can finish setup.");
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
            setPendingSetup(false);
            setLinkStatus("idle");
            setTurnstileToken(null);
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
            setPendingSetup(false);
            setLinkStatus("idle");
            setTurnstileToken(null);
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

        {/* When the account has no password yet, the usual "Sign in" submit
         *  would only produce the same PasswordSetupPending error, so we
         *  swap it for the one action that actually helps them: send the
         *  sign-in link. After the link is sent, the card flips to a
         *  success message so the user knows the next step is their inbox.
         */}
        {pendingSetup ? (
          linkStatus === "sent" ? (
            // Styled confirmation card, matches the PlanSignupCard
            // "check your email" state so the tone is consistent across
            // surfaces that end on "wait for the email link."
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
                  Sign-in link sent
                </Typography>
                <Typography variant="body2" color="text.primary">
                  Open the link we sent to{" "}
                  <Box component="span" sx={{ fontWeight: 600 }}>
                    {email}
                  </Box>{" "}
                  to finish signing in.
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  The link is valid for 15 minutes. Didn&apos;t see it? Check
                  your spam or promotions folder.
                </Typography>
              </Stack>
            </Box>
          ) : (
            <Stack spacing={1.5} alignItems="center">
              {/* Same Turnstile policy as the plan-signup card: when the
               *  site key is configured we require a token here too, since
               *  the signin-link endpoint is unauthenticated and gated on
               *  Turnstile server-side. */}
              {turnstileSiteKey && (
                <TurnstileWidget
                  siteKey={turnstileSiteKey}
                  onVerify={(t) => setTurnstileToken(t)}
                />
              )}
              <AppButton
                type="button"
                fullWidth
                size="large"
                disabled={
                  linkStatus === "sending" ||
                  !email.trim() ||
                  (Boolean(turnstileSiteKey) && !turnstileToken)
                }
                onClick={async (event) => {
                  event.preventDefault();
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
                    }
                  } catch {
                    setLinkStatus("error");
                  }
                }}
              >
                {linkStatus === "sending" ? "Sending..." : "Email me a sign-in link"}
              </AppButton>
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
