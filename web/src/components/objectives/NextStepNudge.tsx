"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import Link from "next/link";
import { apiFetch } from "@/lib/apiClient";

type NextStepData = {
  key: string;
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
};

type NudgeResponse = {
  ok: boolean;
  tutorialOff: boolean;
  nextStep: NextStepData | null;
  progress: { completed: number; total: number };
};

const DISMISS_KEY = "nc_nudge_dismissed_session";
const CACHE_STEP_KEY = "nc_nudge_step";
const CACHE_PROGRESS_KEY = "nc_nudge_progress";
const OBJECTIVES_CHANGED_EVENT = "nc:objectives-changed";

/** Dispatch from any component after an action that may complete an objective. */
export function notifyObjectivesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OBJECTIVES_CHANGED_EVENT));
  }
}

function readCache(): { step: NextStepData | null; progress: { completed: number; total: number } | null } {
  if (typeof window === "undefined") return { step: null, progress: null };
  try {
    if (sessionStorage.getItem(DISMISS_KEY)) return { step: null, progress: null };
    const raw = localStorage.getItem(CACHE_STEP_KEY);
    if (!raw) return { step: null, progress: null };
    const step = JSON.parse(raw) as NextStepData;
    const pRaw = localStorage.getItem(CACHE_PROGRESS_KEY);
    const progress = pRaw ? (JSON.parse(pRaw) as { completed: number; total: number }) : null;
    return { step, progress };
  } catch {
    return { step: null, progress: null };
  }
}

function writeCache(step: NextStepData, progress: { completed: number; total: number } | null) {
  try {
    localStorage.setItem(CACHE_STEP_KEY, JSON.stringify(step));
    if (progress) localStorage.setItem(CACHE_PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* best-effort */ }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_STEP_KEY);
    localStorage.removeItem(CACHE_PROGRESS_KEY);
  } catch { /* best-effort */ }
}

export default function NextStepNudge() {
  const [step, setStep] = useState<NextStepData | null>(null);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [hidden, setHidden] = useState(true);
  const [turningOff, setTurningOff] = useState(false);
  const fetchedRef = useRef(false);

  useLayoutEffect(() => {
    const cached = readCache();
    if (cached.step) {
      setStep(cached.step);
      setProgress(cached.progress);
      setHidden(false);
    }
  }, []);

  const load = useCallback(async () => {
    if (typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY)) {
      return;
    }
    try {
      const res = await apiFetch("/objectives/next", { auth: true });
      const data = (await res.json()) as NudgeResponse;
      if (!data.ok || data.tutorialOff || !data.nextStep) {
        clearCache();
        setHidden(true);
        return;
      }
      writeCache(data.nextStep, data.progress);
      setStep(data.nextStep);
      setProgress(data.progress);
      setHidden(false);
    } catch {
      /* silently ignore, keep showing cached data if available */
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    load();
  }, [load]);

  useEffect(() => {
    const handleChanged = () => { load(); };
    window.addEventListener(OBJECTIVES_CHANGED_EVENT, handleChanged);
    return () => window.removeEventListener(OBJECTIVES_CHANGED_EVENT, handleChanged);
  }, [load]);

  const handleDismiss = useCallback(() => {
    setHidden(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const handleTurnOff = useCallback(async () => {
    setTurningOff(true);
    try {
      await apiFetch("/objectives/tutorial-off", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({ off: true }),
      });
    } catch {
      /* best-effort */
    }
    clearCache();
    setHidden(true);
  }, []);

  if (hidden || !step) return null;

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  return (
        <Box
          sx={{
            mb: { xs: 2, sm: 3 },
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          {/* Thin progress bar */}
          <Box
            sx={{
              height: 3,
              bgcolor: "grey.100",
              width: "100%",
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${progressPct}%`,
                bgcolor: "primary.main",
                borderRadius: "0 2px 2px 0",
                transition: "width 0.4s ease",
              }}
            />
          </Box>

          <Box sx={{ px: { xs: 2, sm: 2.5 }, py: { xs: 1.5, sm: 2 } }}>
            <Stack direction="row" alignItems="flex-start" spacing={1.5}>
              {/* Icon */}
              <Box
                sx={{
                  mt: 0.25,
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CheckCircleOutlineRoundedIcon
                  sx={{ fontSize: 20, color: "primary.main" }}
                />
              </Box>

              {/* Content */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="flex-start"
                  spacing={1}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      color="text.disabled"
                      sx={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.03em", mb: 0.25 }}
                    >
                      Next step{progress ? ` \u00b7 ${progress.completed} of ${progress.total} done` : ""}
                    </Typography>
                    <Typography
                      variant="subtitle2"
                      fontWeight={700}
                      sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" }, lineHeight: 1.35 }}
                    >
                      {step.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ fontSize: "0.8125rem", lineHeight: 1.5, mt: 0.25 }}
                    >
                      {step.description}
                    </Typography>
                  </Box>

                  <IconButton
                    size="small"
                    onClick={handleDismiss}
                    aria-label="Dismiss tip"
                    sx={{ mt: -0.5, mr: -0.5, color: "text.disabled" }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Stack>

                {/* Actions */}
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ mt: 1.25 }}
                >
                  <Button
                    component={Link}
                    href={step.actionUrl}
                    variant="contained"
                    size="small"
                    endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: "16px !important" }} />}
                    sx={{
                      textTransform: "none",
                      fontWeight: 600,
                      fontSize: "0.8125rem",
                      borderRadius: 2,
                      px: 2,
                      py: 0.5,
                      boxShadow: "none",
                      "&:hover": { boxShadow: "none" },
                    }}
                  >
                    {step.actionLabel}
                  </Button>
                  <Typography
                    component="button"
                    onClick={handleTurnOff}
                    disabled={turningOff}
                    sx={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                      color: "text.disabled",
                      fontFamily: "inherit",
                      p: 0,
                      "&:hover": { color: "text.secondary", textDecoration: "underline" },
                    }}
                  >
                    Turn off tips
                  </Typography>
                </Stack>
              </Box>
            </Stack>
          </Box>
        </Box>
  );
}
