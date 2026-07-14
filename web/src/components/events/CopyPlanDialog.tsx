"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { AppButton, AppDialog, AppTextField } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl, getImageFallbackBaseUrl } from "@/lib/apiClient";
import { getGradientForEventId } from "@/lib/eventBanners";

// Minimal slice of the /events/mine payload the picker needs. Only plans the
// viewer hosted are shown; canceled plans are included (they're still useful
// templates for a re-run).
type CopyablePlan = {
  id: string;
  title: string;
  startsAt: string;
  timezone?: string | null;
  locationType: string;
  locationDisplay?: string | null;
  locationName?: string | null;
  locationAddress?: string | null;
  status: string;
  bannerKey?: string | null;
  hobbies?: Array<{ name: string; slug: string }>;
  isQa?: boolean;
};

type CopyPlanDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen plan's id; the parent owns hydration + closing. */
  onSelect: (planId: string) => void;
};

type LoadState = {
  // "idle" doubles as the visible loading state: the fetch starts the moment
  // the dialog opens while still idle, so idle + open renders the skeletons.
  status: "idle" | "loaded" | "error";
  past: CopyablePlan[];
  upcoming: CopyablePlan[];
};

const SEARCH_VISIBLE_MIN = 7;

function formatWhen(iso: string, tz?: string | null): string {
  const d = new Date(iso);
  const tzOpts: Intl.DateTimeFormatOptions = tz ? { timeZone: tz } : {};
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    ...tzOpts,
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    ...tzOpts,
  });
  return `${date}, ${time}`;
}

function locationLabel(plan: CopyablePlan): string {
  if (plan.locationType === "online") return "Online";
  return plan.locationDisplay || plan.locationName || plan.locationAddress || "";
}

/** Banner thumbnail with gradient fallback (mirrors EventCard's banner logic). */
function PlanThumb({ plan }: { plan: CopyablePlan }) {
  const primary = plan.bannerKey ? `${getAvatarBaseUrl()}/events/${plan.id}/banner` : null;
  const [src, setSrc] = useState<string | null>(primary);
  return (
    <Box
      sx={{
        width: 64,
        height: 44,
        borderRadius: 1.5,
        overflow: "hidden",
        flexShrink: 0,
        background: getGradientForEventId(plan.id),
      }}
    >
      {src && (
        <Box
          component="img"
          src={src}
          alt=""
          onError={() => {
            const fb = getImageFallbackBaseUrl();
            if (fb && primary && src === primary) {
              setSrc(`${fb}/events/${plan.id}/banner`);
            } else {
              setSrc(null);
            }
          }}
          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
    </Box>
  );
}

function PlanRow({ plan, onSelect }: { plan: CopyablePlan; onSelect: (id: string) => void }) {
  const location = locationLabel(plan);
  return (
    <ButtonBase
      onClick={() => onSelect(plan.id)}
      sx={{
        width: "100%",
        justifyContent: "flex-start",
        textAlign: "left",
        alignItems: "center",
        gap: 1.5,
        borderRadius: 2,
        px: 1,
        py: 0.875,
        transition: "background-color 0.15s ease",
        "&:hover": { bgcolor: "action.hover" },
        "&.Mui-focusVisible": { bgcolor: "action.hover" },
      }}
    >
      <PlanThumb plan={plan} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.75}>
          <Typography fontWeight={600} noWrap sx={{ fontSize: "0.9375rem", minWidth: 0 }}>
            {plan.title}
          </Typography>
          {plan.status === "canceled" && (
            <Chip
              label="Canceled"
              size="small"
              sx={{
                bgcolor: "error.light",
                color: "error.dark",
                fontWeight: 600,
                fontSize: "0.6875rem",
                height: 20,
                flexShrink: 0,
              }}
            />
          )}
          {plan.isQa && (
            <Chip
              label="QA"
              size="small"
              sx={{
                bgcolor: "warning.light",
                color: "warning.dark",
                fontWeight: 700,
                fontSize: "0.6875rem",
                height: 20,
                flexShrink: 0,
              }}
            />
          )}
        </Stack>
        <Typography
          variant="body2"
          color="text.secondary"
          noWrap
          sx={{ fontSize: "0.8125rem", mt: 0.25 }}
        >
          {formatWhen(plan.startsAt, plan.timezone)}
          {location ? ` · ${location}` : ""}
        </Typography>
      </Box>
    </ButtonBase>
  );
}

function SectionLabel({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <Typography
      sx={{
        fontSize: "0.6875rem",
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "text.disabled",
        px: 1,
        mb: 0.5,
        mt: first ? 0 : 2,
      }}
    >
      {children}
    </Typography>
  );
}

/**
 * Picker dialog for the "Copy a previous plan" flow on the Start a plan form.
 * Lists the viewer's hosted plans (past first, then upcoming, canceled
 * included) and fires `onSelect` with the chosen plan id. Fetches lazily on
 * first open; results are kept for the life of the form.
 */
export default function CopyPlanDialog({ open, onClose, onSelect }: CopyPlanDialogProps) {
  const [state, setState] = useState<LoadState>({ status: "idle", past: [], upcoming: [] });
  const [search, setSearch] = useState("");

  // Lazy fetch on first open, re-armed by Retry (error -> idle). The ref
  // guards against duplicate fetches while one is in flight (status stays
  // "idle" until it settles). No cleanup cancellation on purpose: the
  // component stays mounted while the dialog is closed, so a late setState
  // is safe, and a cleanup-based cancelled flag would misfire when this
  // effect's own state updates change its deps.
  const inFlightRef = useRef(false);
  useEffect(() => {
    if (!open || state.status !== "idle" || inFlightRef.current) return;
    inFlightRef.current = true;
    (async () => {
      try {
        const [pastRes, upRes] = await Promise.all([
          apiFetch("/events/mine?filter=past", { auth: true }),
          apiFetch("/events/mine?filter=upcoming", { auth: true }),
        ]);
        if (!pastRes.ok || !upRes.ok) {
          setState((s) => ({ ...s, status: "error" }));
          return;
        }
        const pastData = (await pastRes.json()) as {
          events?: Array<CopyablePlan & { isHost?: boolean }>;
        };
        const upData = (await upRes.json()) as {
          events?: Array<CopyablePlan & { isHost?: boolean }>;
        };
        const hostedOnly = (rows?: Array<CopyablePlan & { isHost?: boolean }>) =>
          Array.isArray(rows) ? rows.filter((r) => r.isHost === true) : [];
        setState({
          status: "loaded",
          // /events/mine orders past DESC (most recent first) and upcoming
          // ASC (soonest first), which is exactly the order we want.
          past: hostedOnly(pastData.events),
          upcoming: hostedOnly(upData.events),
        });
      } catch {
        setState((s) => ({ ...s, status: "error" }));
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [open, state.status]);

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const filterRows = (rows: CopyablePlan[]) =>
      q
        ? rows.filter(
            (p) =>
              p.title.toLowerCase().includes(q) ||
              locationLabel(p).toLowerCase().includes(q) ||
              (p.hobbies ?? []).some((h) => h.name.toLowerCase().includes(q))
          )
        : rows;
    return { past: filterRows(state.past), upcoming: filterRows(state.upcoming) };
  }, [q, state.past, state.upcoming]);

  const totalPlans = state.past.length + state.upcoming.length;
  const totalMatches = matches.past.length + matches.upcoming.length;
  const showSearch = state.status === "loaded" && totalPlans >= SEARCH_VISIBLE_MIN;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          m: { xs: 2, sm: 3 },
          maxHeight: { xs: "calc(100dvh - 32px)", sm: "min(620px, calc(100dvh - 48px))" },
        },
      }}
      dialogTitle={
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.125rem", lineHeight: 1.3 }}>
            Copy a previous plan
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Start from a plan you&apos;ve hosted. It will replace anything already in the form,
            and you can adjust everything before publishing.
          </Typography>
        </Box>
      }
      dialogContent={
        <Box sx={{ minHeight: 200 }}>
          {state.status === "idle" && (
            <Stack spacing={1} sx={{ pt: 0.5 }}>
              {[0, 1, 2, 3].map((i) => (
                <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 0.875 }}>
                  <Skeleton variant="rounded" width={64} height={44} sx={{ borderRadius: 1.5, flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width="55%" height={22} />
                    <Skeleton width="75%" height={18} />
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}

          {state.status === "error" && (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                We couldn&apos;t load your plans. Please try again.
              </Typography>
              <AppButton
                variant="outlined"
                size="small"
                onClick={() => setState((s) => ({ ...s, status: "idle" }))}
              >
                Retry
              </AppButton>
            </Stack>
          )}

          {state.status === "loaded" && totalPlans === 0 && (
            <Stack alignItems="center" spacing={1.25} sx={{ py: 5, px: 2, textAlign: "center" }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  color: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <EventRepeatRoundedIcon sx={{ fontSize: 28 }} />
              </Box>
              <Typography fontWeight={700} sx={{ fontSize: "1rem" }}>
                No plans to copy yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
                Once you host a plan, it&apos;ll show up here so you can reuse it next time.
              </Typography>
            </Stack>
          )}

          {state.status === "loaded" && totalPlans > 0 && (
            <Stack spacing={0} sx={{ pt: 0.5 }}>
              {showSearch && (
                <Box sx={{ px: 1, pb: 1.5 }}>
                  <AppTextField
                    placeholder="Search your plans"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    helperText={null}
                    inputProps={{ "aria-label": "Search your plans" }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchRoundedIcon sx={{ fontSize: 20, color: "text.disabled" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                        bgcolor: "background.default",
                        "& fieldset": { borderColor: "grey.200" },
                        "&:hover fieldset": { borderColor: "grey.300" },
                      },
                      "& .MuiOutlinedInput-input": { py: 1.125 },
                    }}
                  />
                </Box>
              )}

              {totalMatches === 0 && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ px: 1, py: 3, textAlign: "center" }}
                >
                  No plans match your search.
                </Typography>
              )}

              {matches.past.length > 0 && (
                <Box>
                  <SectionLabel first>Past plans</SectionLabel>
                  <Stack spacing={0.25}>
                    {matches.past.map((p) => (
                      <PlanRow key={p.id} plan={p} onSelect={onSelect} />
                    ))}
                  </Stack>
                </Box>
              )}

              {matches.upcoming.length > 0 && (
                <Box>
                  <SectionLabel first={matches.past.length === 0}>Upcoming plans</SectionLabel>
                  <Stack spacing={0.25}>
                    {matches.upcoming.map((p) => (
                      <PlanRow key={p.id} plan={p} onSelect={onSelect} />
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </Box>
      }
    />
  );
}
