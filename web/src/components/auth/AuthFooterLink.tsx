"use client";

import MuiLink from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import NextLink from "next/link";

/**
 * Shared auth footer helper: prompt text + accent-colored link.
 * Uses theme primary (no hardcoded colors). Scales across login, signup, forgot-password, etc.
 */
export type AuthFooterLinkProps = {
  /** Text before the link, e.g. "New to NewChums?" */
  prompt: string;
  /** Link label, e.g. "Create an account" */
  linkText: string;
  /** Target href, e.g. "/signup" */
  href: string;
};

export default function AuthFooterLink({ prompt, linkText, href }: AuthFooterLinkProps) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ mt: 3, justifyContent: "center", flexWrap: "wrap", alignItems: "center" }}
    >
      <Typography variant="subtitle1" fontWeight={500} color="text.secondary">
        {prompt}{" "}
      </Typography>
      <MuiLink
        component={NextLink}
        href={href}
        variant="subtitle1"
        fontWeight={600}
        color="primary"
        underline="hover"
        sx={{
          textUnderlineOffset: 2,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
            borderRadius: 1,
          },
        }}
      >
        {linkText}
      </MuiLink>
    </Stack>
  );
}
