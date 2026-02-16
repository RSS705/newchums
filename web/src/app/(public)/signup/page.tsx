"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import * as React from "react";
import { AppButton, AppCard, AppTextField } from "@/components/ui";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <AppCard sx={{ width: "100%", maxWidth: 520 }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Sign up
          </Typography>
          <Stack
            component="form"
            spacing={1.5}
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
                const data = (await response.json()) as { ok: boolean; error?: string };

                if (!response.ok || !data.ok) {
                  if (data.error === "EMAIL_EXISTS") {
                    setError("Email already exists.");
                  } else if (data.error === "INVALID_INPUT") {
                    setError("Please provide a valid email and password (8+ chars).");
                  } else {
                    setError("Sign up failed. Please try again.");
                  }
                  return;
                }

                router.push(`/login?email=${encodeURIComponent(email.trim().toLowerCase())}`);
              } catch {
                setError("Sign up failed. Please try again.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <AppTextField
              type="text"
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <AppTextField
              type="email"
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <AppTextField
              type="password"
              label="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              helperText={error ?? " "}
              error={Boolean(error)}
            />
            <AppButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create account"}
            </AppButton>
          </Stack>
        </Stack>
      </AppCard>
    </Box>
  );
}
