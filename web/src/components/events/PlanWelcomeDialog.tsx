"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";
import useMediaQuery from "@mui/material/useMediaQuery";
import type { Theme } from "@mui/material/styles";
import Link from "next/link";
import { apiFetch } from "@/lib/apiClient";
import ConfettiBurst from "@/components/ui/ConfettiBurst";

/** Post-signup welcome moment on the plan page.
 *
 *  Shown exactly when the lightweight-signup intent auto-applies (the user
 *  arrived via a share or invite link, picked Going or Maybe before
 *  verifying, and just landed back signed in). Until this existed the
 *  auto-apply was silent, which left brand-new users unsure whether they
 *  had joined and, worse, unaware of the fun username the signup assigned
 *  them, so they could not find themselves in Who's in.
 *
 *  The dialog confirms the RSVP, names their identity, and offers the two
 *  useful next steps (edit profile; set a password so future sign-ins skip
 *  the email code, only shown while the account has no password). Clicking
 *  the backdrop or Escape closes it, and it fires a confetti burst because
 *  joining a plan should feel like a small win.
 */
export default function PlanWelcomeDialog({
  open,
  onClose,
  intent,
  planTitle,
  prefetch,
}: {
  open: boolean;
  onClose: () => void;
  intent: "going" | "maybe";
  planTitle?: string;
  /** Start loading the profile before `open` flips true. The caller delays
   *  opening until its scroll settles; prefetching during that window means
   *  the identity panel is already there when the dialog fades in, instead
   *  of popping in a beat later and shifting the layout. */
  prefetch?: boolean;
}) {
  const [handle, setHandle] = React.useState<string | null>(null);
  const [hasPassword, setHasPassword] = React.useState<boolean | null>(null);
  const fetchedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open && !prefetch) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          profile?: { username?: string | null; has_password?: boolean };
        };
        if (cancelled || !data.profile) return;
        const raw = (data.profile.username ?? "").trim().replace(/^@/, "");
        setHandle(raw ? `@${raw}` : null);
        setHasPassword(data.profile.has_password ?? null);
      } catch {
        /* the dialog still confirms the RSVP without the handle */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, prefetch]);

  const cleanTitle = planTitle?.trim();
  // Below sm the theme renders dialogs as full-screen sheets, so "the list
  // below" points at nothing the user can see; name the destination instead.
  const isFullScreenSheet = useMediaQuery((theme: Theme) => theme.breakpoints.down("sm"));

  return (
    <>
      {open && <ConfettiBurst />}
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4 } }}
      >
        {/* The theme turns dialogs into full-screen sheets below sm; auto
            margins center the content in the spare height while an
            overflowing short-landscape screen still scrolls from the top. */}
        <DialogContent sx={{ p: { xs: 2.5, sm: 3 }, display: "flex", flexDirection: "column" }}>
          <Stack spacing={2} alignItems="center" sx={{ my: "auto", textAlign: "center" }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                bgcolor: "primary.light",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                lineHeight: 1,
              }}
            >
              🎉
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: "1.25rem", lineHeight: 1.3 }}>
                {intent === "going" ? "You're in!" : "You're on the list!"}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, lineHeight: 1.55 }}>
                You&apos;re marked as {intent === "going" ? "Going" : "Maybe"}
                {cleanTitle ? ` for "${cleanTitle}"` : " for this plan"}. The host can see you in
                the plan&apos;s Who&apos;s in list{isFullScreenSheet ? "" : " below"}.
              </Typography>
            </Box>

            {handle && (
              <Box
                sx={{
                  width: "100%",
                  px: 2,
                  py: 1.5,
                  borderRadius: 2.5,
                  bgcolor: "background.default",
                  border: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                  You&apos;re appearing as
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: "1.0625rem", color: "primary.dark", wordBreak: "break-all" }}>
                  {handle}
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.25, lineHeight: 1.5 }}>
                  We picked this name for you so signing up stayed quick. You can change it any
                  time from your profile.
                </Typography>
              </Box>
            )}

            <Stack spacing={1} sx={{ width: "100%" }}>
              <Button
                onClick={onClose}
                variant="contained"
                fullWidth
                sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", "&:hover": { boxShadow: "none" } }}
              >
                Sounds good
              </Button>
              <Button
                component={Link}
                href="/profile"
                variant="text"
                sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary" }}
              >
                Edit my profile
              </Button>
            </Stack>

            {hasPassword === false && (
              <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: 1.5 }}>
                Tip: <MuiLink component={Link} href="/settings" sx={{ fontWeight: 600 }}>set a password in Settings</MuiLink>{" "}
                to sign back in without an email code next time.
              </Typography>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
