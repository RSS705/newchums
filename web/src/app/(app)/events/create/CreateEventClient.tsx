"use client";

import { useCallback, useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import { useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type HobbyOption = { id: string; name: string; slug: string };
type Invitee = { userId?: string; email?: string; label: string };
type SearchResult = { userId: string; displayName: string; handle: string | null; email?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateEventClient() {
  const router = useRouter();
  const { showToast } = useToast();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hobbyOptions, setHobbyOptions] = useState<HobbyOption[]>([]);
  const [selectedHobby, setSelectedHobby] = useState<HobbyOption | null>(null);
  const [maxSeats, setMaxSeats] = useState("");

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [locationType, setLocationType] = useState<"in_person" | "online">("in_person");
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [onlineLink, setOnlineLink] = useState("");

  const [visibility, setVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [allowAltTimes, setAllowAltTimes] = useState(true);

  const [invitees, setInvitees] = useState<Invitee[]>([]);
  const [inviteSearch, setInviteSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch("/interests").then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setHobbyOptions(
          ((data as { interests?: HobbyOption[] }).interests ?? []).map((i: HobbyOption) => ({
            id: i.id,
            name: i.name,
            slug: i.slug,
          }))
        );
      }
    });
  }, []);

  const searchPeople = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await apiFetch(`/chums/search?q=${encodeURIComponent(q)}`, { auth: true });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; results?: Array<{ userId: string; displayName: string; handle: string | null }> };
        setSearchResults(data.results ?? []);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inviteSearch.trim().length >= 2) searchPeople(inviteSearch.trim());
      else setSearchResults([]);
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteSearch, searchPeople]);

  const addInvitee = (inv: Invitee) => {
    if (inv.userId && invitees.some((i) => i.userId === inv.userId)) return;
    if (inv.email && invitees.some((i) => i.email === inv.email)) return;
    setInvitees((prev) => [...prev, inv]);
    setInviteSearch("");
    setSearchResults([]);
  };

  const removeInvitee = (idx: number) => setInvitees((prev) => prev.filter((_, i) => i !== idx));

  const handleAddEmailInvitee = () => {
    const email = inviteSearch.trim().toLowerCase();
    if (EMAIL_RE.test(email)) {
      addInvitee({ email, label: email });
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Give your plan a title";
    if (!date) errs.date = "Pick a date";
    if (!time) errs.time = "Pick a time";
    if (locationType === "in_person" && !locationName.trim() && !locationAddress.trim())
      errs.location = "Add a location name or address";
    if (maxSeats && (isNaN(Number(maxSeats)) || Number(maxSeats) < 1))
      errs.maxSeats = "Must be a positive number";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    const startsAt = new Date(`${date}T${time}`).toISOString();

    const payload: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || null,
      interest_id: selectedHobby?.id ?? null,
      starts_at: startsAt,
      location_type: locationType,
      location_name: locationName.trim() || null,
      location_address: locationAddress.trim() || null,
      online_link: locationType === "online" ? onlineLink.trim() || null : null,
      max_seats: maxSeats ? Number(maxSeats) : null,
      visibility,
      allow_alt_times: allowAltTimes,
      status: "published",
      invitees: invitees.map((inv) => ({
        user_id: inv.userId ?? null,
        email: inv.email ?? null,
      })),
    };

    try {
      const res = await apiFetch("/events", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; event?: { id: string }; error?: string; message?: string; field?: string };
      if (data.ok && data.event) {
        showToast("Plan created! 🎉", "success");
        router.push("/plans");
      } else {
        if (data.field) {
          setErrors({ [data.field]: data.message ?? "Validation error" });
        } else {
          showToast(data.message ?? "Something went wrong", "error");
        }
      }
    } catch {
      showToast("Network error — please try again", "error");
    }
    setSubmitting(false);
  };

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Box>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
          Start a plan
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Organize a gathering around something you enjoy. Keep it simple — you can always update later.
        </Typography>
      </Box>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            What&apos;s the plan?
          </Typography>

          <AppTextField
            label="Title"
            placeholder="e.g. Thursday Board Game Night"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={!!errors.title}
            helperText={errors.title ?? "Give it a name people will recognise"}
            inputProps={{ maxLength: 200 }}
          />

          <AppTextField
            label="Description"
            placeholder="What should people expect? Any details they should know?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            maxRows={6}
            inputProps={{ maxLength: 2000 }}
            helperText="Optional — but a short description helps people decide to join"
          />

          <Autocomplete
            options={hobbyOptions}
            getOptionLabel={(o) => o.name}
            value={selectedHobby}
            onChange={(_, v) => setSelectedHobby(v)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <Box sx={{ width: "100%" }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                  Hobby
                </Typography>
                <TextField
                  {...params}
                  placeholder="Search hobbies…"
                  variant="outlined"
                  size="medium"
                  fullWidth
                  label={undefined}
                  helperText="Link this plan to a hobby so the right people can find it"
                />
              </Box>
            )}
          />

          <AppTextField
            label="Seats"
            placeholder="e.g. 8"
            value={maxSeats}
            onChange={(e) => setMaxSeats(e.target.value)}
            error={!!errors.maxSeats}
            helperText={errors.maxSeats ?? "Optional — leave blank for unlimited"}
            type="number"
            inputProps={{ min: 1, max: 500 }}
            sx={{ maxWidth: 200 }}
          />
        </Stack>
      </AppCard>

      {/* Date & time */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            When?
          </Typography>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <AppTextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              error={!!errors.date}
              helperText={errors.date}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
            <AppTextField
              label="Time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              error={!!errors.time}
              helperText={errors.time}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          <FormControlLabel
            control={
              <Switch
                checked={allowAltTimes}
                onChange={(e) => setAllowAltTimes(e.target.checked)}
              />
            }
            label="Let people suggest alternate times"
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
            Invitees can propose a different date or time if this one doesn&apos;t work for them.
          </Typography>
        </Stack>
      </AppCard>

      {/* Location */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            Where?
          </Typography>

          <RadioGroup
            row
            value={locationType}
            onChange={(e) => setLocationType(e.target.value as "in_person" | "online")}
          >
            <FormControlLabel value="in_person" control={<Radio />} label="In person" />
            <FormControlLabel value="online" control={<Radio />} label="Online" />
          </RadioGroup>

          {locationType === "in_person" ? (
            <>
              <AppTextField
                label="Place name"
                placeholder="e.g. Central Park, Joe's Coffee"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                error={!!errors.location}
                helperText={errors.location ?? "The name of the venue or meeting spot"}
              />
              <AppTextField
                label="Address"
                placeholder="e.g. 123 Main St"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                helperText="Optional — helps people find the place"
              />
            </>
          ) : (
            <AppTextField
              label="Online link or details"
              placeholder="e.g. Zoom link, Discord server"
              value={onlineLink}
              onChange={(e) => setOnlineLink(e.target.value)}
              helperText="Share a link or instructions for joining online"
            />
          )}
        </Stack>
      </AppCard>

      {/* Visibility */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={600}>
            Who can see this?
          </Typography>

          <RadioGroup
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as typeof visibility)}
          >
            <FormControlLabel
              value="public"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Public</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Anyone on NewChums can discover and join this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mb: 1.5 }}
            />
            <FormControlLabel
              value="chums_only"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Chums only</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Only your Chums can see and join this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mb: 1.5 }}
            />
            <FormControlLabel
              value="invite_only"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>Invite only</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Only people you invite will see this plan
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start" }}
            />
          </RadioGroup>
        </Stack>
      </AppCard>

      {/* Invite people */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={600}>
            Invite people
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
            Search by name, @handle, or email. Invite emails are sent when you publish.
          </Typography>

          <Box sx={{ position: "relative" }}>
            <AppTextField
              label="Search or enter email"
              placeholder="Name, @handle, or email address"
              value={inviteSearch}
              onChange={(e) => setInviteSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && EMAIL_RE.test(inviteSearch.trim())) {
                  e.preventDefault();
                  handleAddEmailInvitee();
                }
              }}
            />
            {searching && (
              <CircularProgress size={20} sx={{ position: "absolute", right: 12, top: 44 }} />
            )}
          </Box>

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <Stack
              spacing={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                overflow: "hidden",
                mt: -1,
              }}
            >
              {searchResults.map((r) => (
                <Box
                  key={r.userId}
                  sx={{
                    px: 2,
                    py: 1.25,
                    cursor: "pointer",
                    "&:hover": { bgcolor: "grey.50" },
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-child": { borderBottom: "none" },
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                  onClick={() =>
                    addInvitee({
                      userId: r.userId,
                      label: r.displayName + (r.handle ? ` (${r.handle})` : ""),
                    })
                  }
                >
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {r.displayName}
                    </Typography>
                    {r.handle && (
                      <Typography variant="caption" color="text.secondary">
                        {r.handle}
                      </Typography>
                    )}
                  </Box>
                  <PersonAddRoundedIcon sx={{ fontSize: 18, color: "primary.main" }} />
                </Box>
              ))}
            </Stack>
          )}

          {/* Email invite prompt */}
          {inviteSearch.trim().length > 3 &&
            EMAIL_RE.test(inviteSearch.trim()) &&
            searchResults.length === 0 &&
            !searching && (
              <Box
                sx={{
                  p: 2,
                  borderRadius: 1,
                  bgcolor: "primary.light",
                  cursor: "pointer",
                  "&:hover": { opacity: 0.85 },
                }}
                onClick={handleAddEmailInvitee}
              >
                <Typography variant="body2" fontWeight={500}>
                  Invite <strong>{inviteSearch.trim()}</strong> by email
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  They&apos;ll receive an invite email when you publish this plan
                </Typography>
              </Box>
            )}

          {/* Invitee chips */}
          {invitees.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>
              {invitees.map((inv, idx) => (
                <Chip
                  key={inv.userId ?? inv.email ?? idx}
                  label={inv.label}
                  onDelete={() => removeInvitee(idx)}
                  deleteIcon={<IconButton size="small"><CloseRoundedIcon sx={{ fontSize: 14 }} /></IconButton>}
                  variant="outlined"
                  size="small"
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>

      {/* Submit */}
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        justifyContent="flex-end"
        sx={{ pt: 1, pb: 4 }}
      >
        <AppButton
          variant="outlined"
          color="primary"
          onClick={() => router.push("/plans")}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 140 } }}
        >
          Cancel
        </AppButton>
        <AppButton
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 200 }, py: 1.5 }}
        >
          {submitting ? <CircularProgress size={22} color="inherit" /> : "Publish plan"}
        </AppButton>
      </Stack>
    </Stack>
  );
}
