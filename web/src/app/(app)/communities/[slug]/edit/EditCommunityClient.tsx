"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Box, Typography, Stack, CircularProgress,
  RadioGroup, Radio, FormControlLabel, FormControl,
} from "@mui/material";
import { AppCard, AppButton, AppTextField, useToast } from "@/components/ui";
import PlacesAutocompleteInput from "@/components/common/PlacesAutocompleteInput";
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
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Box>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
            mb: 0.75,
          }}
        >
          Edit community
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Update your community details. Changes are saved when you click Save.
        </Typography>
      </Box>

      {/* Basics */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Basics
            </Typography>
          </Box>

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

      {/* Visibility & joining */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Visibility and joining
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Visibility</Typography>
            <FormControl>
              <RadioGroup value={visibility} onChange={(e) => setVisibility(e.target.value as "public" | "private")}>
                <FormControlLabel
                  value="public"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Public</Typography>
                      <Typography variant="caption" color="text.secondary">Anyone can find and view this community.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", mb: 0.5 }}
                />
                <FormControlLabel
                  value="private"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Private</Typography>
                      <Typography variant="caption" color="text.secondary">Only members can see content. Others see the name and description.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start" }}
                />
              </RadioGroup>
            </FormControl>
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.625 }}>Joining</Typography>
            <FormControl>
              <RadioGroup value={joinMode} onChange={(e) => setJoinMode(e.target.value as "open" | "approval_required")}>
                <FormControlLabel
                  value="open"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Open</Typography>
                      <Typography variant="caption" color="text.secondary">Anyone can join immediately.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", mb: 0.5 }}
                />
                <FormControlLabel
                  value="approval_required"
                  control={<Radio size="small" />}
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Approval required</Typography>
                      <Typography variant="caption" color="text.secondary">You review each request before they can join.</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start" }}
                />
              </RadioGroup>
            </FormControl>
          </Box>
        </Stack>
      </AppCard>

      {/* Location */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
              Location (optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              If your community has a physical home base, like a store, venue, or regular meeting spot, add it here.
            </Typography>
          </Box>

          <PlacesAutocompleteInput
            value={locationName}
            onChange={(v) => {
              setLocationName(v);
              if (!v.trim()) setLocationAddress("");
            }}
            onPlaceSelect={(result) => {
              setLocationName(result.name || result.formattedAddress);
              setLocationAddress(result.formattedAddress);
            }}
            label="Venue or address"
            placeholder="Search for a place or enter a name"
            helperText="Start typing to search venues, parks, stores, or addresses"
            placeTypes={["establishment", "geocode"]}
            inputId="places-autocomplete-community-edit"
          />
          {locationAddress && (
            <AppTextField
              label="Address"
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              inputProps={{ maxLength: 500 }}
            />
          )}
        </Stack>
      </AppCard>

      {/* Actions */}
      <Stack direction="row" spacing={2} justifyContent="flex-end">
        <AppButton variant="outlined" onClick={() => router.back()} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}>
          Cancel
        </AppButton>
        <AppButton
          variant="contained"
          onClick={handleSave}
          disabled={saving || !name.trim()}
          sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, minWidth: 140, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
        >
          {saving ? <CircularProgress size={20} color="inherit" /> : "Save changes"}
        </AppButton>
      </Stack>
    </Stack>
  );
}
