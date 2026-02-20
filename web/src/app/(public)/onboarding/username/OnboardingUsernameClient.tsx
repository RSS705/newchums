"use client";

import dayjs from "dayjs";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AuthField from "@/components/auth/AuthField";
import NCDatePicker from "@/components/fields/NCDatePicker";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { getSafeRedirectPath } from "@/lib/authRedirect";

export default function OnboardingUsernameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = React.useState<string | null>(null);
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
          Complete your profile
        </Typography>
        <Typography
          variant="subtitle1"
          color="text.secondary"
          sx={{ mb: 2, textAlign: "center" }}
        >
          A username and date of birth are required to continue.
        </Typography>
        <Stack
          component="form"
          spacing={0}
          onSubmit={async (event) => {
            event.preventDefault();
            setUsernameError(null);
            setDateOfBirthError(null);

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

            const trimmedDob = dateOfBirth.trim();
            if (!trimmedDob) {
              setDateOfBirthError("Date of birth is required.");
              return;
            }

            setIsSubmitting(true);

            try {
              const [dobResponse, usernameResponse] = await Promise.all([
                fetch("/api/user/date-of-birth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ date_of_birth: trimmedDob }),
                }),
                fetch("/api/user/username", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ username: trimmed }),
                }),
              ]);

              const dobData = (await dobResponse.json()) as {
                ok: boolean;
                error?: string;
                code?: string;
                message?: string;
              };
              const usernameData = (await usernameResponse.json()) as {
                ok: boolean;
                error?: string;
              };

              let hasError = false;
              if (!dobResponse.ok || !dobData.ok) {
                hasError = true;
                if (dobData.error === "REQUIRED") {
                  setDateOfBirthError("Date of birth is required.");
                } else if (dobData.error === "INVALID_DATE") {
                  setDateOfBirthError("Please enter a valid date (YYYY-MM-DD).");
                } else if (dobData.error === "UNDERAGE") {
                  setDateOfBirthError(
                    dobData.message ??
                      "NewChums is currently available to people 18 and older."
                  );
                } else if (dobData.error === "FUTURE_DATE") {
                  setDateOfBirthError("Date cannot be in the future.");
                } else {
                  setDateOfBirthError("Something went wrong. Please try again.");
                }
              }
              if (!usernameResponse.ok || !usernameData.ok) {
                hasError = true;
                if (usernameData.error === "USERNAME_TAKEN") {
                  setUsernameError("Username is already taken.");
                } else if (usernameData.error === "INVALID_USERNAME") {
                  setUsernameError(
                    "Use 3–20 lowercase letters, numbers, or underscores; no leading/trailing underscore."
                  );
                } else {
                  setUsernameError("Something went wrong. Please try again.");
                }
              }
              if (hasError) return;

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
              "Your unique handle (letters, numbers, underscores)."
            }
            error={Boolean(usernameError)}
            inputProps={{ autoComplete: "username" }}
          />
          <NCDatePicker
            id="onboarding-date-of-birth"
            label="Date of birth"
            value={dateOfBirth}
            onChange={(value) => {
              setDateOfBirth(value);
              setDateOfBirthError(null);
            }}
            maxDate={dayjs()}
            helperText={
              dateOfBirthError ?? "You must be 18+ to use NewChums."
            }
            error={Boolean(dateOfBirthError)}
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
