"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box, Typography, Stack, CircularProgress,
  RadioGroup, Radio, FormControlLabel, FormControl,
} from "@mui/material";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

export default function EditCommunityClient() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${slug}`, { auth: true });
      const data = await res.json();
      if (data.ok && data.community) {
        const c = data.community;
        setName(c.name || "");
        setDescription(c.description || "");
        setVisibility(c.visibility || "public");
        setJoinMode(c.join_mode || "open");
        setLocationName(c.location_name || "");
        setLocationAddress(c.location_address || "");
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [slug]);

  useEffect(() => { fetchCommunity(); }, [fetchCommunity]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await apiFetch(`/communities/${slug}`, {
        auth: true, method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          visibility,
          join_mode: joinMode,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Community updated");
        router.push(`/communities/${slug}`);
      } else {
        toast.error(data.message || "Could not save");
      }
    } catch { toast.error("Something went wrong"); }
    setSaving(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Edit community
      </Typography>

      <Stack spacing={3}>
        <AppCard>
          <Stack spacing={2.5}>
            <AppTextField
              label="Community name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              inputProps={{ maxLength: 100 }}
            />
            <AppTextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
            />
          </Stack>
        </AppCard>

        <AppCard>
          <Stack spacing={2.5}>
            <Typography variant="subtitle1" fontWeight={700}>Visibility</Typography>
            <FormControl>
              <RadioGroup value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
                <FormControlLabel value="public" control={<Radio size="small" />} label="Public — anyone can find and view" />
                <FormControlLabel value="private" control={<Radio size="small" />} label="Private — only members can see content" />
              </RadioGroup>
            </FormControl>
          </Stack>
        </AppCard>

        <AppCard>
          <Stack spacing={2.5}>
            <Typography variant="subtitle1" fontWeight={700}>Joining</Typography>
            <FormControl>
              <RadioGroup value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "approval_required")}>
                <FormControlLabel value="open" control={<Radio size="small" />} label="Open — anyone can join" />
                <FormControlLabel value="approval_required" control={<Radio size="small" />} label="Approval required" />
              </RadioGroup>
            </FormControl>
          </Stack>
        </AppCard>

        <AppCard>
          <Stack spacing={2.5}>
            <Typography variant="subtitle1" fontWeight={700}>Location (optional)</Typography>
            <AppTextField
              label="Location name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              inputProps={{ maxLength: 200 }}
            />
            <AppTextField
              label="Address"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          </Stack>
        </AppCard>

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <AppButton variant="outlined" onClick={() => router.back()} sx={{ textTransform: "none" }}>
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            sx={{ textTransform: "none", minWidth: 120 }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : "Save changes"}
          </AppButton>
        </Stack>
      </Stack>
    </Box>
  );
}
