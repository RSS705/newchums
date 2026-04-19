"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { AppCard, HelpTooltip, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type Level = "open" | "preferred" | "important" | "required";

type Preferences = {
  reliability: Level;
  sociability: Level;
  presentation: Level;
  hosting: Level;
  age: number | null;
};

const DEFAULT_PREFS: Preferences = {
  reliability: "preferred",
  sociability: "open",
  presentation: "open",
  hosting: "open",
  age: null,
};

const METRICS: { key: "reliability" | "sociability" | "presentation" | "hosting"; title: string; tooltip: string }[] = [
  { key: "reliability", title: "Reliability", tooltip: "How important is follow-through and showing up reliably?" },
  { key: "sociability", title: "Sociability", tooltip: "How important is it that someone is enjoyable and easy to spend time with?" },
  { key: "presentation", title: "Cleanliness & consideration", tooltip: "How important is basic cleanliness and considerate use of shared space for in-person gatherings? This is about hygiene and shared-space courtesy, not appearance or style." },
  { key: "hosting", title: "Hosting quality", tooltip: "When joining someone else's plan, how important is good hosting quality?" },
];

const LEVELS: { value: Level; label: string }[] = [
  { value: "open", label: "Open to anyone" },
  { value: "preferred", label: "Preferred" },
  { value: "important", label: "Important" },
  { value: "required", label: "Required" },
];

// "any" is a UI-only sentinel. The wire/storage value is `null`.
type AgeOptionValue = "any" | "5" | "10" | "15";
const AGE_OPTIONS: { value: AgeOptionValue; label: string; years: number | null }[] = [
  { value: "any", label: "Any age", years: null },
  { value: "5", label: "Within 5 years", years: 5 },
  { value: "10", label: "Within 10 years", years: 10 },
  { value: "15", label: "Within 15 years", years: 15 },
];
const ageYearsToOption = (y: number | null): AgeOptionValue =>
  y === 5 ? "5" : y === 10 ? "10" : y === 15 ? "15" : "any";
const ageOptionToYears = (v: AgeOptionValue): number | null =>
  v === "5" ? 5 : v === "10" ? 10 : v === "15" ? 15 : null;

export default function ChumPreferencesSection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPrefsRef = useRef<Preferences>(DEFAULT_PREFS);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/chum-preferences", { auth: true });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; preferences: Preferences };
      if (data.ok && data.preferences) {
        setPrefs(data.preferences);
        latestPrefsRef.current = data.preferences;
      }
    } catch { /* silent */ }
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (updated: Preferences) => {
    setSaveStatus("saving");
    try {
      const res = await apiFetch("/chum-preferences", {
        auth: true,
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const data = (await res.json()) as { ok: boolean; preferences: Preferences };
      if (!data.ok) {
        toast.error("Failed to save preferences");
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("saved");
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      toast.error("Failed to save preferences");
      setSaveStatus("idle");
    }
  }, [toast]);

  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    latestPrefsRef.current = updated;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void save(latestPrefsRef.current);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
    };
  }, []);

  if (!loaded) return null;

  return (
    <AppCard sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        <Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
              Your chum preferences
            </Typography>
            <Fade in={saveStatus !== "idle"} timeout={300}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                {saveStatus === "saving" ? (
                  <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 500 }}>
                    Saving…
                  </Typography>
                ) : (
                  <>
                    <CheckCircleOutlineRoundedIcon sx={{ fontSize: 14, color: "success.main" }} />
                    <Typography variant="caption" color="success.main" sx={{ fontWeight: 500 }}>
                      Saved
                    </Typography>
                  </>
                )}
              </Stack>
            </Fade>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Tune how strict matching should be. Permissive settings let more people through;
            stricter settings filter inbound matches more aggressively. Changes save automatically.
          </Typography>
        </Box>

        <Stack spacing={2}>
          {METRICS.map((m) => (
            <Box key={m.key}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  {m.title}
                </Typography>
                <HelpTooltip title={m.tooltip} />
              </Stack>
              <ToggleButtonGroup
                value={prefs[m.key]}
                exclusive
                onChange={(_, val) => { if (val) updatePref(m.key, val as Level); }}
                size="small"
                sx={{
                  flexWrap: "wrap",
                  gap: 0.75,
                  "& .MuiToggleButtonGroup-grouped": {
                    border: "1.5px solid",
                    borderColor: "grey.300",
                    borderRadius: "8px !important",
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.8125rem",
                    px: { xs: 1.25, sm: 2 },
                    py: 0.625,
                    "&.Mui-selected": {
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      borderColor: "primary.main",
                      fontWeight: 600,
                      "&:hover": { bgcolor: "primary.dark" },
                    },
                  },
                }}
              >
                {LEVELS.map((l) => (
                  <ToggleButton key={l.value} value={l.value}>
                    {l.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          ))}

          {/* Age range — relative to your own age, evaluated server-side from DOB. */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Age range
              </Typography>
              <HelpTooltip title="Match plans whose host and attendees are close in age to you. Privacy-safe — exact ages are never shown." />
            </Stack>
            <ToggleButtonGroup
              value={ageYearsToOption(prefs.age)}
              exclusive
              onChange={(_, val) => {
                if (val) updatePref("age", ageOptionToYears(val as AgeOptionValue));
              }}
              size="small"
              sx={{
                flexWrap: "wrap",
                gap: 0.75,
                "& .MuiToggleButtonGroup-grouped": {
                  border: "1.5px solid",
                  borderColor: "grey.300",
                  borderRadius: "8px !important",
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: "0.8125rem",
                  px: { xs: 1.25, sm: 2 },
                  py: 0.625,
                  "&.Mui-selected": {
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                    borderColor: "primary.main",
                    fontWeight: 600,
                    "&:hover": { bgcolor: "primary.dark" },
                  },
                },
              }}
            >
              {AGE_OPTIONS.map((o) => (
                <ToggleButton key={o.value} value={o.value}>
                  {o.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Stack>

        {/* Collapsible help */}
        <Box>
          <Box
            component="button"
            onClick={() => setHelpOpen((o) => !o)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.5,
              background: "none",
              border: "none",
              cursor: "pointer",
              p: 0,
              fontFamily: "inherit",
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "text.secondary",
              "&:hover": { color: "text.primary" },
            }}
          >
            How do these settings work?
            {helpOpen
              ? <ExpandLessRoundedIcon sx={{ fontSize: 16 }} />
              : <ExpandMoreRoundedIcon sx={{ fontSize: 16 }} />}
          </Box>
          <Collapse in={helpOpen} unmountOnExit>
            <Stack spacing={1} sx={{ mt: 1.25, pl: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Stricter settings help improve match quality, but may reduce the number of people who see your plans or show up in your recommendations.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                You can always browse and view plans yourself, even if someone in the plan doesn&apos;t meet your preferences. NewChums will give you a heads-up so you can decide for yourself.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Setting a metric to <strong>Required</strong> means only people who have received positive feedback from others on that metric will match. Newer users without feedback history may not appear in your matches for that metric.
              </Typography>
            </Stack>
          </Collapse>
        </Box>
      </Stack>
    </AppCard>
  );
}
