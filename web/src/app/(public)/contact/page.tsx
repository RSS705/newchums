"use client";

import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import AuthSplitLayout from "@/components/layout/AuthSplitLayout";
import AuthField from "@/components/auth/AuthField";
import { AppButton, AppCard } from "@/components/ui";

export default function ContactPage() {
  return (
    <AuthSplitLayout>
      <AppCard sx={{ width: "100%", maxWidth: 450 }}>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5, textAlign: "center" }}>
          Contact
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mt: 1, mb: 2, textAlign: "center" }}>
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

        <Typography variant="subtitle2" fontWeight={600} color="text.secondary" sx={{ mt: 2, mb: 0.5 }}>
          Contact form (coming soon)
        </Typography>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <AuthField id="contact-name" label="Name" disabled placeholder="Your name" noTopMargin />
          <AuthField id="contact-email" label="Email" type="email" disabled placeholder="you@example.com" />
          <AuthField id="contact-message" label="Message" disabled placeholder="Your message" multiline rows={3} />
          <AppButton disabled fullWidth size="large">
            Submit
          </AppButton>
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mt: 3, justifyContent: "center" }}>
          <AppButton component={Link} href="/login" variant="outlined" size="medium" color="primary">
            Back to login
          </AppButton>
          <AppButton component={Link} href="/" variant="outlined" size="medium" color="primary">
            Back to home
          </AppButton>
        </Stack>
      </AppCard>
    </AuthSplitLayout>
  );
}
