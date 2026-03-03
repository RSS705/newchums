"use client";

import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LEN = 10;
const MAX_MESSAGE_LEN = 2000;
const MAX_NAME_LEN = 80;

type ContactViewProps = {
  /** Prefill when user is logged in */
  initialName?: string;
  initialEmail?: string;
};

/**
 * Contact form. Sends to POST /contact.
 */
export default function ContactView({ initialName = "", initialEmail = "" }: ContactViewProps) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const toast = useToast();

  const isValid =
    name.trim().length >= 1 &&
    name.trim().length <= MAX_NAME_LEN &&
    EMAIL_REGEX.test(email.trim()) &&
    message.trim().length >= MIN_MESSAGE_LEN &&
    message.trim().length <= MAX_MESSAGE_LEN;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || submitting) return;

      setSubmitting(true);
      try {
        const res = await apiFetch("/contact", {
          method: "POST",
          auth: true,
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            message: message.trim(),
            website: website.trim(),
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };

        if (!res.ok) {
          const msg =
            data.error === "RATE_LIMITED"
              ? "Too many submissions. Please try again later."
              : data.message ?? "Something went wrong. Please try again.";
          toast.error(msg);
          return;
        }

        if (data.ok) {
          setSuccess(true);
          setName("");
          setEmail("");
          setMessage("");
          setWebsite("");
        }
      } catch {
        toast.error("Failed to send message. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [isValid, submitting, name, email, message, website, toast]
  );

  if (success) {
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
        </Box>
        <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
          <Typography color="success.main" sx={{ py: 2, fontSize: "1.0625rem" }}>
            Thanks — we received your message.
          </Typography>
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
        <Stack spacing={0.25} sx={{ mt: 1 }}>
          <Typography
            color="text.secondary"
            sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}
          >
            Need help or have feedback? Reach us at{" "}
            <Typography
              component="a"
              href="mailto:contact@newchums.com"
              sx={{ color: "primary.main", fontWeight: 500, textDecoration: "none" }}
            >
              contact@newchums.com
            </Typography>
            .
          </Typography>
        </Stack>
      </Box>

      <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
        <form onSubmit={handleSubmit} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" sx={{ fontSize: { xs: "1rem", sm: "1.125rem" } }}>
              Contact form
            </Typography>
            {/* Honeypot - hidden from users, bots may fill it */}
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
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Grid>
              <Grid size={12}>
                <AppTextField
                  id="contact-message"
                  label="Message"
                  placeholder="Your message (10–2000 characters)"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  multiline
                  rows={4}
                  inputProps={{ maxLength: MAX_MESSAGE_LEN }}
                  helperText={`${message.length}/${MAX_MESSAGE_LEN}`}
                />
              </Grid>
              <Grid size={12}>
                <AppButton
                  type="submit"
                  disabled={!isValid || submitting}
                  fullWidth
                  size="large"
                  sx={{
                    py: { xs: 1.25, sm: 1 },
                    borderRadius: 2,
                    textTransform: "capitalize",
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
