"use client";

import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import AuthField from "@/components/auth/AuthField";
import AuthLayout from "@/components/layout/AuthLayout";
import { AppButton, AppCard } from "@/components/ui";
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

      <Box sx={{ mt: 2.5 }}>
        <Divider sx={{ "&::before, &::after": { borderColor: "divider" } }}>
          <Typography variant="h6" fontWeight={400} color="text.secondary" component="span" sx={{ px: 2 }}>
            or sign in with
          </Typography>
        </Divider>
      </Box>

      <Stack
        component="form"
        spacing={0}
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
        <AuthField
          id="login-email"
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <AuthField
          id="login-password"
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          helperText={error ?? undefined}
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
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="subtitle1" fontWeight={500} color="text.secondary">
          New to NewChums?{" "}
        </Typography>
        <Typography
          component={Link}
          href="/signup"
          variant="subtitle1"
          fontWeight={600}
          sx={{
            color: "primary.main",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            "&:hover": { color: "primary.dark" },
            "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main", outlineOffset: 2, borderRadius: 1 },
          }}
        >
          Create an account
        </Typography>
      </Stack>
    </Stack>
  );

  return (
    <AuthLayout>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
        }}
      >
      {/* Left: branding + illustration (hidden on xs/sm, shown md+) */}
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
        <Box sx={{ mb: 2 }}>
          <Image
            src="/icon-black.png"
            alt="NewChums"
            width={64}
            height={64}
            style={{ objectFit: "contain" }}
          />
        </Box>
        <Typography
          component="span"
          variant="h3"
          fontWeight={700}
          sx={{ color: "#1a1a1a", mb: 1, textAlign: "center" }}
        >
          NewChums
        </Typography>
        <Typography
          variant="subtitle1"
          sx={{ color: "#333", textAlign: "center", mb: 3 }}
        >
          Find your people
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
    </AuthLayout>
  );
}
