"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import NextLink from "next/link";

/**
 * Soft in-app nudge for users whose account was created via the lightweight
 * plan-entry flow and who haven't set a password yet. Non-blocking by
 * design: the user is already a real account holder and can finish setup
 * when it's convenient. Dismissal is per-tab/session so the nudge comes
 * back after the next reload, which keeps it present until setup is
 * actually completed but avoids being aggressive within a single session.
 */
export default function PasswordSetupBanner() {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <Box
      role="status"
      sx={{
        bgcolor: "primary.50",
        borderBottom: 1,
        borderColor: "primary.100",
        px: { xs: 2, sm: 3 },
        py: 1.25,
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1, sm: 1.5 }}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          <LockOpenRoundedIcon
            sx={{ color: "primary.main", fontSize: 20, flexShrink: 0 }}
          />
          <Typography
            variant="body2"
            sx={{ color: "text.primary", lineHeight: 1.5 }}
          >
            Finish setting up your account.{" "}
            <Typography
              component={NextLink}
              href="/settings#account"
              variant="body2"
              sx={{
                color: "primary.main",
                fontWeight: 600,
                textDecoration: "underline",
                "&:hover": { color: "primary.dark" },
              }}
            >
              Set a password
            </Typography>{" "}
            so you can sign in again without needing an email link.
          </Typography>
        </Stack>
        <IconButton
          aria-label="Dismiss"
          size="small"
          onClick={() => setDismissed(true)}
          sx={{ color: "text.secondary", alignSelf: { xs: "flex-end", sm: "center" } }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  );
}
