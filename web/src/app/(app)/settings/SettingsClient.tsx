"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, clearAuthTokenCache } from "@/lib/apiClient";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { NOTIFICATION_TYPES } from "./notificationConfig";
import NotificationRow from "./NotificationRow";
import PrivacyToggleRow from "./PrivacyToggleRow";

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
  const [passwordSetupPending, setPasswordSetupPending] = useState(false);
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
  const [isHiddenFromSearch, setIsHiddenFromSearch] = useState(false);
  const [isHiddenFromExternalIndexing, setIsHiddenFromExternalIndexing] = useState(false);
  const [isHiddenAge, setIsHiddenAge] = useState(false);
  const [isHiddenChumList, setIsHiddenChumList] = useState(false);
  const [isHiddenFromChumLists, setIsHiddenFromChumLists] = useState(false);
  const [isHiddenShoutouts, setIsHiddenShoutouts] = useState(false);
  const [isHiddenCommunities, setIsHiddenCommunities] = useState(false);
  const [tutorialNudgesOff, setTutorialNudgesOff] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [dmPrivacy, setDmPrivacy] = useState("everyone");
  const [dmPrivacySaving, setDmPrivacySaving] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<
    Array<{ userId: string; name: string | null; username: string | null }>
  >([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const privacySaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        setPasswordSetupPending(data.profile.password_setup_pending ?? false);
        setIsHiddenFromSearch(data.profile.is_hidden_from_search ?? false);
        setIsHiddenFromExternalIndexing(data.profile.is_hidden_from_external_indexing ?? false);
        setIsHiddenAge(data.profile.is_hidden_age ?? false);
        setIsHiddenChumList(data.profile.is_hidden_chum_list ?? false);
        setIsHiddenFromChumLists(data.profile.is_hidden_from_chum_lists ?? false);
        setIsHiddenShoutouts(data.profile.is_hidden_shoutouts ?? false);
        setIsHiddenCommunities(data.profile.is_hidden_communities ?? false);
        setTutorialNudgesOff(data.profile.tutorial_nudges_off ?? false);
        setDmPrivacy(data.profile.dm_privacy ?? "everyone");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchBlockedUsers = useCallback(async () => {
    try {
      const res = await apiFetch("/me/blocks", { auth: true });
      const data = await res.json();
      if (data.ok && Array.isArray(data.blocks)) {
        setBlockedUsers(data.blocks);
      }
    } catch {
      /* non-essential; the section just shows empty */
    }
  }, []);

  const setDmPrivacyValue = async (value: string) => {
    const previous = dmPrivacy;
    setDmPrivacy(value);
    setDmPrivacySaving(true);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ dm_privacy: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setDmPrivacy(previous);
        toast.error("Couldn't save your messaging setting");
      } else {
        toast.success("Messaging setting saved");
      }
    } catch {
      setDmPrivacy(previous);
      toast.error("Couldn't save your messaging setting");
    } finally {
      setDmPrivacySaving(false);
    }
  };

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    try {
      const res = await apiFetch(`/users/${userId}/block`, { auth: true, method: "DELETE" });
      if (res.ok) {
        setBlockedUsers((prev) => prev.filter((b) => b.userId !== userId));
        toast.success("Unblocked");
      } else {
        toast.error("Couldn't unblock. Please try again.");
      }
    } catch {
      toast.error("Couldn't unblock. Please try again.");
    } finally {
      setUnblockingId(null);
    }
  };

  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, { enabled: boolean }>
  >({});
  const [notificationPrefsLoading, setNotificationPrefsLoading] = useState(true);
  const lastGoodPrefs = useRef<Record<string, { enabled: boolean }>>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchNotificationPrefs = useCallback(async () => {
    setNotificationPrefsLoading(true);
    try {
      const res = await apiFetch("/notification-preferences", { auth: true });
      const data = await res.json();
      if (data.ok && data.prefs?.items) {
        const items = data.prefs.items as Record<string, { enabled: boolean }>;
        const normalized = Object.fromEntries(
          NOTIFICATION_TYPES.map((t) => [
            t.key,
            { enabled: items[t.key]?.enabled ?? true },
          ])
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
    fetchBlockedUsers();
  }, [fetchProfile, fetchNotificationPrefs, fetchBlockedUsers]);

  const persistNotificationPrefs = useCallback(
    async (prefs: Record<string, { enabled: boolean }>) => {
      const fullItems = Object.fromEntries(
        NOTIFICATION_TYPES.map((t) => [
          t.key,
          prefs[t.key] ?? { enabled: true },
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
    (prefs: Record<string, { enabled: boolean }>) => {
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
      [key]: { enabled },
    };
    setNotificationPrefs(next);
    scheduleNotificationSave(next);
  };

  const persistPrivacy = useCallback(
    async (
      hiddenFromSearch: boolean,
      hiddenFromExternalIndexing: boolean,
      hiddenAge: boolean,
      hiddenChumList: boolean,
      hiddenFromChumLists: boolean,
      hiddenShoutouts: boolean,
      hiddenCommunities: boolean,
    ) => {
      setPrivacyLoading(true);
      try {
        const res = await apiFetch("/profile", {
          method: "PUT",
          auth: true,
          body: JSON.stringify({
            is_hidden_from_search: hiddenFromSearch,
            is_hidden_from_external_indexing: hiddenFromExternalIndexing,
            is_hidden_age: hiddenAge,
            is_hidden_chum_list: hiddenChumList,
            is_hidden_from_chum_lists: hiddenFromChumLists,
            is_hidden_shoutouts: hiddenShoutouts,
            is_hidden_communities: hiddenCommunities,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error("Couldn't save privacy settings");
          return;
        }
        toast.success("Privacy settings saved");
      } catch {
        toast.error("Couldn't save privacy settings");
      } finally {
        setPrivacyLoading(false);
      }
    },
    [toast]
  );

  const schedulePrivacySave = useCallback(
    (
      hiddenFromSearch: boolean,
      hiddenFromExternalIndexing: boolean,
      hiddenAge: boolean,
      hiddenChumList: boolean,
      hiddenFromChumLists: boolean,
      hiddenShoutouts: boolean,
      hiddenCommunities: boolean,
    ) => {
      if (privacySaveTimeoutRef.current) clearTimeout(privacySaveTimeoutRef.current);
      privacySaveTimeoutRef.current = setTimeout(() => {
        privacySaveTimeoutRef.current = null;
        persistPrivacy(hiddenFromSearch, hiddenFromExternalIndexing, hiddenAge, hiddenChumList, hiddenFromChumLists, hiddenShoutouts, hiddenCommunities);
      }, 500);
    },
    [persistPrivacy]
  );

  const setPrivacyHiddenFromSearch = (enabled: boolean) => {
    setIsHiddenFromSearch(enabled);
    schedulePrivacySave(enabled, isHiddenFromExternalIndexing, isHiddenAge, isHiddenChumList, isHiddenFromChumLists, isHiddenShoutouts, isHiddenCommunities);
  };

  const setPrivacyHiddenFromExternalIndexing = (enabled: boolean) => {
    setIsHiddenFromExternalIndexing(enabled);
    schedulePrivacySave(isHiddenFromSearch, enabled, isHiddenAge, isHiddenChumList, isHiddenFromChumLists, isHiddenShoutouts, isHiddenCommunities);
  };

  const setPrivacyHiddenAge = (enabled: boolean) => {
    setIsHiddenAge(enabled);
    schedulePrivacySave(isHiddenFromSearch, isHiddenFromExternalIndexing, enabled, isHiddenChumList, isHiddenFromChumLists, isHiddenShoutouts, isHiddenCommunities);
  };

  const setPrivacyHiddenChumList = (enabled: boolean) => {
    setIsHiddenChumList(enabled);
    schedulePrivacySave(isHiddenFromSearch, isHiddenFromExternalIndexing, isHiddenAge, enabled, isHiddenFromChumLists, isHiddenShoutouts, isHiddenCommunities);
  };

  const setPrivacyHiddenFromChumLists = (enabled: boolean) => {
    setIsHiddenFromChumLists(enabled);
    schedulePrivacySave(isHiddenFromSearch, isHiddenFromExternalIndexing, isHiddenAge, isHiddenChumList, enabled, isHiddenShoutouts, isHiddenCommunities);
  };

  const setPrivacyHiddenShoutouts = (enabled: boolean) => {
    setIsHiddenShoutouts(enabled);
    schedulePrivacySave(isHiddenFromSearch, isHiddenFromExternalIndexing, isHiddenAge, isHiddenChumList, isHiddenFromChumLists, enabled, isHiddenCommunities);
  };

  const setPrivacyHiddenCommunities = (enabled: boolean) => {
    setIsHiddenCommunities(enabled);
    schedulePrivacySave(isHiddenFromSearch, isHiddenFromExternalIndexing, isHiddenAge, isHiddenChumList, isHiddenFromChumLists, isHiddenShoutouts, enabled);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (privacySaveTimeoutRef.current) clearTimeout(privacySaveTimeoutRef.current);
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
      {/* Header. Warm-wash hero matching the rest of the logged-in
          surfaces (Explore, Your Plans, Communities, Your Chums,
          Profile, plan detail, Roadmap) so the settings page slots
          into the same product shell. No right-side CTA: settings is
          a passive admin surface, the actions live inside each card. */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        }}
      >
        <Stack spacing={1.25}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                bgcolor: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <SettingsRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
            </Box>
            <Typography
              sx={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "primary.dark",
              }}
            >
              Preferences
            </Typography>
          </Stack>
          <Typography
            component="h1"
            sx={{
              fontSize: { xs: "1.875rem", sm: "2.375rem" },
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
              color: "text.primary",
            }}
          >
            Settings
          </Typography>
          <Typography
            variant="body1"
            color="text.secondary"
            sx={{
              fontSize: { xs: "0.9375rem", sm: "1rem" },
              lineHeight: 1.6,
              maxWidth: 560,
            }}
          >
            Manage your account, notifications, and privacy. Changes save automatically unless noted.
          </Typography>
        </Stack>
      </Paper>

      {/* Account */}
      <AppCard id="account">
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <PersonOutlineRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Account
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Email and password used to sign in.
              </Typography>
            </Box>
          </Stack>
          <AppTextField
            label="Email"
            value={email}
            disabled
            helperText="Your sign-in email address"
          />
          <Button variant="outlined" size="small" onClick={() => setChangeEmailOpen(true)} sx={{ textTransform: "none", borderRadius: 2.5, alignSelf: "flex-start" }}>
            Change email
          </Button>
          {passwordSetupPending ? (
            <Box
              sx={{
                bgcolor: "primary.50",
                border: 1,
                borderColor: "primary.100",
                borderRadius: 2,
                p: 2,
              }}
            >
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
                Finish setting up your account
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Your account was created from a plan invite and doesn&apos;t
                have a password yet. Set one so you can sign in with email and
                password next time.
              </Typography>
              <Button
                variant="contained"
                size="small"
                onClick={() => setChangePasswordOpen(true)}
                sx={{ textTransform: "none", borderRadius: 2.5 }}
              >
                Set a password
              </Button>
            </Box>
          ) : (
            <>
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
              <Button variant="outlined" size="small" onClick={() => setChangePasswordOpen(true)} sx={{ textTransform: "none", borderRadius: 2.5, alignSelf: "flex-start" }}>
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
            </>
          )}
        </Stack>
      </AppCard>

      {/* Notifications */}
      <AppCard>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MailOutlineRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Notifications
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Choose which email notifications you&apos;d like to receive.
              </Typography>
            </Box>
          </Stack>
          {NOTIFICATION_TYPES.map((type, index) => {
            const enabled = notificationPrefs[type.key]?.enabled ?? true;
            return (
              <NotificationRow
                key={type.key}
                config={type}
                enabled={enabled}
                onToggle={(val) => setNotificationEnabled(type.key, val)}
                showDivider={index > 0}
                disabled={notificationPrefsLoading}
              />
            );
          })}
        </Stack>
      </AppCard>

      {/* Privacy */}
      <AppCard id="privacy">
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ShieldOutlinedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Privacy
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Control how your profile appears to others. Some options may affect discoverability.
              </Typography>
            </Box>
          </Stack>
          {/* Who can message you (Inbox reachability) */}
          <Box>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
              Who can send you messages
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.25, lineHeight: 1.45 }}>
              Controls who can start a new Inbox conversation with you. People you&apos;re already
              in a conversation with can always reply. Blocking someone overrides this setting.
            </Typography>
            <AppTextField
              select
              value={dmPrivacy}
              onChange={(e) => void setDmPrivacyValue(e.target.value)}
              disabled={dmPrivacySaving}
              helperText={null}
              sx={{ maxWidth: 420 }}
            >
              <MenuItem value="everyone">Everyone on NewChums</MenuItem>
              <MenuItem value="chums_and_plans">Chums and people from your plans</MenuItem>
              <MenuItem value="no_one">No one</MenuItem>
            </AppTextField>
          </Box>
          <PrivacyToggleRow
            title="Hide me from NewChums search and discovery"
            description="Your profile won't appear in searches or discovery features, and others won't be able to add you through search. If you join a plan, attendees can still view your profile."
            enabled={isHiddenFromSearch}
            onToggle={setPrivacyHiddenFromSearch}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide my profile from search engines"
            description="Your profile won't appear in Google or other search engines."
            enabled={isHiddenFromExternalIndexing}
            onToggle={setPrivacyHiddenFromExternalIndexing}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide my age"
            description="Your age won't be shown on your public profile."
            enabled={isHiddenAge}
            onToggle={setPrivacyHiddenAge}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide my connections from my public profile"
            description="The Connections section won't appear on your public profile."
            enabled={isHiddenChumList}
            onToggle={setPrivacyHiddenChumList}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide shout-outs from my public profile"
            description="The Shout-outs section won't appear on your public profile. Notes you've already received are still kept on your account."
            enabled={isHiddenShoutouts}
            onToggle={setPrivacyHiddenShoutouts}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide my communities from my public profile"
            description="The Communities section won't appear on your public profile."
            enabled={isHiddenCommunities}
            onToggle={setPrivacyHiddenCommunities}
            showDivider={true}
            disabled={privacyLoading}
          />
          <PrivacyToggleRow
            title="Hide me from appearing on other people's connection lists"
            description="You won't appear in the Connections section on other people's profiles, but you'll still appear on their private contacts list."
            enabled={isHiddenFromChumLists}
            onToggle={setPrivacyHiddenFromChumLists}
            showDivider={true}
            disabled={privacyLoading}
          />

          {/* Blocked users */}
          <Box sx={{ pt: 1, borderTop: 1, borderColor: "divider" }}>
            <Typography variant="body2" fontWeight={600} sx={{ mb: 0.25 }}>
              Blocked users
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.25, lineHeight: 1.45 }}>
              Blocked people can&apos;t message you, and you can&apos;t message them. They aren&apos;t
              told they&apos;ve been blocked.
            </Typography>
            {blockedUsers.length === 0 ? (
              <Typography variant="body2" color="text.disabled">
                You haven&apos;t blocked anyone.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {blockedUsers.map((b) => (
                  <Stack key={b.userId} direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {b.name?.trim() || (b.username ? `@${b.username}` : "NewChums member")}
                      </Typography>
                      {b.username && b.name && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                          @{b.username}
                        </Typography>
                      )}
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void handleUnblock(b.userId)}
                      disabled={unblockingId === b.userId}
                      sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
                    >
                      {unblockingId === b.userId ? "Unblocking..." : "Unblock"}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </AppCard>

      {/* Tips & guidance */}
      <AppCard>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "primary.light",
                color: "primary.main",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <LightbulbOutlinedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Tips &amp; guidance
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Control whether NewChums shows helpful next-step tips as you use the product.
              </Typography>
            </Box>
          </Stack>
          <PrivacyToggleRow
            title="Turn off tutorial tips"
            description="When enabled, NewChums will not show next-step guidance tips across the app. You can re-enable them at any time."
            enabled={tutorialNudgesOff}
            onToggle={async (off) => {
              setTutorialNudgesOff(off);
              try {
                await apiFetch("/objectives/tutorial-off", {
                  method: "PUT",
                  auth: true,
                  body: JSON.stringify({ off }),
                });
              } catch {
                setTutorialNudgesOff(!off);
              }
            }}
            showDivider={false}
          />
        </Stack>
      </AppCard>

      {/* Danger zone */}
      <AppCard sx={{ borderColor: "error.light", borderWidth: 1, borderStyle: "solid" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                bgcolor: "error.light",
                color: "error.dark",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <WarningAmberRoundedIcon sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="h6"
                fontWeight={700}
                color="error.dark"
                sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, lineHeight: 1.3 }}
              >
                Danger zone
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", lineHeight: 1.35, display: "block" }}
              >
                Permanently delete your account and all associated data. This action cannot be undone.
              </Typography>
            </Box>
          </Stack>
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => setDeleteAccountOpen(true)}
            sx={{ textTransform: "none", borderRadius: 2.5, alignSelf: "flex-start" }}
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
        <DialogTitle sx={{ px: { xs: 2, sm: 3 } }}>Change email</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 0, sm: 1.5 } }}>
          {changeEmailSuccess ? (
            <Typography color="text.secondary">
              Check your new email to confirm the change. We&apos;ve also sent a notification to your current email.
            </Typography>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography color="text.secondary" variant="body2">
                We&apos;ll send a confirmation link to your new email. Your current email will also receive a notification.
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
        <DialogActions
          disableSpacing
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "flex-end" },
            justifyContent: { xs: "stretch", sm: "flex-end" },
            gap: { xs: 1.5, sm: 1 },
            pt: { xs: 1, sm: 1.5 },
            px: { xs: 2, sm: 3 },
            pb: { xs: 2, sm: 3 },
          }}
        >
          {changeEmailSuccess ? (
            <AppButton variant="contained" onClick={() => setChangeEmailOpen(false)} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Done
            </AppButton>
          ) : (
            <>
              <AppButton
                variant="contained"
                disabled={changeEmailSubmitting || !newEmail.trim()}
                sx={{ width: { xs: "100%", sm: "auto" } }}
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
              <Button
                variant="outlined"
                onClick={() => setChangeEmailOpen(false)}
                disabled={changeEmailSubmitting}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Cancel
              </Button>
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
        <DialogTitle sx={{ px: { xs: 2, sm: 3 } }}>
          {passwordSetupPending ? "Set a password" : "Change password"}
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 0, sm: 1.5 } }}>
          {!hasPassword && !passwordSetupPending ? (
            <Typography color="text.secondary">
              This account signs in with Google. Password changes aren&apos;t available.
            </Typography>
          ) : (
            <Stack spacing={{ xs: 1.5, sm: 2 }} sx={{ mt: { xs: 0.5, sm: 1 } }}>
              <Typography color="text.secondary" variant="body2">
                {passwordSetupPending
                  ? "This is a first-time setup, so there's no existing password to enter. You'll stay signed in."
                  : "You'll stay signed in."}
              </Typography>
              {!passwordSetupPending && (
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
              )}
              <AppTextField
                label={passwordSetupPending ? "Password" : "New password"}
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
                label={passwordSetupPending ? "Confirm password" : "Confirm new password"}
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
        <DialogActions
          disableSpacing
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "flex-end" },
            justifyContent: { xs: "stretch", sm: "flex-end" },
            gap: { xs: 1.5, sm: 1 },
            pt: { xs: 1, sm: 1.5 },
            px: { xs: 2, sm: 3 },
            pb: { xs: 2, sm: 3 },
          }}
        >
          {(hasPassword || passwordSetupPending) && (
            <AppButton
              variant="contained"
              sx={{ width: { xs: "100%", sm: "auto" } }}
              disabled={
                changePasswordSubmitting ||
                (!passwordSetupPending && !currentPassword.trim()) ||
                !newPassword.trim() ||
                newPassword !== confirmPassword ||
                newPassword.length < 8
              }
              onClick={async () => {
                if (
                  (!passwordSetupPending && !currentPassword.trim()) ||
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
                  // First-time setup uses a dedicated endpoint that skips the
                  // current-password check (the account has never had one);
                  // subsequent changes go through the standard flow.
                  const res = passwordSetupPending
                    ? await apiFetch("/auth/password/set", {
                        method: "POST",
                        auth: true,
                        body: JSON.stringify({ password: newPassword.trim() }),
                      })
                    : await apiFetch("/account/password-change", {
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
                  toast.success(passwordSetupPending ? "Password set" : "Password updated");
                  // Flip local state so the reminder card collapses and the
                  // normal change-password controls become available going
                  // forward. The banner re-reads from /profile on next load.
                  if (passwordSetupPending) {
                    setPasswordSetupPending(false);
                    setHasPassword(true);
                  }
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
          <Button
            variant="outlined"
            onClick={() => {
              setChangePasswordOpen(false);
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setCurrentPasswordError(null);
              setNewPasswordError(null);
            }}
            disabled={changePasswordSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </Button>
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
        <DialogTitle sx={{ px: { xs: 2, sm: 3 } }}>Delete your account?</DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 0, sm: 1.5 } }}>
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
        <DialogActions
          disableSpacing
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "flex-end" },
            justifyContent: { xs: "stretch", sm: "flex-end" },
            gap: { xs: 1.5, sm: 1 },
            pt: { xs: 1, sm: 1.5 },
            px: { xs: 2, sm: 3 },
            pb: { xs: 2, sm: 3 },
          }}
        >
          <AppButton
            color="error"
            variant="contained"
            sx={{ width: { xs: "100%", sm: "auto" } }}
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
          <Button
            variant="outlined"
            onClick={() => {
              setDeleteAccountOpen(false);
              setDeleteAccountPassword("");
              setDeleteAccountError(null);
            }}
            disabled={deleteAccountSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
