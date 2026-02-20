"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import * as React from "react";
import AuthField from "@/components/auth/AuthField";
import AuthFooterLink from "@/components/auth/AuthFooterLink";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
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

          <Box sx={{ mt: 2.5 }}>
            <Divider sx={{ "&::before, &::after": { borderColor: "divider" } }}>
              <Typography
                variant="h6"
                fontWeight={400}
                color="text.secondary"
                component="span"
                sx={{ px: 2 }}
              >
                or sign up with
              </Typography>
            </Divider>
          </Box>

          <Stack
            component="form"
            spacing={0}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setIsSubmitting(true);

              try {
                const response = await fetch("/api/auth/signup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, email, password }),
                });
                const data = (await response.json()) as {
                  ok: boolean;
                  error?: string;
                };

                if (!response.ok || !data.ok) {
                  if (data.error === "EMAIL_EXISTS") {
                    setError("Email already exists.");
                  } else if (data.error === "INVALID_INPUT") {
                    setError(
                      "Please provide a valid email and password (8+ chars)."
                    );
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
              id="signup-name"
              label="Name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <AuthField
              id="signup-email"
              label="Email address"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <AuthField
              id="signup-password"
              label="Password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              helperText={error ?? undefined}
              error={Boolean(error)}
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
          </Stack>

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
