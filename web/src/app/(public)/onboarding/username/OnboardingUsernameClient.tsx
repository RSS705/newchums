"use client";

import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import dayjs from "dayjs";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthField from "@/components/auth/AuthField";
import NCDatePicker from "@/components/fields/NCDatePicker";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import { AppButton, AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { validateCleanText } from "@/lib/contentSafety";
import { getSafeRedirectPath } from "@/lib/authRedirect";
import OnboardingProgress from "@/components/onboarding/OnboardingProgress";
import StepTransition from "@/components/onboarding/StepTransition";
import HobbiesStep, { type InterestOption } from "@/components/onboarding/HobbiesStep";
import LocationStep from "@/components/onboarding/LocationStep";
import type { PlaceResult } from "@/components/common/PlacesAutocompleteInput";

const TOTAL_STEPS = 3;

export default function OnboardingUsernameClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = React.useState(1);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  // Step 1: Username + DOB
  const [username, setUsername] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = React.useState<string | null>(null);

  // Step 2: Hobbies
  const [hobbies, setHobbies] = React.useState<InterestOption[]>([]);

  // Step 3: Location
  const [homeAddress, setHomeAddress] = React.useState("");
  const [homeLat, setHomeLat] = React.useState<number | null>(null);
  const [homeLng, setHomeLng] = React.useState<number | null>(null);
  const [travelRadiusKm, setTravelRadiusKm] = React.useState(50);

  // Shared
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [generalError, setGeneralError] = React.useState<string | null>(null);

  const returnTo = getSafeRedirectPath(searchParams.get("returnTo"));

  const goForward = () => {
    setDirection("forward");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection("back");
    setStep((s) => Math.max(s - 1, 1));
  };

  const validateStep1 = (): boolean => {
    setUsernameError(null);
    setDateOfBirthError(null);

    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameError("Username is required.");
      return false;
    }
    if (
      !/^[A-Za-z0-9_]{3,20}$/.test(trimmed) ||
      trimmed.toLowerCase().startsWith("_") ||
      trimmed.toLowerCase().endsWith("_")
    ) {
      setUsernameError(
        "Use 3-20 lowercase letters, numbers, or underscores; no leading/trailing underscore.",
      );
      return false;
    }
    const usernameContentCheck = validateCleanText(trimmed, "username");
    if (!usernameContentCheck.ok) {
      setUsernameError(
        usernameContentCheck.reason ?? "That username isn't allowed. Try something else.",
      );
      return false;
    }

    const trimmedDob = dateOfBirth.trim();
    if (!trimmedDob) {
      setDateOfBirthError("Date of birth is required.");
      return false;
    }
    const dob = dayjs(trimmedDob);
    if (!dob.isValid()) {
      setDateOfBirthError("Please enter a valid date (YYYY-MM-DD).");
      return false;
    }
    if (dob.isAfter(dayjs())) {
      setDateOfBirthError("Date cannot be in the future.");
      return false;
    }
    if (dayjs().diff(dob, "year") < 18) {
      setDateOfBirthError("NewChums is currently available to people 18 and older.");
      return false;
    }
    return true;
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep1()) goForward();
  };

  const submitOnboarding = async () => {
    setGeneralError(null);
    setIsSubmitting(true);

    try {
      const trimmed = username.trim();
      const trimmedDob = dateOfBirth.trim();

      // Save username + DOB (required)
      const [dobResponse, usernameResponse] = await Promise.all([
        apiFetch("/user/date-of-birth", {
          method: "POST",
          auth: true,
          body: JSON.stringify({ date_of_birth: trimmedDob }),
        }),
        apiFetch("/user/username", {
          method: "POST",
          auth: true,
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
        code?: string;
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
            dobData.message ?? "NewChums is currently available to people 18 and older.",
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
        } else if (
          usernameData.error === "INAPPROPRIATE_TEXT" ||
          usernameData.code === "INAPPROPRIATE_TEXT"
        ) {
          setUsernameError("That username isn't allowed. Try something else.");
        } else if (usernameData.error === "INVALID_USERNAME") {
          setUsernameError(
            "Use 3-20 lowercase letters, numbers, or underscores; no leading/trailing underscore.",
          );
        } else {
          setUsernameError("Something went wrong. Please try again.");
        }
      }
      if (hasError) {
        setDirection("back");
        setStep(1);
        return;
      }

      // Save hobbies + location (optional, via PUT /profile)
      const hasHobbies = hobbies.length > 0;
      const hasLocation = homeLat != null && homeLng != null;

      if (hasHobbies || hasLocation) {
        const profileBody: Record<string, unknown> = {};
        if (hasHobbies) {
          profileBody.interest_slugs = hobbies.map((h) => h.slug);
          profileBody.interest_items = hobbies.map((h) => ({
            slug: h.slug,
            name: h.name,
          }));
        }
        if (hasLocation) {
          profileBody.home_city = homeAddress.trim() || null;
          profileBody.home_lat = homeLat;
          profileBody.home_lng = homeLng;
          profileBody.travel_radius_km = travelRadiusKm;
        }

        try {
          await apiFetch("/profile", {
            method: "PUT",
            auth: true,
            body: JSON.stringify(profileBody),
          });
        } catch {
          // Non-fatal: username+DOB already saved, profile extras are best-effort
        }
      }

      router.replace(returnTo);
    } catch {
      setGeneralError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePlaceSelect = (result: PlaceResult) => {
    setHomeAddress(result.formattedAddress);
    setHomeLat(result.lat);
    setHomeLng(result.lng);
  };

  const stepHeadings: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: "Almost there",
      subtitle: "A username and date of birth are required to continue.",
    },
    2: {
      title: "What are you into?",
      subtitle:
        "Adding hobbies helps us show plans you'll enjoy. You can always update these later.",
    },
    3: {
      title: "Where are you based?",
      subtitle: "Setting your location helps us show plans near you.",
    },
  };

  const heading = stepHeadings[step]!;

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Stack spacing={2.5}>
          <OnboardingProgress currentStep={step} totalSteps={TOTAL_STEPS} />

          <StepTransition stepKey={step} direction={direction}>
            <Stack spacing={2.5}>
              {step > 1 && (
                <Box>
                  <IconButton
                    onClick={goBack}
                    size="small"
                    sx={{ ml: -1, color: "text.secondary" }}
                    aria-label="Go back"
                  >
                    <ArrowBackRoundedIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}

              <Box sx={{ textAlign: "center" }}>
                <Typography
                  component="h1"
                  variant="h4"
                  fontWeight={700}
                  sx={{ mb: 0.5 }}
                >
                  {heading.title}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
                  {heading.subtitle}
                </Typography>
              </Box>

              {/* ──── Step 1: Username + DOB ──── */}
              {step === 1 && (
                <Stack component="form" spacing={0} onSubmit={handleStep1Next}>
                  <AuthField
                    id="onboarding-username"
                    label="Username"
                    noTopMargin
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.replace(/\s/g, ""));
                      setUsernameError(null);
                    }}
                    onBlur={() => {
                      const t = username.trim();
                      if (t) {
                        const check = validateCleanText(t, "username");
                        setUsernameError(
                          !check.ok
                            ? (check.reason ??
                                "That username isn't allowed. Try something else.")
                            : null,
                        );
                      } else {
                        setUsernameError(null);
                      }
                    }}
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
                    helperText={dateOfBirthError ?? "You must be 18+ to use NewChums."}
                    error={Boolean(dateOfBirthError)}
                  />
                  <AppButton type="submit" fullWidth size="large" sx={{ mt: 2 }}>
                    Continue
                  </AppButton>
                </Stack>
              )}

              {/* ──── Step 2: Hobbies (optional) ──── */}
              {step === 2 && (
                <Stack spacing={2}>
                  <HobbiesStep value={hobbies} onChange={setHobbies} />
                  <AppButton fullWidth size="large" onClick={goForward}>
                    Continue
                  </AppButton>
                  <AppButton
                    fullWidth
                    size="large"
                    variant="text"
                    color="inherit"
                    onClick={goForward}
                    sx={{ color: "text.secondary", textTransform: "none" }}
                  >
                    Skip for now
                  </AppButton>
                </Stack>
              )}

              {/* ──── Step 3: Location (optional) ──── */}
              {step === 3 && (
                <Stack spacing={2}>
                  <LocationStep
                    homeAddress={homeAddress}
                    onAddressChange={(v) => {
                      setHomeAddress(v);
                      if (!v.trim()) {
                        setHomeLat(null);
                        setHomeLng(null);
                      }
                    }}
                    onPlaceSelect={handlePlaceSelect}
                    travelRadiusKm={travelRadiusKm}
                    onTravelRadiusChange={setTravelRadiusKm}
                  />
                  {generalError && (
                    <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>
                      {generalError}
                    </Typography>
                  )}
                  <AppButton
                    fullWidth
                    size="large"
                    disabled={isSubmitting}
                    onClick={submitOnboarding}
                  >
                    {isSubmitting ? "Saving..." : "Let's go"}
                  </AppButton>
                  <AppButton
                    fullWidth
                    size="large"
                    variant="text"
                    color="inherit"
                    disabled={isSubmitting}
                    onClick={() => {
                      setHomeAddress("");
                      setHomeLat(null);
                      setHomeLng(null);
                      submitOnboarding();
                    }}
                    sx={{ color: "text.secondary", textTransform: "none" }}
                  >
                    Skip for now
                  </AppButton>
                </Stack>
              )}
            </Stack>
          </StepTransition>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
