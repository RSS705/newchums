"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import * as React from "react";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

type RequestResponse = { ok: boolean; resetUrl?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [resetUrl, setResetUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <AppCard sx={{ width: "100%", maxWidth: 520 }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Forgot password
          </Typography>
          <Stack
            component="form"
            spacing={1.5}
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setSubmitted(false);
              setResetUrl(null);

              try {
                const response = await fetch("/api/auth/password-reset/request", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
                const data = (await response.json()) as RequestResponse;
                if (!response.ok || !data.ok) {
                  setError("Something went wrong. Please try again.");
                  return;
                }
                setSubmitted(true);
                if (data.resetUrl) {
                  setResetUrl(data.resetUrl);
                }
              } catch {
                setError("Something went wrong. Please try again.");
              }
            }}
          >
            <AppTextField
              type="email"
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              helperText={error ?? " "}
              error={Boolean(error)}
            />
            <AppButton type="submit">Send reset link</AppButton>
          </Stack>
          {submitted ? (
            <Typography color="text.secondary">
              If an account exists, a reset link has been sent.
            </Typography>
          ) : null}
          {resetUrl ? (
            <Typography color="text.secondary" sx={{ wordBreak: "break-all" }}>
              Dev reset link: {resetUrl}
            </Typography>
          ) : null}
        </Stack>
      </AppCard>
    </Box>
  );
}
