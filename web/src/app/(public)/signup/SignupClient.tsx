"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import * as React from "react";
import AuthDividerForm from "@/components/auth/AuthDividerForm";
import AuthField from "@/components/auth/AuthField";
import AuthFooterLink from "@/components/auth/AuthFooterLink";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = React.useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const nextParam = searchParams.get("next");
  const redirectTarget = getSafeRedirectPath(nextParam);

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Stack spacing={2.5}>
          <Box sx={{ textAlign: "center" }}>
            <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
              Welcome to NewChums
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
              Your place to find your people
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
            Sign up with Google
          </AppButton>

          <AuthDividerForm
            dividerText="or sign up with"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setUsernameError(null);
              setEmailError(null);
              setConfirmPasswordError(null);

              const trimmed = username.trim();
              if (!trimmed) {
                setUsernameError("Username is required.");
                return;
              }
              if (
                !/^[A-Za-z0-9_]{3,20}$/.test(trimmed) ||
                trimmed.toLowerCase().startsWith("_") ||
                trimmed.toLowerCase().endsWith("_")
              ) {
                setUsernameError(
                  "Use 3–20 lowercase letters, numbers, or underscores; no leading/trailing underscore."
                );
                return;
              }

              if (confirmPassword !== password) {
                setConfirmPasswordError("Passwords do not match.");
                return;
              }

              setIsSubmitting(true);

              try {
                const response = await fetch("/api/auth/signup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    username: trimmed,
                    email: email.trim().toLowerCase(),
                    password,
                  }),
                });
                const data = (await response.json()) as {
                  ok: boolean;
                  error?: string;
                };

                if (!response.ok || !data.ok) {
                  if (data.error === "USERNAME_TAKEN") {
                    setUsernameError("Username is already taken.");
                  } else if (data.error === "INVALID_USERNAME") {
                    setUsernameError(
                      "Use 3–20 lowercase letters, numbers, or underscores; no leading/trailing underscore."
                    );
                  } else if (data.error === "EMAIL_EXISTS") {
                    setEmailError("An account already exists for this email.");
                  } else if (data.error === "INVALID_INPUT") {
                    setError("Please complete all required fields correctly.");
                  } else if (data.error === "SERVER_ERROR") {
                    setError("Sign up failed. Please try again.");
                  } else {
                    setError("Sign up failed. Please try again.");
                  }
                  return;
                }

                router.push(
                  `/login?email=${encodeURIComponent(
                    email.trim().toLowerCase()
                  )}`
                );
              } catch {
                setError("Sign up failed. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <AuthField
              id="signup-username"
              label="Username"
              type="text"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value.replace(/\s/g, ""));
                setUsernameError(null);
              }}
              onBlur={() => setUsername((prev) => prev.trim())}
              required
              helperText={
                usernameError ??
                "You unique handle (letters, numbers, underscores)."
              }
              error={Boolean(usernameError)}
              inputProps={{ autoComplete: "username" }}
            />
            <AuthField
              id="signup-email"
              label="Email address"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError(null);
              }}
              required
              helperText={emailError ?? undefined}
              error={Boolean(emailError)}
            />
            <AuthField
              id="signup-password"
              label="Password"
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setConfirmPasswordError(null);
                setError(null);
              }}
              required
              helperText={error ?? undefined}
              error={Boolean(error)}
            />
            <AuthField
              id="signup-confirm-password"
              label="Confirm password"
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setConfirmPasswordError(null);
              }}
              required
              helperText={confirmPasswordError ?? undefined}
              error={Boolean(confirmPasswordError)}
              inputProps={{ autoComplete: "new-password" }}
            />
            <AppButton
              type="submit"
              fullWidth
              size="large"
              disabled={isSubmitting}
              sx={{ mt: 2 }}
            >
              {isSubmitting ? "Creating..." : "Create account"}
            </AppButton>
          </AuthDividerForm>

          <AuthFooterLink
            prompt="Already have an account?"
            linkText="Sign In"
            href="/login"
          />
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
