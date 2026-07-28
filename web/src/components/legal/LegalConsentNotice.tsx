"use client";

import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

/**
 * Implicit consent notice shown next to any control that creates an account.
 *
 * Replaces the explicit "I agree" checkbox that used to gate signup. That
 * checkbox produced a recurring support issue: on the signup page the Google
 * button sits above it, so an unticked box made the button look broken, and
 * the failure was invisible on tall viewports. Consent is now carried by the
 * act of continuing, which is the standard pattern and removes the dead-end
 * entirely.
 *
 * Acceptance is still recorded per user, with the document versions pinned
 * server-side at the moment the account row is created. Because there is no
 * longer a checkbox artifact, that record is the only evidence a user agreed,
 * so it must not be dropped.
 *
 * This lives in one component so every account-creating surface (signup,
 * login, the invitee plan-signup card) states the same thing in the same
 * words. Anything new that can create an account should render it too.
 */
export default function LegalConsentNotice({
  action = "continuing",
  align = "center",
  sx,
}: {
  /** Verb phrase naming the action that carries the consent. */
  action?: string;
  align?: "center" | "left";
  sx?: object;
}) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ display: "block", textAlign: align, lineHeight: 1.5, ...sx }}
    >
      By {action}, you agree to the{" "}
      <MuiLink
        component={NextLink}
        href="/terms"
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        underline="hover"
      >
        Terms of Use
      </MuiLink>{" "}
      and acknowledge the{" "}
      <MuiLink
        component={NextLink}
        href="/privacy"
        target="_blank"
        rel="noopener noreferrer"
        color="primary"
        underline="hover"
      >
        Privacy Policy
      </MuiLink>
      .
    </Typography>
  );
}
