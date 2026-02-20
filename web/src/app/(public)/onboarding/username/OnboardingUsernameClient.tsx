"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import AuthField from "@/components/auth/AuthField";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function OnboardingUsernameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = React.useState("");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const returnTo = getSafeRedirectPath(searchParams.get("returnTo"));

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Typography
          component="h1"
          variant="h4"
          fontWeight={700}
          sx={{ mb: 0.5, textAlign: "center" }}
        >
          Choose a username
        </Typography>
        <Typography
          variant="subtitle1"
          color="text.secondary"
          sx={{ mb: 1, textAlign: "center" }}
        >
          A username is required to continue. It will be visible to other
          members. You can always change it later.
        </Typography>
        <Stack
          component="form"
          spacing={0}
          onSubmit={async (event) => {
            event.preventDefault();
            setUsernameError(null);

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

            setIsSubmitting(true);

            try {
              const response = await fetch("/api/user/username", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: trimmed }),
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
                } else {
                  setUsernameError("Something went wrong. Please try again.");
                }
                return;
              }

              router.replace(returnTo);
            } catch {
              setUsernameError("Something went wrong. Please try again.");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <AuthField
            id="onboarding-username"
            label="Username"
            noTopMargin
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
          <AppButton
            type="submit"
            fullWidth
            size="large"
            disabled={isSubmitting}
            sx={{ mt: 2 }}
          >
            {isSubmitting ? "Saving..." : "Continue"}
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
