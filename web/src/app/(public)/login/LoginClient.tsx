"use client";

import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GoogleIcon from "@mui/icons-material/Google";
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
  const [rememberDevice, setRememberDevice] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const emailPrefill = searchParams.get("email");
  const nextParam = searchParams.get("next");
  const redirectTarget = getSafeRedirectPath(nextParam);

  React.useEffect(() => {
    if (emailPrefill) {
      setEmail(emailPrefill);
    }
  }, [emailPrefill]);

  const formContent = (
    <Stack spacing={2.5}>
      <Box>
        <Typography component="h1" variant="h4" fontWeight={600} sx={{ mb: 0.5 }}>
          Welcome to NewChums
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your events dashboard
        </Typography>
      </Box>

      {/* Social login first (template order) */}
      <AppButton
        variant="outlined"
        fullWidth
        startIcon={<GoogleIcon />}
        onClick={() => signIn("google", { redirectTo: redirectTarget })}
        sx={{
          borderColor: "divider",
          color: "text.primary",
          "&:hover": {
            borderColor: "primary.main",
            backgroundColor: "action.hover",
          },
        }}
      >
        Sign in with Google
      </AppButton>

      <Divider sx={{ "&::before, &::after": { borderColor: "divider" } }}>
        <Typography variant="body2" color="text.secondary" component="span">
          or sign in with
        </Typography>
      </Divider>

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

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
              />
            }
            label="Remember this Device"
            sx={{ "& .MuiFormControlLabel-label": { fontSize: "0.875rem" } }}
          />
          <Typography
            component={Link}
            href="/forgot-password"
            variant="body2"
            color="primary"
            sx={{ textDecoration: "underline" }}
          >
            Forgot Password?
          </Typography>
        </Box>

        <AppButton type="submit" fullWidth>
          Sign In
        </AppButton>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
        New to NewChums?{" "}
        <Box
          component={Link}
          href="/signup"
          sx={{ color: "primary.main", textDecoration: "underline", fontWeight: 600 }}
        >
          Create an account
        </Box>
      </Typography>
    </Stack>
  );

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
      }}
    >
      {/* Left: branding + illustration (hidden on xs/sm, shown md+) — template split pattern */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          flex: "1 1 50%",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: 4,
          background: (t) =>
            `linear-gradient(135deg, ${t.palette.primary.light} 0%, ${t.palette.primary.main}20 100%)`,
        }}
      >
        <Typography
          component="span"
          variant="h4"
          fontWeight={700}
          color="primary.dark"
          sx={{ mb: 2, textAlign: "center" }}
        >
          NewChums
        </Typography>
        <Typography variant="body2" color="primary.dark" sx={{ opacity: 0.85, textAlign: "center", mb: 3 }}>
          Meet nearby people through shared events.
        </Typography>
        <Box
          component="img"
          src="/auth-illustration.svg"
          alt=""
          sx={{
            width: "100%",
            maxWidth: 360,
            height: "auto",
            objectFit: "contain",
          }}
        />
      </Box>

      {/* Right: login form — white panel, centered form (template auth layout) */}
      <Box
        sx={{
          flex: "1 1 50%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 2, md: 4 },
          bgcolor: "background.paper",
        }}
      >
        {/* Mobile/small: show compact illustration above form */}
        <Box
          component="img"
          src="/auth-illustration.svg"
          alt=""
          sx={{
            display: { xs: "block", md: "none" },
            width: "100%",
            maxWidth: 200,
            height: "auto",
            mx: "auto",
            mb: 2,
            objectFit: "contain",
          }}
        />

        <AppCard sx={{ width: "100%", maxWidth: 450 }}>
          {formContent}
        </AppCard>
      </Box>
    </Box>
  );
}
