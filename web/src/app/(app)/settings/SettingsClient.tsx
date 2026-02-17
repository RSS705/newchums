"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui";
import AppCard from "@/components/ui/AppCard";

export default function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [emailChatDigest, setEmailChatDigest] = useState(true);
  const [emailNewEvents, setEmailNewEvents] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.ok && data.profile) {
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
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
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

      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6">Email preferences</Typography>
          <Typography color="text.secondary" variant="body2">
            Manage how we reach you.
          </Typography>
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
        </Stack>
      </AppCard>
    </Stack>
  );
}
