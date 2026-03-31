"use client";

import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import IconButton from "@mui/material/IconButton";
import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { signIn } from "next-auth/react";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import * as React from "react";
import AuthDividerForm from "@/components/auth/AuthDividerForm";
import AuthErrorBanner from "@/components/auth/AuthErrorBanner";
import AuthField from "@/components/auth/AuthField";
import NCDatePicker from "@/components/fields/NCDatePicker";
import AuthFooterLink from "@/components/auth/AuthFooterLink";
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

const TOTAL_STEPS = 4;

export default function SignupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = React.useState(1);
  const [direction, setDirection] = React.useState<"forward" | "back">("forward");

  // Step 1: Account credentials
  const [email, setEmail] = React.useState(searchParams.get("email") ?? "");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = React.useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = React.useState(false);
  const [legalError, setLegalError] = React.useState<string | null>(null);

  // Step 2: Identity
  const [username, setUsername] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [usernameError, setUsernameError] = React.useState<string | null>(null);
  const [dateOfBirthError, setDateOfBirthError] = React.useState<string | null>(null);

  // Step 3: Hobbies
  const [hobbies, setHobbies] = React.useState<InterestOption[]>([]);

  // Step 4: Location
  const [homeAddress, setHomeAddress] = React.useState("");
  const [homeLat, setHomeLat] = React.useState<number | null>(null);
  const [homeLng, setHomeLng] = React.useState<number | null>(null);
  const [travelRadiusKm, setTravelRadiusKm] = React.useState(200);

  // Shared
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [suspended, setSuspended] = React.useState(false);

  const nextParam = searchParams.get("next");
  const errorParam = searchParams.get("error");
  const inviteToken = searchParams.get("invite");
  const redirectTarget = getSafeRedirectPath(nextParam);

  const isSuspendedParam =
    errorParam === "AccountSuspended" ||
    errorParam === "OAuthAccountSuspended" ||
    errorParam === "UserSuspended";

  const goForward = () => {
    setDirection("forward");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const goBack = () => {
    setDirection("back");
    setStep((s) => Math.max(s - 1, 1));
  };

  const validateStep1 = (): boolean => {
    setEmailError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setLegalError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setEmailError("Email address is required.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    if (!password || password.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return false;
    }
    if (confirmPassword !== password) {
      setConfirmPasswordError("Passwords do not match.");
      return false;
    }
    if (!legalAccepted) {
      setLegalError("Please agree to the Terms of Use and Privacy Policy to continue.");
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
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
        "Use 3\u201320 lowercase letters, numbers, or underscores; no leading/trailing underscore.",
      );
      return false;
    }
    const usernameContentCheck = validateCleanText(trimmed, "username");
    if (!usernameContentCheck.ok) {
      setUsernameError(
        usernameContentCheck.reason ?? "That username isn\u2019t allowed. Try something else.",
      );
      return false;
    }
    if (!dateOfBirth.trim()) {
      setDateOfBirthError("Date of birth is required.");
      return false;
    }
    const dob = dayjs(dateOfBirth.trim());
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

  const [checkingEmail, setCheckingEmail] = React.useState(false);

  const handleStep1Next = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    const trimmedEmail = email.trim().toLowerCase();
    setCheckingEmail(true);
    try {
      const res = await apiFetch(
        `/auth/email-verify/status?email=${encodeURIComponent(trimmedEmail)}`,
      );
      const data = (await res.json()) as { exists?: boolean };
      if (data.exists) {
        setEmailError("An account already exists for this email. Try logging in instead.");
        return;
      }
    } catch {
      // Network error, let the user proceed; the server will catch duplicates at signup
    } finally {
      setCheckingEmail(false);
    }
    goForward();
  };

  const handleStep2Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateStep2()) goForward();
  };

  const submitSignup = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const trimmedUsername = username.trim();
      const signupBody: Record<string, unknown> = {
        username: trimmedUsername,
        email: email.trim().toLowerCase(),
        date_of_birth: dateOfBirth.trim() || undefined,
        password,
        accepted_terms_version: "2026-03-17",
        accepted_privacy_version: "2026-03-17",
      };

      if (hobbies.length > 0) {
        signupBody.interest_slugs = hobbies.map((h) => h.slug);
        signupBody.interest_items = hobbies.map((h) => ({ slug: h.slug, name: h.name }));
      }
      if (homeLat != null && homeLng != null) {
        signupBody.home_city = homeAddress.trim() || null;
        signupBody.home_lat = homeLat;
        signupBody.home_lng = homeLng;
        signupBody.travel_radius_km = travelRadiusKm;
      }

      const response = await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify(signupBody),
      });
      const data = (await response.json()) as {
        ok: boolean;
        error?: string;
        code?: string;
        message?: string;
      };

      if (!response.ok || !data.ok) {
        handleSignupError(data);
        return;
      }

      const signedUpEmail = email.trim().toLowerCase();

      if (inviteToken) {
        try {
          await apiFetch("/chums/invite/accept", {
            method: "POST",
            body: JSON.stringify({ token: inviteToken, email: signedUpEmail }),
          });
        } catch { /* non-fatal */ }
      }

      await apiFetch("/auth/email-verify/request", {
        method: "POST",
        body: JSON.stringify({ email: signedUpEmail }),
      });
      router.push(
        `/auth/verify/pending?email=${encodeURIComponent(signedUpEmail)}`,
      );
    } catch {
      setError("Sign up failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignupError = (data: { error?: string; code?: string; message?: string }) => {
    if (
      data.error === "EMAIL_SUSPENDED" ||
      data.code === "EMAIL_SUSPENDED" ||
      data.error === "USER_SUSPENDED" ||
      data.error === "ACCOUNT_SUSPENDED"
    ) {
      setSuspended(true);
      goToStep(1);
    } else if (data.error === "USERNAME_TAKEN") {
      setUsernameError("Username is already taken.");
      goToStep(2);
    } else if (data.error === "INAPPROPRIATE_TEXT" || data.code === "INAPPROPRIATE_TEXT") {
      setUsernameError("That username isn\u2019t allowed. Try something else.");
      goToStep(2);
    } else if (data.error === "INVALID_USERNAME") {
      setUsernameError(
        "Use 3\u201320 lowercase letters, numbers, or underscores; no leading/trailing underscore.",
      );
      goToStep(2);
    } else if (data.error === "EMAIL_EXISTS") {
      setEmailError("An account already exists for this email.");
      goToStep(1);
    } else if (
      data.error === "REQUIRED" ||
      data.error === "INVALID_DATE" ||
      data.error === "UNDERAGE" ||
      data.error === "FUTURE_DATE"
    ) {
      if (data.error === "REQUIRED") {
        setDateOfBirthError("Date of birth is required.");
      } else if (data.error === "INVALID_DATE") {
        setDateOfBirthError("Please enter a valid date (YYYY-MM-DD).");
      } else if (data.error === "UNDERAGE") {
        setDateOfBirthError("NewChums is currently available to people 18 and older.");
      } else {
        setDateOfBirthError("Date cannot be in the future.");
      }
      goToStep(2);
    } else if (data.error === "INVALID_INPUT") {
      setError("Please complete all required fields correctly.");
      goToStep(1);
    } else {
      setError("Sign up failed. Please try again.");
    }
  };

  const goToStep = (target: number) => {
    setDirection(target < step ? "back" : "forward");
    setStep(target);
  };

  const handlePlaceSelect = (result: PlaceResult) => {
    setHomeAddress(result.formattedAddress);
    setHomeLat(result.lat);
    setHomeLng(result.lng);
  };

  const stepHeadings: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: "Welcome to NewChums",
      subtitle: "Create your account to start organizing plans and gatherings",
    },
    2: {
      title: "Pick a username",
      subtitle: "This is how others will find and recognize you",
    },
    3: {
      title: "What are you into?",
      subtitle: "Adding hobbies helps us show plans you\u2019ll enjoy. You can always update these later.",
    },
    4: {
      title: "Where are you based?",
      subtitle: "Setting your location helps us show plans near you.",
    },
  };

  const heading = stepHeadings[step]!;

  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Stack spacing={2.5}>
          <AuthErrorBanner
            code={
              isSuspendedParam
                ? "AccountSuspended"
                : suspended
                  ? "EMAIL_SUSPENDED"
                  : null
            }
          />

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
                <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
                  {heading.title}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 1 }}>
                  {heading.subtitle}
                </Typography>
              </Box>

              {/* ──── Step 1: Email + Password ──── */}
              {step === 1 && (
                <>
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
                    onClick={() => {
                      if (!legalAccepted) {
                        setLegalError("Please agree to the Terms of Use and Privacy Policy to continue.");
                        return;
                      }
                      if (inviteToken) {
                        sessionStorage.setItem("nc_pending_invite", inviteToken);
                      }
                      sessionStorage.setItem("nc_legal_accepted", JSON.stringify({
                        terms: "2026-03-17",
                        privacy: "2026-03-17",
                      }));
                      signIn("google", { redirectTo: redirectTarget });
                    }}
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
                    dividerText="or sign up with email"
                    onSubmit={handleStep1Next}
                  >
                    <AuthField
                      id="signup-email"
                      label="Email address"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setEmailError(null);
                        setSuspended(false);
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
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError(null);
                      }}
                      required
                      helperText={passwordError ?? "At least 8 characters."}
                      error={Boolean(passwordError)}
                    />
                    <AuthField
                      id="signup-confirm-password"
                      label="Confirm password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(null);
                      }}
                      required
                      helperText={confirmPasswordError ?? undefined}
                      error={Boolean(confirmPasswordError)}
                      inputProps={{ autoComplete: "new-password" }}
                    />
                    <Box sx={{ mt: 2 }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={legalAccepted}
                            onChange={(e) => {
                              setLegalAccepted(e.target.checked);
                              if (e.target.checked) setLegalError(null);
                            }}
                            size="small"
                            sx={{ alignSelf: "flex-start", mt: -0.5 }}
                          />
                        }
                        label={
                          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                            I agree to the{" "}
                            <MuiLink component={NextLink} href="/terms" target="_blank" color="primary" underline="hover">
                              Terms of Use
                            </MuiLink>{" "}
                            and acknowledge the{" "}
                            <MuiLink component={NextLink} href="/privacy" target="_blank" color="primary" underline="hover">
                              Privacy Policy
                            </MuiLink>.
                          </Typography>
                        }
                        sx={{ alignItems: "flex-start", mx: 0 }}
                      />
                      {legalError && (
                        <FormHelperText error sx={{ ml: 4 }}>
                          {legalError}
                        </FormHelperText>
                      )}
                    </Box>
                    <AppButton type="submit" fullWidth size="large" disabled={checkingEmail} sx={{ mt: 2 }}>
                      {checkingEmail ? "Checking…" : "Continue"}
                    </AppButton>
                  </AuthDividerForm>
                </>
              )}

              {/* ──── Step 2: Username + DOB ──── */}
              {step === 2 && (
                <Stack component="form" spacing={0} onSubmit={handleStep2Next}>
                  <AuthField
                    id="signup-username"
                    label="Username"
                    type="text"
                    noTopMargin
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value.replace(/\s/g, ""));
                      setUsernameError(null);
                    }}
                    onBlur={() => {
                      const trimmed = username.trim();
                      if (trimmed) {
                        const check = validateCleanText(trimmed, "username");
                        setUsernameError(
                          !check.ok
                            ? (check.reason ?? "That username isn\u2019t allowed. Try something else.")
                            : null,
                        );
                      } else {
                        setUsernameError(null);
                      }
                    }}
                    required
                    helperText={
                      usernameError ?? "Your unique handle (letters, numbers, underscores)."
                    }
                    error={Boolean(usernameError)}
                    inputProps={{ autoComplete: "username" }}
                  />
                  <NCDatePicker
                    id="signup-date-of-birth"
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

              {/* ──── Step 3: Hobbies (optional) ──── */}
              {step === 3 && (
                <Stack spacing={2}>
                  <HobbiesStep value={hobbies} onChange={setHobbies} />
                  <AppButton
                    fullWidth
                    size="large"
                    onClick={goForward}
                  >
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

              {/* ──── Step 4: Location (optional) ──── */}
              {step === 4 && (
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
                  {error && (
                    <Typography color="error" variant="body2" sx={{ textAlign: "center" }}>
                      {error}
                    </Typography>
                  )}
                  <AppButton
                    fullWidth
                    size="large"
                    disabled={isSubmitting}
                    onClick={submitSignup}
                  >
                    {isSubmitting ? "Creating account..." : "Create account"}
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
                      submitSignup();
                    }}
                    sx={{ color: "text.secondary", textTransform: "none" }}
                  >
                    Skip for now
                  </AppButton>
                </Stack>
              )}
            </Stack>
          </StepTransition>

          {step === 1 && (
            <AuthFooterLink
              prompt="Already have an account?"
              linkText="Sign in"
              href="/login"
            />
          )}
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
