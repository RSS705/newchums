"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useState } from "react";
import Link from "next/link";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import { apiFetch } from "@/lib/apiClient";
import { CONTACT_SUBJECT_OPTIONS } from "@/lib/contact";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import TurnstileWidget from "./TurnstileWidget";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LEN = 10;
const MAX_MESSAGE_LEN = 2000;
const MAX_NAME_LEN = 80;

type ContactViewProps = {
  /** Prefill when user is logged in */
  initialName?: string;
  initialEmail?: string;
  /** When true, Turnstile is not shown and not required */
  isLoggedIn?: boolean;
  /** Cloudflare Turnstile site key for logged-out spam protection. If unset, no Turnstile. */
  turnstileSiteKey?: string;
};

/**
 * Contact form. Sends to POST /contact.
 */
export default function ContactView({
  initialName = "",
  initialEmail = "",
  isLoggedIn = false,
  turnstileSiteKey = "",
}: ContactViewProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const toast = useToast();

  const needsTurnstile = !isLoggedIn && turnstileSiteKey;
  const turnstileValid = !needsTurnstile || turnstileToken !== "";

  const isValid =
    subject !== "" &&
    name.trim().length >= 1 &&
    name.trim().length <= MAX_NAME_LEN &&
    EMAIL_REGEX.test(email.trim()) &&
    message.trim().length >= MIN_MESSAGE_LEN &&
    message.trim().length <= MAX_MESSAGE_LEN &&
    turnstileValid;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || submitting) return;

      setSubmitting(true);
      setEmailError(null);
      setMessageError(null);
      try {
        const body: Record<string, string> = {
          name: name.trim(),
          email: email.trim(),
          subject,
          message: message.trim(),
          website: website.trim(),
        };
        if (turnstileToken) body.turnstileToken = turnstileToken;

        const res = await apiFetch("/contact", {
          method: "POST",
          auth: true,
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };

        if (!res.ok) {
          const msg =
            data.error === "RATE_LIMITED"
              ? "Too many submissions. Please try again later."
              : data.error === "TURNSTILE_REQUIRED" || data.error === "TURNSTILE_FAILED"
                ? "Verification failed. Please try again."
                : data.message ?? "Something went wrong. Please try again.";
          toast.error(msg);
          return;
        }

        if (data.ok) {
          setSubmittedEmail(email.trim());
          setSuccess(true);
          setName("");
          setEmail("");
          setSubject("");
          setMessage("");
          setWebsite("");
          setTurnstileToken("");
        }
      } catch {
        toast.error("Failed to send message. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [isValid, submitting, name, email, subject, message, website, turnstileToken, toast]
  );

  const handleEmailBlur = useCallback(() => {
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError(null);
    }
  }, [email]);

  const handleMessageBlur = useCallback(() => {
    const len = message.trim().length;
    if (len > 0 && len < MIN_MESSAGE_LEN) {
      setMessageError(`Message must be at least ${MIN_MESSAGE_LEN} characters.`);
    } else {
      setMessageError(null);
    }
  }, [message]);

  if (success) {
    return (
      <Stack spacing={{ xs: 3, sm: 4 }} sx={{ width: "100%" }}>
        <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "1.75rem", sm: "2rem" },
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: "-0.02em",
            }}
          >
            Contact
          </Typography>
        </Box>
        <AppCard
          component="section"
          aria-live="polite"
          aria-atomic="true"
          sx={{
            borderRadius: { xs: 2, sm: 2.5 },
            overflow: "hidden",
            bgcolor: "background.paper",
            boxShadow: (theme) =>
              theme.palette.mode === "light"
                ? "0 1px 3px rgba(0,0,0,0.08)"
                : "0 1px 3px rgba(0,0,0,0.2)",
            borderTop: "4px solid",
            borderTopColor: "secondary.main",
          }}
        >
          <Stack spacing={2}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <CheckCircleOutlineRoundedIcon
                sx={{ fontSize: 32, color: "success.main" }}
                aria-hidden
              />
              <Typography
                component="h2"
                sx={{
                  fontSize: { xs: "1.25rem", sm: "1.375rem" },
                  fontWeight: 700,
                  color: "text.primary",
                  letterSpacing: "-0.01em",
                }}
              >
                Message received
              </Typography>
            </Box>
            <Stack spacing={1.25}>
              <Typography color="text.secondary" sx={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
                Thanks for reaching out, we&apos;ve got your message.
              </Typography>
              <Typography color="text.secondary" sx={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
                We typically reply within 1–2 business days.
              </Typography>
              {submittedEmail && (
                <Typography color="text.secondary" sx={{ fontSize: "0.9375rem", lineHeight: 1.5 }}>
                  We&apos;ll reply to{" "}
                  <Typography component="span" sx={{ fontWeight: 600, color: "text.primary" }}>
                    {submittedEmail}
                  </Typography>
                  .
                </Typography>
              )}
            </Stack>
            <Box sx={{ pt: 1 }}>
              <AppButton
                component={Link}
                href="/"
                variant="contained"
                color="primary"
                size="medium"
                sx={{
                  alignSelf: "flex-start",
                  borderRadius: 2.5,
                  textTransform: "none",
                  "&:hover": { backgroundColor: "primary.dark" },
                }}
              >
                {isLoggedIn ? "Back to exploring" : "Back to home"}
              </AppButton>
            </Box>
          </Stack>
        </AppCard>
      </Stack>
    );
  }

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
          }}
        >
          Contact
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" }, mt: 1 }}
        >
          Have a question, idea, or something to report? Reach us at{" "}
          <Typography
            component="a"
            href="mailto:contact@newchums.com"
            sx={{ color: "primary.main", fontWeight: 500, textDecoration: "none" }}
          >
            contact@newchums.com
          </Typography>
          .
        </Typography>
      </Box>

      <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontSize: { xs: "1rem", sm: "1.125rem" } }}>
              Contact form
            </Typography>
            {/* Honeypot */}
            <Box component="div" aria-hidden="true" sx={{ position: "absolute", left: -9999, overflow: "hidden" }}>
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <AppTextField
                  id="contact-name"
                  label="Name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  inputProps={{ maxLength: MAX_NAME_LEN }}
                  helperText={`${name.length}/${MAX_NAME_LEN}`}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <AppTextField
                  id="contact-email"
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  onBlur={handleEmailBlur}
                  error={Boolean(emailError)}
                  helperText={emailError ?? " "}
                />
              </Grid>
              <Grid size={12}>
                <AppTextField
                  select
                  id="contact-subject"
                  label="Subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  SelectProps={{ native: true }}
                  helperText=" "
                  required
                >
                  {CONTACT_SUBJECT_OPTIONS.map((opt) => (
                    <option key={opt.value || "placeholder"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </AppTextField>
              </Grid>
              <Grid size={12}>
                <AppTextField
                  id="contact-message"
                  label="Message"
                  placeholder="Your message (10–2000 characters)"
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    setMessageError(null);
                  }}
                  onBlur={handleMessageBlur}
                  multiline
                  rows={4}
                  inputProps={{ maxLength: MAX_MESSAGE_LEN }}
                  error={Boolean(messageError)}
                  helperText={messageError ?? `${message.length}/${MAX_MESSAGE_LEN}`}
                />
              </Grid>
              {needsTurnstile && (
                <Grid size={12}>
                  <TurnstileWidget
                    key={turnstileKey}
                    siteKey={turnstileSiteKey}
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken("")}
                    onError={() => setTurnstileToken("")}
                  />
                </Grid>
              )}
              <Grid size={12}>
                <AppButton
                  type="submit"
                  disabled={!isValid || submitting}
                  fullWidth
                  size="large"
                  sx={{
                    py: { xs: 1.25, sm: 1 },
                    borderRadius: 2.5,
                    textTransform: "none",
                  }}
                >
                  {submitting ? "Sending…" : "Submit"}
                </AppButton>
              </Grid>
            </Grid>
          </Stack>
        </form>
      </AppCard>
    </Stack>
  );
}
