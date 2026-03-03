"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, clearAuthTokenCache } from "@/lib/apiClient";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { NOTIFICATION_TYPES } from "./notificationConfig";
import NotificationRow from "./NotificationRow";

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changeEmailSubmitting, setChangeEmailSubmitting] = useState(false);
  const [changeEmailSuccess, setChangeEmailSuccess] = useState(false);
  const [changeEmailError, setChangeEmailError] = useState<string | null>(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordSubmitting, setChangePasswordSubmitting] = useState(false);
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountSubmitting, setDeleteAccountSubmitting] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/profile", { auth: true });
      const data = await res.json();
      if (data.ok && data.profile) {
        setEmail(data.profile.email ?? "");
        setHasPassword(data.profile.has_password ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, { enabled: boolean; frequency: string }>
  >({});
  const [notificationPrefsLoading, setNotificationPrefsLoading] = useState(true);
  const lastGoodPrefs = useRef<Record<string, { enabled: boolean; frequency: string }>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotificationPrefs = useCallback(async () => {
    setNotificationPrefsLoading(true);
    try {
      const res = await apiFetch("/notification-preferences", { auth: true });
      const data = await res.json();
      if (data.ok && data.prefs?.items) {
        const items = data.prefs.items as Record<string, { enabled: boolean; frequency: string }>;
        const normalized = Object.fromEntries(
          NOTIFICATION_TYPES.map((t) => {
            const raw = items[t.key];
            const enabled = raw?.enabled ?? true;
            let frequency = raw?.frequency ?? t.allowedFrequencies[0]?.value ?? "immediately";
            if (frequency === "never") {
              frequency = t.allowedFrequencies[0]?.value ?? "immediately";
            }
            return [
              t.key,
              { enabled, frequency },
            ];
          })
        );
        setNotificationPrefs(normalized);
        lastGoodPrefs.current = normalized;
      }
    } finally {
      setNotificationPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchNotificationPrefs();
  }, [fetchProfile, fetchNotificationPrefs]);

  const persistNotificationPrefs = useCallback(
    async (prefs: Record<string, { enabled: boolean; frequency: string }>) => {
      const fullItems = Object.fromEntries(
        NOTIFICATION_TYPES.map((t) => [
          t.key,
          prefs[t.key] ?? {
            enabled: true,
            frequency: t.allowedFrequencies[0]?.value ?? "immediately",
          },
        ])
      );
      try {
        const res = await apiFetch("/notification-preferences", {
          method: "PUT",
          auth: true,
          body: JSON.stringify({
            prefs: { version: 1, items: fullItems },
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error("Couldn't save notification settings");
          setNotificationPrefs(lastGoodPrefs.current);
          return;
        }
        lastGoodPrefs.current = fullItems;
        toast.success("Notification preferences saved");
      } catch {
        toast.error("Couldn't save notification settings");
        setNotificationPrefs(lastGoodPrefs.current);
      }
    },
    [toast]
  );

  const scheduleNotificationSave = useCallback(
    (prefs: Record<string, { enabled: boolean; frequency: string }>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null;
        persistNotificationPrefs(prefs);
      }, 500);
    },
    [persistNotificationPrefs]
  );

  const setNotificationEnabled = (key: string, enabled: boolean) => {
    const next = {
      ...notificationPrefs,
      [key]: {
        enabled,
        frequency: notificationPrefs[key]?.frequency ?? "immediately",
      },
    };
    setNotificationPrefs(next);
    scheduleNotificationSave(next);
  };

  const setNotificationFrequency = (key: string, frequency: string) => {
    const next = {
      ...notificationPrefs,
      [key]: {
        enabled: notificationPrefs[key]?.enabled ?? true,
        frequency,
      },
    };
    setNotificationPrefs(next);
    scheduleNotificationSave(next);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
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
          Settings
        </Typography>
        <Stack spacing={0.25} sx={{ mt: 1 }}>
          <Typography
            color="text.secondary"
            sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}
          >
            Manage your account, notifications, and preferences.
          </Typography>
        </Stack>
      </Box>

      {/* Account */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Account</Typography>
          <AppTextField
            label="Email"
            value={email}
            disabled
            helperText="Your sign-in email address"
          />
          <Button variant="outlined" size="small" onClick={() => setChangeEmailOpen(true)}>
            Change email
          </Button>
          <AppTextField
            label="Password"
            value="••••••••"
            disabled
            type="password"
            InputProps={{
              readOnly: true,
            }}
            helperText="Your password is hidden for security"
          />
          <Button variant="outlined" size="small" onClick={() => setChangePasswordOpen(true)}>
            Change password
          </Button>
          <Box sx={{ mt: 1 }}>
            <Link
              href={email ? `/forgot-password?email=${encodeURIComponent(email)}` : "/forgot-password"}
              style={{ textDecoration: "none" }}
            >
              <Typography variant="body2" color="primary" component="span" sx={{ textDecoration: "underline" }}>
                Forgot your password?
              </Typography>
            </Link>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 0.5 }}>
              We&apos;ll email you a reset link.
            </Typography>
          </Box>
        </Stack>
      </AppCard>

      {/* Notifications */}
      <AppCard>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6">Notifications</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
               We&apos;ll save your notifications based on your preferences, and send them together in a single email.
            </Typography>
          </Box>
          {NOTIFICATION_TYPES.map((type, index) => {
            const prefs = notificationPrefs[type.key] ?? {
              enabled: true,
              frequency: type.allowedFrequencies[0]?.value ?? "immediately",
            };
            return (
              <NotificationRow
                key={type.key}
                config={type}
                enabled={prefs.enabled}
                frequency={prefs.frequency}
                onToggle={(enabled) => setNotificationEnabled(type.key, enabled)}
                onFrequencyChange={(freq) => setNotificationFrequency(type.key, freq)}
                showDivider={index > 0}
                disabled={notificationPrefsLoading}
              />
            );
          })}
        </Stack>
      </AppCard>

      {/* Danger zone */}
      <AppCard sx={{ borderColor: "error.light", borderWidth: 1 }}>
        <Stack spacing={2}>
          <Typography variant="h6" color="error">
            Danger zone
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Permanently delete your account and all data. This cannot be undone.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => setDeleteAccountOpen(true)}
          >
            Delete account
          </Button>
        </Stack>
      </AppCard>

      {/* Change email dialog */}
      <Dialog
        open={changeEmailOpen}
        onClose={() => {
          if (!changeEmailSubmitting) {
            setChangeEmailOpen(false);
            setChangeEmailSuccess(false);
            setNewEmail("");
            setChangeEmailError(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change email</DialogTitle>
        <DialogContent>
          {changeEmailSuccess ? (
            <Typography color="text.secondary">
              Check your new email to confirm the change. We've also sent a notification to your current email.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography color="text.secondary" variant="body2">
                We'll send a confirmation link to your new email. Your current email will also receive a notification.
              </Typography>
              <AppTextField
                label="New email"
                type="email"
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setChangeEmailError(null);
                }}
                placeholder="you@example.com"
                helperText={changeEmailError ?? " "}
                error={Boolean(changeEmailError)}
                disabled={changeEmailSubmitting}
                autoComplete="email"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {changeEmailSuccess ? (
            <Button onClick={() => setChangeEmailOpen(false)}>Done</Button>
          ) : (
            <>
              <Button onClick={() => setChangeEmailOpen(false)} disabled={changeEmailSubmitting}>
                Cancel
              </Button>
              <AppButton
                variant="contained"
                disabled={changeEmailSubmitting || !newEmail.trim()}
                onClick={async () => {
                  const trimmed = newEmail.trim().toLowerCase();
                  if (!trimmed) return;
                  setChangeEmailSubmitting(true);
                  setChangeEmailError(null);
                  try {
                    const res = await apiFetch("/account/email-change/request", {
                      method: "POST",
                      auth: true,
                      body: JSON.stringify({ newEmail: trimmed }),
                    });
                    const data = (await res.json()) || {};
                    if (!res.ok || !data.ok) {
                      if (data.error === "SAME_EMAIL") setChangeEmailError("New email is the same as your current email.");
                      else if (data.error === "EMAIL_IN_USE") setChangeEmailError("This email is already in use by another account.");
                      else if (data.error === "RATE_LIMIT") setChangeEmailError("Too many requests. Please try again later.");
                      else if (data.error === "INVALID_INPUT") setChangeEmailError(data.message || "Please enter a valid email address.");
                      else setChangeEmailError(data.message || "Failed to send confirmation email.");
                      return;
                    }
                    setChangeEmailSuccess(true);
                  } catch {
                    setChangeEmailError("Something went wrong. Please try again.");
                  } finally {
                    setChangeEmailSubmitting(false);
                  }
                }}
              >
                {changeEmailSubmitting ? "Sending…" : "Send confirmation link"}
              </AppButton>
            </>
          )}
        </DialogActions>
      </Dialog>
      
      <Dialog
        open={changePasswordOpen}
        onClose={() => {
          if (!changePasswordSubmitting) {
            setChangePasswordOpen(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setCurrentPasswordError(null);
            setNewPasswordError(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          {!hasPassword ? (
            <Typography color="text.secondary">
              This account signs in with Google. Password changes aren't available.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography color="text.secondary" variant="body2">
                You'll stay signed in.
              </Typography>
              <AppTextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  setCurrentPasswordError(null);
                }}
                helperText={currentPasswordError ?? " "}
                error={Boolean(currentPasswordError)}
                disabled={changePasswordSubmitting}
                autoComplete="current-password"
              />
              <AppTextField
                label="New password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setNewPasswordError(null);
                }}
                helperText={newPasswordError ?? "Use at least 8 characters."}
                error={Boolean(newPasswordError)}
                disabled={changePasswordSubmitting}
                autoComplete="new-password"
              />
              <AppTextField
                label="Confirm new password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                helperText={
                  confirmPassword && newPassword !== confirmPassword
                    ? "Passwords don't match"
                    : " "
                }
                error={Boolean(confirmPassword && newPassword !== confirmPassword)}
                disabled={changePasswordSubmitting}
                autoComplete="new-password"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setChangePasswordOpen(false);
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setCurrentPasswordError(null);
              setNewPasswordError(null);
            }}
            disabled={changePasswordSubmitting}
          >
            Cancel
          </Button>
          {hasPassword && (
            <AppButton
              variant="contained"
              disabled={
                changePasswordSubmitting ||
                !currentPassword.trim() ||
                !newPassword.trim() ||
                newPassword !== confirmPassword ||
                newPassword.length < 8
              }
              onClick={async () => {
                if (
                  !currentPassword.trim() ||
                  !newPassword.trim() ||
                  newPassword.length < 8 ||
                  newPassword !== confirmPassword
                ) {
                  return;
                }
                setChangePasswordSubmitting(true);
                setCurrentPasswordError(null);
                setNewPasswordError(null);
                try {
                  const res = await apiFetch("/account/password-change", {
                    method: "POST",
                    auth: true,
                    body: JSON.stringify({
                      currentPassword: currentPassword.trim(),
                      newPassword: newPassword.trim(),
                    }),
                  });
                  const data = (await res.json()) || {};
                  if (!res.ok || !data.ok) {
                    const code = data.code ?? data.error;
                    const msg = data.message ?? "Failed to change password.";
                    if (code === "OAUTH_ACCOUNT") {
                      setNewPasswordError("This account signs in with Google. Password changes aren't available.");
                    } else if (code === "INVALID_PASSWORD") {
                      setCurrentPasswordError(msg);
                    } else if (code === "WEAK_PASSWORD" || code === "INVALID_INPUT") {
                      setNewPasswordError(msg);
                    } else {
                      setNewPasswordError(msg);
                    }
                    return;
                  }
                  toast.success("Password updated");
                  setChangePasswordOpen(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                  setCurrentPasswordError(null);
                  setNewPasswordError(null);
                } catch {
                  setNewPasswordError("Something went wrong. Please try again.");
                } finally {
                  setChangePasswordSubmitting(false);
                }
              }}
            >
              {changePasswordSubmitting ? "Saving…" : "Save"}
            </AppButton>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={deleteAccountOpen}
        onClose={() => {
          if (!deleteAccountSubmitting) {
            setDeleteAccountOpen(false);
            setDeleteAccountPassword("");
            setDeleteAccountError(null);
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            This will permanently delete your account, events, and related data. This action cannot be undone.
          </Typography>
          {hasPassword ? (
            <Box sx={{ mt: 2 }}>
              <AppTextField
                label="Confirm with your password"
                type="password"
                value={deleteAccountPassword}
                onChange={(e) => {
                  setDeleteAccountPassword(e.target.value);
                  setDeleteAccountError(null);
                }}
                helperText={deleteAccountError ?? " "}
                error={Boolean(deleteAccountError)}
                disabled={deleteAccountSubmitting}
                autoComplete="current-password"
              />
            </Box>
          ) : (
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1.5 }}>
              You&apos;ll be signed out immediately.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteAccountOpen(false);
              setDeleteAccountPassword("");
              setDeleteAccountError(null);
            }}
            disabled={deleteAccountSubmitting}
          >
            Cancel
          </Button>
          <AppButton
            color="error"
            variant="contained"
            disabled={
              deleteAccountSubmitting ||
              (hasPassword && !deleteAccountPassword.trim())
            }
            onClick={async () => {
              if (deleteAccountSubmitting) return;
              if (hasPassword && !deleteAccountPassword.trim()) return;
              setDeleteAccountSubmitting(true);
              setDeleteAccountError(null);
              try {
                const res = await apiFetch("/account", {
                  method: "DELETE",
                  auth: true,
                  body: hasPassword
                    ? JSON.stringify({ password: deleteAccountPassword.trim() })
                    : undefined,
                });
                const data = (await res.json()) || {};
                if (!res.ok || !data.ok) {
                  const code = data.code ?? data.error;
                  if (code === "INVALID_PASSWORD") {
                    setDeleteAccountError(data.message ?? "Incorrect password.");
                    return;
                  }
                  toast.error("Unable to delete account. Please try again.");
                  return;
                }
                clearAuthTokenCache();
                toast.success("Your account has been deleted.");
                setDeleteAccountOpen(false);
                setDeleteAccountPassword("");
                await signOut({ redirect: false });
                router.push("/");
              } catch {
                toast.error("Unable to delete account. Please try again.");
              } finally {
                setDeleteAccountSubmitting(false);
              }
            }}
          >
            {deleteAccountSubmitting ? "Deleting…" : "Delete account"}
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
