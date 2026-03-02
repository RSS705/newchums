"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import Switch from "@mui/material/Switch";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { AppCard, AppTextField, useToast } from "@/components/ui";

type EmailFrequency = "instant" | "daily" | "weekly" | "off";

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [emailFrequency, setEmailFrequency] = useState<EmailFrequency>("daily");
  const [emailChatDigest, setEmailChatDigest] = useState(true);
  const [emailNewEvents, setEmailNewEvents] = useState(true);
  const [notifMatches, setNotifMatches] = useState(true);
  const [notifReminders, setNotifReminders] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [changeEmailOpen, setChangeEmailOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const toast = useToast();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/profile", { auth: true });
      const data = await res.json();
      if (data.ok && data.profile) {
        setEmail(data.profile.email ?? "");
        setEmailChatDigest(data.profile.email_chat_digest ?? true);
        setEmailNewEvents(data.profile.email_new_events ?? true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const savePref = async (key: "email_chat_digest" | "email_new_events", value: boolean) => {
    if (saving) return;
    setSaving(key);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          email_chat_digest: key === "email_chat_digest" ? value : emailChatDigest,
          email_new_events: key === "email_new_events" ? value : emailNewEvents,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        toast.error(data.error?.message ?? "Failed to save");
        return;
      }

      toast.success("Email preferences updated");
      if (key === "email_chat_digest") setEmailChatDigest(value);
      else setEmailNewEvents(value);
    } finally {
      setSaving(null);
    }
  };

  const handleChatDigest = (_: unknown, checked: boolean) => {
    savePref("email_chat_digest", checked);
  };

  const handleNewEvents = (_: unknown, checked: boolean) => {
    savePref("email_new_events", checked);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h3">
        Settings
      </Typography>
      <Typography color="text.secondary">
        Account, notifications, and preferences.
      </Typography>

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
        </Stack>
      </AppCard>

      {/* Notifications */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Notifications</Typography>
          <Typography color="text.secondary" variant="body2">
            Manage how we reach you.
          </Typography>
          <AppTextField
            select
            label="Email frequency"
            value={emailFrequency}
            onChange={(e) => setEmailFrequency(e.target.value as EmailFrequency)}
            helperText="TODO: Persistence coming next"
          >
            <MenuItem value="instant">Instant</MenuItem>
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="off">Off</MenuItem>
          </AppTextField>
          <FormGroup>
            <FormControlLabel
              control={
                <Switch
                  checked={emailChatDigest}
                  onChange={handleChatDigest}
                  disabled={saving !== null}
                />
              }
              label="Email me chat digests for my events"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={emailNewEvents}
                  onChange={handleNewEvents}
                  disabled={saving !== null}
                />
              }
              label="Email me about new events matching my interests"
            />
          </FormGroup>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
            More notification preferences (TODO)
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={<Checkbox checked={notifMatches} onChange={(_, v) => setNotifMatches(v)} disabled />}
              label="New gathering matches"
            />
            <FormControlLabel
              control={<Checkbox checked={notifReminders} onChange={(_, v) => setNotifReminders(v)} disabled />}
              label="Event reminders"
            />
            <FormControlLabel
              control={<Checkbox checked={notifMessages} onChange={(_, v) => setNotifMessages(v)} disabled />}
              label="Messages / invites"
            />
          </FormGroup>
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

      {/* Stub dialogs */}
      <Dialog open={changeEmailOpen} onClose={() => setChangeEmailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change email</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">Coming next. We’ll add email change flow soon.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangeEmailOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Change password</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">Coming next. We’ll add password change flow soon.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setChangePasswordOpen(false)}>OK</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={deleteAccountOpen} onClose={() => setDeleteAccountOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete account</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Account deletion is not implemented yet. This will remove your account and all associated data permanently.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAccountOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" disabled>
            Delete (coming next)
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
