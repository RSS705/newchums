"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Stack, Switch, FormControlLabel, CircularProgress,
  RadioGroup, Radio, FormControl,
} from "@mui/material";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export default function CreateCommunityClient() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [joinMode, setJoinMode] = useState<"open" | "approval_required">("open");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const checkSlug = useCallback(async (s: string) => {
    if (s.length < 3) { setSlugAvailable(null); return; }
    try {
      const res = await apiFetch(`/communities/slug-available?slug=${encodeURIComponent(s)}`, { auth: true });
      const data = await res.json();
      setSlugAvailable(data.available ?? null);
    } catch { setSlugAvailable(null); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (slug.length >= 3) checkSlug(slug); }, 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (slug.length < 3) { toast.error("Handle must be at least 3 characters"); return; }

    setSaving(true);
    try {
      const res = await apiFetch("/communities", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug,
          description: description.trim() || null,
          visibility,
          join_mode: joinMode,
          location_name: locationName.trim() || null,
          location_address: locationAddress.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Community created!");
        router.push(`/communities/${data.community.slug}`);
      } else {
        toast.error(data.message || data.error || "Something went wrong");
      }
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  };

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Create a community
      </Typography>

      <Stack spacing={3}>
        <AppCard>
          <Stack spacing={2.5}>
            <AppTextField
              label="Community name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board Game Nights Toronto"
              inputProps={{ maxLength: 100 }}
            />

            <Box>
              <AppTextField
                label="Handle"
                value={slug}
                onChange={(e) => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }}
                placeholder="board-game-nights-toronto"
                helperText={
                  slug.length >= 3
                    ? slugAvailable === true ? "Available"
                    : slugAvailable === false ? "Already taken"
                    : "Checking..."
                    : "At least 3 characters. Letters, numbers, and hyphens."
                }
                inputProps={{ maxLength: 50 }}
              />
            </Box>

            <AppTextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this community about?"
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
                <FormControlLabel value="public" control={<Radio size="small" />} label="Public — anyone can find and view this community" />
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
                <FormControlLabel value="approval_required" control={<Radio size="small" />} label="Approval required — you review each request" />
              </RadioGroup>
            </FormControl>
          </Stack>
        </AppCard>

        <AppCard>
          <Stack spacing={2.5}>
            <Typography variant="subtitle1" fontWeight={700}>Location (optional)</Typography>
            <Typography variant="body2" color="text.secondary">
              If your community has a physical home base (a store, venue, or regular meeting spot), add it here.
            </Typography>
            <AppTextField
              label="Location name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="The Game Library"
              inputProps={{ maxLength: 200 }}
            />
            <AppTextField
              label="Address"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="123 Main St, Toronto, ON"
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
            onClick={handleSubmit}
            disabled={saving || !name.trim() || slug.length < 3 || slugAvailable === false}
            sx={{ textTransform: "none", minWidth: 140 }}
          >
            {saving ? <CircularProgress size={20} color="inherit" /> : "Create community"}
          </AppButton>
        </Stack>
      </Stack>
    </Box>
  );
}
