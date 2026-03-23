"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type Level = "open" | "preferred" | "important" | "required";

type Preferences = {
  enabled: boolean;
  reliability: Level;
  sociability: Level;
  presentation: Level;
  hosting: Level;
};

const DEFAULT_PREFS: Preferences = {
  enabled: true,
  reliability: "preferred",
  sociability: "open",
  presentation: "open",
  hosting: "open",
};

const METRICS: { key: keyof Omit<Preferences, "enabled">; title: string; description: string }[] = [
  { key: "reliability", title: "Reliability", description: "How important is follow-through and showing up reliably?" },
  { key: "sociability", title: "Sociability", description: "How important is it that someone is enjoyable and easy to spend time with?" },
  { key: "presentation", title: "Personal care", description: "How important is basic personal care for in-person gatherings?" },
  { key: "hosting", title: "Hosting quality", description: "When joining someone else\u2019s plan, how important is good hosting quality?" },
];

const LEVELS: { value: Level; label: string }[] = [
  { value: "open", label: "Open to anyone" },
  { value: "preferred", label: "Preferred" },
  { value: "important", label: "Important" },
  { value: "required", label: "Required" },
];

export default function ChumPreferencesSection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      }
    } catch {
      toast.error("Failed to save preferences");
    }
  }, [toast]);

  const updatePref = (key: keyof Preferences, value: Level | boolean) => {
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
    };
  }, []);

  if (!loaded) return null;

  return (
    <AppCard sx={{ borderRadius: { xs: 2.5, sm: 3 }, overflow: "hidden" }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
            Your chum preferences
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.5 }}>
            Set the standards NewChums should use when matching people to your plans and recommendations.
          </Typography>
        </Box>

        <FormControlLabel
          control={
            <Switch
              checked={prefs.enabled}
              onChange={(_, checked) => updatePref("enabled", checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body1" fontWeight={600}>
                Use chum preferences
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.4, mt: 0.25 }}>
                When turned on, NewChums uses these preferences as your default matching rules.
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", ml: 0, "& .MuiSwitch-root": { mt: 0.25 } }}
        />

        <Stack spacing={3} sx={{ opacity: prefs.enabled ? 1 : 0.5, pointerEvents: prefs.enabled ? "auto" : "none", transition: "opacity 0.2s" }}>
          {METRICS.map((m) => (
            <Box key={m.key}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.25 }}>
                {m.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, lineHeight: 1.5 }}>
                {m.description}
              </Typography>
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
        </Stack>

        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 2, py: 1.5 }}>
          <Stack spacing={1.75}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Stricter settings can improve fit, but may reduce how many people you see or how many people see your plans.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              You&apos;ll still be able to view plans yourself, even when someone in the plan does not meet your preferences. When that happens, NewChums will let you know so you can decide for yourself.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              <strong>About &ldquo;Required&rdquo;:</strong> This level only matches people who have received positive feedback from others. People with no feedback history yet (new users) won&apos;t be matched to your plans on that metric. This can significantly reduce your matches.
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </AppCard>
  );
}
