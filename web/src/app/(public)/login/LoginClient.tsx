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
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [emailUnverified, setEmailUnverified] = React.useState(false);
  const [suspended, setSuspended] = React.useState(false);

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
            if (code === "OAuthAccount") {
              setError("Sign in with Google instead.");
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
          router.replace(redirectTarget);
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

        <AppButton type="submit" fullWidth size="large">
          Sign in
        </AppButton>
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
