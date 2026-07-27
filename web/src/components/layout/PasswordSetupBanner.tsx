"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import NextLink from "next/link";

/** Dismissal is remembered for this long, then the nudge returns if the
 *  password still is not set. Long enough not to feel relentless, short
 *  enough that the account does not stay half-finished forever. */
const DISMISS_DAYS = 7;
const DISMISS_MS = DISMISS_DAYS * 24 * 60 * 60 * 1000;

const storageKey = (userKey?: string | null) =>
  `nc_pw_setup_dismissed_${userKey ?? "anon"}`;

/**
 * Quiet in-app nudge for users whose account was created via the lightweight
 * plan-entry flow and who haven't set a password yet.
 *
 * Deliberately understated: a slim single-line strip that reads as page
 * furniture, not an alert. It sits above the page content and must never be
 * the loudest thing on screen, in particular on the plan page right after
 * someone has RSVPed.
 *
 * Dismissal persists in localStorage per user (read in an effect, never
 * during render, so the server and first client render agree) and expires
 * after DISMISS_DAYS so the nudge returns for accounts that still have no
 * password.
 */
export default function PasswordSetupBanner({ userKey }: { userKey?: string | null }) {
  // Start hidden and reveal only after the stored dismissal has been read.
  // Rendering it first and hiding it later would flash the strip and shift
  // the page under anything that has already scrolled.
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    let dismissedAt = 0;
    try {
      const raw = window.localStorage.getItem(storageKey(userKey));
      dismissedAt = raw ? Number.parseInt(raw, 10) : 0;
    } catch {
      dismissedAt = 0;
    }
    const stillDismissed =
      Number.isFinite(dismissedAt) && dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_MS;
    setVisible(!stillDismissed);
  }, [userKey]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey(userKey), String(Date.now()));
    } catch {
      /* private mode: dismissal is then session-only, which is acceptable */
    }
  }, [userKey]);

  if (!visible) return null;

  return (
    <Box
      role="status"
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: { xs: 2, sm: 3 },
        py: 0.5,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <LockOpenRoundedIcon sx={{ color: "text.disabled", fontSize: 16, flexShrink: 0 }} />
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            flex: 1,
            minWidth: 0,
            // Wrapping rather than ellipsis: clipping this line would cut off
            // the action itself on narrow screens. One line on desktop, at
            // most two on mobile, which is still quiet.
            lineHeight: 1.4,
          }}
        >
          Set a password so you can sign in without an email link.{" "}
          <Typography
            component={NextLink}
            href="/settings#account"
            variant="caption"
            sx={{
              color: "primary.main",
              fontWeight: 700,
              textDecoration: "underline",
              "&:hover": { color: "primary.dark" },
            }}
          >
            Set one up
          </Typography>
        </Typography>
        <IconButton
          aria-label="Dismiss"
          size="small"
          onClick={dismiss}
          sx={{ color: "text.disabled", p: 0.25, flexShrink: 0 }}
        >
          <CloseRoundedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Stack>
    </Box>
  );
}
