"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import { isDuplicate, nameToSlug } from "@/lib/interestUtils";
import { validateCleanText } from "@/lib/contentSafety";

type HobbyInfo = { name: string; slug: string; id?: string };

type PrefOverrides = {
  disabled?: boolean;
  disabled_metrics?: string[];
} | null;

const PREF_METRIC_LABELS: Record<string, string> = {
  reliability: "Reliability",
  sociability: "Sociability",
  presentation: "Personal care",
  hosting_skills: "Hosting quality",
};

const PREF_METRICS = ["reliability", "sociability", "presentation"] as const;

export default function EditEventClient() {
  const params = useParams();
  const eventId = params.id as string;
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateValue, setDateValue] = useState<Dayjs | null>(null);
  const [timeValue, setTimeValue] = useState<Dayjs | null>(null);
  const [maxSeats, setMaxSeats] = useState("");
  const [visibility, setVisibility] = useState<"public" | "chums_only" | "invite_only">("public");
  const [allowAltTimes, setAllowAltTimes] = useState(true);
  const [allowAttendeeInvites, setAllowAttendeeInvites] = useState(true);
  const [reserveSeats, setReserveSeats] = useState(false);
  const [requireReconfirmation, setRequireReconfirmation] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [minConfirmed, setMinConfirmed] = useState("");
  const [fallbackPolicy, setFallbackPolicy] = useState<"notify_host" | "proceed" | "auto_cancel">("notify_host");

  const [hobbies, setHobbies] = useState<HobbyInfo[]>([]);
  const [hobbyInput, setHobbyInput] = useState("");
  const [hobbySuggestions, setHobbySuggestions] = useState<HobbyInfo[]>([]);
  const hobbyJustAddedRef = useRef(false);
  const [hobbyLoading, setHobbyLoading] = useState(false);

  // Chum preference overrides
  const [prefOverridesOpen, setPrefOverridesOpen] = useState(false);
  const [prefDisableAll, setPrefDisableAll] = useState(false);
  const [prefDisabledMetrics, setPrefDisabledMetrics] = useState<Record<string, boolean>>({});
  const [hostHasPrefs, setHostHasPrefs] = useState(false);

  // Community association
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState<string | null>(null);
  const [hideFromExplore, setHideFromExplore] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`/events/${eventId}`, { auth: true });
        const data = await res.json();
        if (cancelled) return;
        if (!data.ok || !data.event?.isHost) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        const ev = data.event;
        setTitle(ev.title ?? "");
        setDescription(ev.description ?? "");
        const d = dayjs(ev.startsAt);
        setDateValue(d);
        setTimeValue(d);
        setMaxSeats(ev.maxSeats != null ? String(ev.maxSeats) : "");
        setVisibility(ev.visibility ?? "public");
        setRequireReconfirmation(ev.requireReconfirmation ?? false);
        setRequireApproval(ev.requireApproval ?? false);
        setAllowAttendeeInvites(ev.allowAttendeeInvites !== false);
        setAllowAltTimes(ev.allowAltTimes ?? false);
        setReserveSeats(ev.reserveSeats === true);
        setMinConfirmed(ev.minConfirmedAttendees != null ? String(ev.minConfirmedAttendees) : "");
        setFallbackPolicy(ev.fallbackPolicy ?? "notify_host");
        const h = ev.hobbies?.length > 0
          ? ev.hobbies
          : ev.hobby ? [{ name: ev.hobby, slug: ev.hobbySlug ?? "" }] : [];
        setHobbies(h);

        // Community association
        if (ev.community) {
          setCommunityId(ev.community.id);
          setCommunityName(ev.community.name);
        }
        if (ev.hideFromExplore !== undefined) setHideFromExplore(ev.hideFromExplore === true);

        // Load pref overrides
        const po: PrefOverrides = ev.prefOverrides ?? null;
        if (po) {
          if (po.disabled) {
            setPrefDisableAll(true);
            setPrefOverridesOpen(true);
          } else if (po.disabled_metrics?.length) {
            const dm: Record<string, boolean> = {};
            for (const m of po.disabled_metrics) dm[m] = true;
            setPrefDisabledMetrics(dm);
            setPrefOverridesOpen(true);
          }
        }

        // Check if host has chum preferences enabled
        try {
          const cpRes = await apiFetch("/chum-preferences", { auth: true });
          const cpData = await cpRes.json();
          if (!cancelled && cpData.ok) {
            setHostHasPrefs(cpData.preferences?.enabled !== false);
          }
        } catch { /* non-fatal */ }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [eventId]);

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) { setHobbySuggestions([]); return; }
    setHobbyLoading(true);
    try {
      const res = await apiFetch(`/interests?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (data.ok && data.interests) {
        const seen = new Set<string>();
        const deduped: HobbyInfo[] = [];
        for (const r of data.interests as { id?: string; name: string; slug: string }[]) {
          if (seen.has(r.slug)) continue;
          seen.add(r.slug);
          deduped.push({ id: r.id, name: r.name, slug: r.slug });
        }
        setHobbySuggestions(deduped);
      } else {
        setHobbySuggestions([]);
      }
    } catch { setHobbySuggestions([]); }
    finally { setHobbyLoading(false); }
  }, []);

  const debouncedFetch = useMemo(() => {
    let t: ReturnType<typeof setTimeout>;
    return (q: string) => { clearTimeout(t); t = setTimeout(() => fetchSuggestions(q), 250); };
  }, [fetchSuggestions]);

  useEffect(() => {
    if (hobbyInput) debouncedFetch(hobbyInput);
    else setHobbySuggestions([]);
  }, [hobbyInput, debouncedFetch]);

  const addHobby = (option: HobbyInfo | string) => {
    const item: HobbyInfo =
      typeof option === "string"
        ? { name: option.trim().replace(/\s+/g, " "), slug: nameToSlug(option) }
        : option;
    if (!item.name?.trim() || !item.slug) return;
    if (item.name.length > 50) { toast.error("Hobby must be 50 characters or less"); return; }
    const check = validateCleanText(item.name, "hobby");
    if (!check.ok) { toast.error(check.reason ?? "That hobby name isn't allowed."); return; }
    setHobbies((prev) => {
      if (prev.some((i) => isDuplicate(i, item))) return prev;
      return [...prev, item];
    });
    hobbyJustAddedRef.current = true;
    setHobbyInput("");
    setHobbySuggestions([]);
  };

  const buildPrefOverrides = (): PrefOverrides => {
    if (prefDisableAll) return { disabled: true };
    const dm = Object.entries(prefDisabledMetrics).filter(([, v]) => v).map(([k]) => k);
    if (dm.length > 0) return { disabled_metrics: dm };
    return null;
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!dateValue?.isValid() || !timeValue?.isValid()) { toast.error("Date and time are required"); return; }
    if (hobbies.length === 0) { toast.error("At least one hobby is required"); return; }
    const startsAt = dateValue.hour(timeValue.hour()).minute(timeValue.minute()).second(0).toISOString();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/events/${eventId}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          starts_at: startsAt,
          interest_items: hobbies.map((h) => ({ slug: h.slug, name: h.name })),
          max_seats: maxSeats ? Number(maxSeats) : null,
          reserve_seats: maxSeats ? reserveSeats : false,
          visibility,
          require_reconfirmation: requireReconfirmation,
          require_approval: requireApproval,
          allow_attendee_invites: allowAttendeeInvites,
          allow_alt_times: allowAltTimes,
          min_confirmed_attendees: requireReconfirmation && minConfirmed ? Number(minConfirmed) : null,
          fallback_policy: requireReconfirmation ? fallbackPolicy : "notify_host",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          pref_overrides: buildPrefOverrides(),
          community_id: communityId || null,
          hide_from_explore: hideFromExplore,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Plan updated");
        router.push(`/events/${eventId}`);
      } else {
        toast.error(data.message ?? "Couldn't save changes");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (notFound) {
    return (
      <Stack spacing={2} sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h5" fontWeight={600}>Plan not found or you don&apos;t have access</Typography>
        <AppButton variant="outlined" onClick={() => router.back()}>Go back</AppButton>
      </Stack>
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
          Edit plan
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
          Update the details for this plan. Changes will notify attendees who are Going or Maybe.
        </Typography>
      </Box>

      {/* Basic details */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Plan details
          </Typography>

          <AppTextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            inputProps={{ maxLength: 200 }}
            helperText={null}
          />

          <AppTextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={3}
            maxRows={6}
            inputProps={{ maxLength: 2000 }}
            helperText={null}
          />

          {/* Hobby selector */}
          <Autocomplete
            freeSolo
            multiple
            filterOptions={(x) => x}
            options={hobbySuggestions}
            renderOption={(props, option) => {
              const { key: _key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
              return (
                <li key={typeof option === "string" ? option : (option.id ?? option.slug)} {...rest}>
                  {typeof option === "string" ? option : option.name}
                </li>
              );
            }}
            value={hobbies}
            inputValue={hobbyInput}
            onInputChange={(_, v, reason) => {
              if (hobbyJustAddedRef.current) {
                hobbyJustAddedRef.current = false;
                setHobbyInput("");
                return;
              }
              if (reason === "reset") {
                setHobbyInput("");
                return;
              }
              setHobbyInput(v);
            }}
            onChange={(_, newValue) => {
              const filtered = (newValue ?? []).filter(Boolean);
              const last = filtered[filtered.length - 1];
              if (typeof last === "string") { addHobby(last); return; }
              if (typeof last === "object" && last && filtered.length > hobbies.length) {
                addHobby(last);
                return;
              }
              setHobbies(filtered as HobbyInfo[]);
            }}
            getOptionLabel={(opt) => (typeof opt === "string" ? opt : opt.name)}
            isOptionEqualToValue={(opt, val) => {
              if (typeof opt === "string" || typeof val === "string") return false;
              return opt.slug === val.slug;
            }}
            loading={hobbyLoading}
            renderInput={(params) => (
              <Box sx={{ width: "100%" }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                  Hobbies
                </Typography>
                <TextField
                  {...params}
                  placeholder="Type to search or add..."
                  variant="outlined"
                  size="medium"
                  fullWidth
                  label={undefined}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = hobbyInput.trim();
                      if (!trimmed) return;
                      const input = e.target as HTMLInputElement;
                      if (input.getAttribute("aria-activedescendant")) return;
                      e.preventDefault();
                      e.stopPropagation();
                      addHobby(trimmed);
                      return;
                    }
                    if (e.key === "Backspace" && !hobbyInput) {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                />
              </Box>
            )}
            renderTags={() => null}
          />
          {hobbies.length > 0 && (
            <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
              {hobbies.map((h) => (
                <Chip
                  key={h.slug}
                  label={h.name}
                  size="small"
                  color="primary"
                  variant="filled"
                  onDelete={() => setHobbies((prev) => prev.filter((i) => i.slug !== h.slug))}
                  sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
                />
              ))}
            </Stack>
          )}

          <AppTextField
            label="Max seats (optional)"
            type="number"
            value={maxSeats}
            onChange={(e) => setMaxSeats(e.target.value)}
            inputProps={{ min: 1 }}
            helperText="Include yourself in the count"
          />
          {maxSeats && Number(maxSeats) >= 1 && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={reserveSeats}
                  onChange={(e) => setReserveSeats(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>Reserve seats for invited people</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Invited guests hold a seat until they respond. Declined invites release the seat.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", mt: 0.5 }}
            />
          )}
        </Stack>
      </AppCard>

      {/* Date & time */}
      <AppCard>
        <Stack spacing={2.5}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            When?
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                Date
              </Typography>
              <DatePicker
                value={dateValue}
                onChange={setDateValue}
                slotProps={{ textField: { fullWidth: true, size: "medium" } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ display: "block", mb: 0.625 }}>
                Time
              </Typography>
              <TimePicker
                value={timeValue}
                onChange={setTimeValue}
                format="h:mm A"
                slotProps={{ field: { shouldRespectLeadingZeros: true } as Record<string, unknown>, textField: { fullWidth: true, size: "medium" } }}
              />
            </Box>
          </Stack>
        </Stack>
      </AppCard>

      {/* Settings */}
      <AppCard>
        <Stack spacing={2}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Settings
          </Typography>

          <Box>
            <Typography variant="subtitle1" fontWeight={600}>
              Who can see this?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
              Controls who can find this plan and who may get notified about it.
            </Typography>
            <FormControl component="fieldset">
              <RadioGroup
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as typeof visibility)}
              >
                <FormControlLabel value="public" control={<Radio size="small" />} label="Public" />
                <FormControlLabel value="chums_only" control={<Radio size="small" />} label="Chums only" />
                <FormControlLabel value="invite_only" control={<Radio size="small" />} label="Invite only" />
              </RadioGroup>
            </FormControl>
          </Box>

          <FormControlLabel
            control={<Switch size="small" checked={requireReconfirmation} onChange={(e) => setRequireReconfirmation(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Require final confirmation before the plan</Typography>
                <Typography variant="caption" color="text.secondary">Going attendees will be asked to confirm 24 hours before. This includes you.</Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mt: 0.5 }}
          />
          {requireReconfirmation && (
            <Stack spacing={2} sx={{ mt: 1, pl: 2, borderLeft: "2px solid", borderColor: "divider" }}>
              <Box>
                <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                  Minimum confirmed attendees (optional)
                </Typography>
                <TextField
                  fullWidth size="small" type="number"
                  placeholder="e.g. 4 (including you)"
                  value={minConfirmed}
                  onChange={(e) => setMinConfirmed(e.target.value)}
                  inputProps={{ min: 1, max: 500 }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  You count toward this total.
                </Typography>
              </Box>
              {minConfirmed && Number(minConfirmed) >= 1 && (
                <Box>
                  <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: "block" }}>
                    If minimum isn&apos;t met
                  </Typography>
                  <Select
                    fullWidth size="small"
                    value={fallbackPolicy}
                    onChange={(e) => setFallbackPolicy(e.target.value as typeof fallbackPolicy)}
                  >
                    <MenuItem value="notify_host">Notify me so I can decide</MenuItem>
                    <MenuItem value="proceed">Proceed unless I cancel</MenuItem>
                    <MenuItem value="auto_cancel">Auto-cancel the plan</MenuItem>
                  </Select>
                </Box>
              )}
            </Stack>
          )}

          <FormControlLabel
            control={<Switch size="small" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Require approval before joining</Typography>
                <Typography variant="caption" color="text.secondary">People who are not directly invited will need to request to join.</Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mt: 0.5 }}
          />

          <FormControlLabel
            control={<Switch size="small" checked={allowAttendeeInvites} onChange={(e) => setAllowAttendeeInvites(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Let Going attendees invite others</Typography>
                <Typography variant="caption" color="text.secondary">People who RSVP as Going can invite their friends to this plan.</Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mt: 0.5 }}
          />

          <FormControlLabel
            control={<Switch size="small" checked={allowAltTimes} onChange={(e) => setAllowAltTimes(e.target.checked)} />}
            label={
              <Box>
                <Typography variant="body2" fontWeight={500}>Let people suggest alternate times</Typography>
                <Typography variant="caption" color="text.secondary">Attendees and invitees can propose different dates or times.</Typography>
              </Box>
            }
            sx={{ alignItems: "flex-start", mt: 0.5 }}
          />
        </Stack>
      </AppCard>

      {/* Matching preferences override */}
      {hostHasPrefs && (
        <AppCard>
          <Stack spacing={1.5}>
            <Box
              onClick={() => setPrefOverridesOpen((v) => !v)}
              sx={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}
            >
              <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", flex: 1 }}>
                Matching preferences for this plan
              </Typography>
              <ExpandMoreRoundedIcon
                sx={{
                  transform: prefOverridesOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                  color: "text.secondary",
                }}
              />
            </Box>

            <Collapse in={prefOverridesOpen}>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  Your profile chum preferences are used by default when matching people to your plans.
                  You can relax those rules for this plan only, without changing your profile settings.
                </Typography>

                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={prefDisableAll}
                      onChange={(e) => {
                        setPrefDisableAll(e.target.checked);
                        if (e.target.checked) setPrefDisabledMetrics({});
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Disable all preference filtering for this plan</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Anyone can be matched to this plan regardless of your chum preferences.
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start" }}
                />

                {!prefDisableAll && (
                  <Stack spacing={1} sx={{ pl: 0.5 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5 }}>
                      Or disable specific metrics for this plan:
                    </Typography>
                    {PREF_METRICS.map((metric) => (
                      <FormControlLabel
                        key={metric}
                        control={
                          <Switch
                            size="small"
                            checked={!!prefDisabledMetrics[metric]}
                            onChange={(e) =>
                              setPrefDisabledMetrics((prev) => ({ ...prev, [metric]: e.target.checked }))
                            }
                          />
                        }
                        label={
                          <Typography variant="body2">
                            Skip <strong>{PREF_METRIC_LABELS[metric]}</strong> filtering
                          </Typography>
                        }
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Collapse>
          </Stack>
        </AppCard>
      )}

      {/* Info note */}
      <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", lineHeight: 1.65, px: 0.5 }}>
        Saving changes to this plan (such as date, description, capacity, or visibility) will send an update email to attendees who are Going or Maybe.
      </Typography>

      {/* Actions */}
      {/* Community association */}
      {communityId && communityName && (
        <AppCard>
          <Stack spacing={1.5}>
            <Typography variant="subtitle1" fontWeight={700}>Community</Typography>
            <Typography variant="body2" color="text.secondary">
              This plan is linked to <strong>{communityName}</strong>.
            </Typography>
            <FormControlLabel
              control={<Switch checked={hideFromExplore} onChange={(e) => setHideFromExplore(e.target.checked)} size="small" />}
              label="Hide from public Explore feed"
              slotProps={{ typography: { variant: "body2", color: "text.secondary" } }}
            />
          </Stack>
        </AppCard>
      )}

      <Stack
        direction={{ xs: "column-reverse", sm: "row" }}
        spacing={2}
        justifyContent="flex-end"
        sx={{ pt: 1, pb: 4 }}
      >
        <AppButton
          variant="outlined"
          color="inherit"
          onClick={() => router.push(`/events/${eventId}`)}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 140 }, borderRadius: 2.5, textTransform: "none" }}
        >
          Cancel
        </AppButton>
        <AppButton
          onClick={handleSubmit}
          disabled={submitting}
          sx={{ minWidth: { xs: "100%", sm: 200 }, py: 1.5, borderRadius: 2.5, fontWeight: 600, textTransform: "none", fontSize: "1rem" }}
        >
          {submitting ? <CircularProgress size={22} color="inherit" /> : "Save changes"}
        </AppButton>
      </Stack>
    </Stack>
  );
}
