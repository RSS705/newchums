"use client";

import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import AuthDividerForm from "@/components/auth/AuthDividerForm";
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
  const [rememberDevice, setRememberDevice] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [emailUnverified, setEmailUnverified] = React.useState(false);

  const emailPrefill = searchParams.get("email");
  const nextParam = searchParams.get("next");
  const resetSuccess = searchParams.get("reset") === "success";
  const emailChanged = searchParams.get("emailChanged") === "1";
  const redirectTarget = getSafeRedirectPath(nextParam);

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
      {emailChanged && (
        <Typography variant="body2" color="success.main" sx={{ textAlign: "center", fontWeight: 500 }}>
          Your email has been updated. Please sign in with your new email.
        </Typography>
      )}
      {resetSuccess && !emailChanged && (
        <Typography variant="body2" color="success.main" sx={{ textAlign: "center", fontWeight: 500 }}>
          Your password has been reset. Sign in with your new password.
        </Typography>
      )}
      <Box sx={{ textAlign: "center", mx: "auto" }}>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
          Welcome back friend
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
          If you&apos;re new here, click create an account below
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

        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ my: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
              />
            }
            label="Remember this device"
            sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.875rem" } }}
          />
          <Typography
            component={Link}
            href="/forgot-password"
            variant="subtitle1"
            fontWeight={500}
            color="primary"
            sx={{ textDecoration: "none" }}
          >
            Forgot Password?
          </Typography>
        </Stack>

        <AppButton type="submit" fullWidth size="large">
          Sign In
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
