"use client";

import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { AppButton, AppCard, AppTextField } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const emailPrefill = searchParams.get("email");
  const nextParam = searchParams.get("next");
  const redirectTarget = getSafeRedirectPath(nextParam);

  React.useEffect(() => {
    if (emailPrefill) {
      setEmail(emailPrefill);
    }
  }, [emailPrefill]);

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <AppCard sx={{ width: "100%", maxWidth: 520 }}>
        <Stack spacing={2}>
          <Typography component="h1" variant="h4">
            Login
          </Typography>
          <Stack
            component="form"
            spacing={1.5}
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
                setError("Invalid email or password.");
                return;
              }
              router.replace(redirectTarget);
            }}
          >
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
            <AppButton type="submit">Sign in with Email</AppButton>
          </Stack>

          <Divider>or</Divider>
          <AppButton variant="outlined" onClick={() => signIn("google", { redirectTo: redirectTarget })}>
            Continue with Google
          </AppButton>

          <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
            <Typography component={Link} href="/signup" variant="body2" color="text.secondary">
              Create an account
            </Typography>
            <Typography component={Link} href="/forgot-password" variant="body2" color="text.secondary">
              Forgot password?
            </Typography>
          </Stack>
        </Stack>
      </AppCard>
    </Box>
  );
}
