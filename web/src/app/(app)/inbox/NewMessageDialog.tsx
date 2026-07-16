"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputAdornment from "@mui/material/InputAdornment";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import PersonSearchRoundedIcon from "@mui/icons-material/PersonSearchRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import { AppButton, AppDialog, AppTextField } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import UserAvatar from "@/components/common/UserAvatar";

// Entity picker dialog (see docs/UI_Patterns.md) over the people the viewer
// can plausibly want to message: their On NewChums chums and people from
// recent shared plans. Selecting a row IS the action; the parent owns
// closing and navigation into the compose flow.

type ContactEntry = {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  planTitle?: string;
  planAt?: string;
};

type NewMessageDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Fired with the chosen user's id; the parent owns closing + navigation. */
  onSelect: (userId: string) => void;
};

type LoadState = {
  // "idle" doubles as the visible loading state: the fetch starts the moment
  // the dialog opens while still idle, so idle + open renders the skeletons.
  status: "idle" | "loaded" | "error";
  chums: ContactEntry[];
  fromPlans: ContactEntry[];
};

const SEARCH_VISIBLE_MIN = 7;

function displayNameOf(c: ContactEntry): string {
  return c.name?.trim() || (c.username ? `@${c.username}` : "NewChums member");
}

function planWhen(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    });
  } catch {
    return "";
  }
}

function ContactRow({ contact, onSelect }: { contact: ContactEntry; onSelect: (id: string) => void }) {
  const avatarBase = getAvatarBaseUrl();
  const meta = contact.planTitle
    ? `${contact.planTitle}${contact.planAt ? ` · ${planWhen(contact.planAt)}` : ""}`
    : contact.username
      ? `@${contact.username}`
      : "";
  return (
    <ButtonBase
      onClick={() => onSelect(contact.userId)}
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
      <UserAvatar
        src={contact.avatarUrl ? `${avatarBase}${contact.avatarUrl}` : undefined}
        name={contact.name ?? undefined}
        username={contact.username ?? undefined}
        size={44}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography fontWeight={600} noWrap sx={{ fontSize: "0.9375rem", minWidth: 0 }}>
          {displayNameOf(contact)}
        </Typography>
        {meta && (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ fontSize: "0.8125rem", mt: 0.25 }}>
            {meta}
          </Typography>
        )}
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

export default function NewMessageDialog({ open, onClose, onSelect }: NewMessageDialogProps) {
  const [state, setState] = useState<LoadState>({ status: "idle", chums: [], fromPlans: [] });
  const [search, setSearch] = useState("");

  // Lazy fetch on first open, re-armed by Retry (error -> idle); the ref
  // guards duplicate in-flight fetches (same shape as CopyPlanDialog).
  const inFlightRef = useRef(false);
  useEffect(() => {
    if (!open || state.status !== "idle" || inFlightRef.current) return;
    inFlightRef.current = true;
    (async () => {
      try {
        const res = await apiFetch("/inbox/contacts", { auth: true });
        if (!res.ok) {
          setState((s) => ({ ...s, status: "error" }));
          return;
        }
        const data = (await res.json()) as { ok?: boolean; chums?: ContactEntry[]; fromPlans?: ContactEntry[] };
        if (!data.ok) {
          setState((s) => ({ ...s, status: "error" }));
          return;
        }
        setState({ status: "loaded", chums: data.chums ?? [], fromPlans: data.fromPlans ?? [] });
      } catch {
        setState((s) => ({ ...s, status: "error" }));
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [open, state.status]);

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    const filterRows = (rows: ContactEntry[]) =>
      q
        ? rows.filter(
            (r) =>
              (r.name ?? "").toLowerCase().includes(q) ||
              (r.username ?? "").toLowerCase().includes(q) ||
              (r.planTitle ?? "").toLowerCase().includes(q),
          )
        : rows;
    return { chums: filterRows(state.chums), fromPlans: filterRows(state.fromPlans) };
  }, [q, state.chums, state.fromPlans]);

  const totalContacts = state.chums.length + state.fromPlans.length;
  const totalMatches = matches.chums.length + matches.fromPlans.length;
  const showSearch = state.status === "loaded" && totalContacts >= SEARCH_VISIBLE_MIN;

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
            New message
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            Message one of your chums or someone from a recent plan.
          </Typography>
        </Box>
      }
      dialogContent={
        <Box sx={{ minHeight: 200 }}>
          {state.status === "idle" && (
            <Stack spacing={1} sx={{ pt: 0.5 }}>
              {[0, 1, 2, 3].map((i) => (
                <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 0.875 }}>
                  <Skeleton variant="circular" width={44} height={44} sx={{ flexShrink: 0 }} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton width="45%" height={22} />
                    <Skeleton width="65%" height={18} />
                  </Box>
                </Stack>
              ))}
            </Stack>
          )}

          {state.status === "error" && (
            <Stack alignItems="center" spacing={1.5} sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                We couldn&apos;t load your people. Please try again.
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

          {state.status === "loaded" && totalContacts === 0 && (
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
                <PersonSearchRoundedIcon sx={{ fontSize: 28 }} />
              </Box>
              <Typography fontWeight={700} sx={{ fontSize: "1rem" }}>
                No one to message yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 320 }}>
                Save someone as a chum or join a plan, and the people you meet will show up here.
              </Typography>
            </Stack>
          )}

          {state.status === "loaded" && totalContacts > 0 && (
            <Stack spacing={0} sx={{ pt: 0.5 }}>
              {showSearch && (
                <Box sx={{ px: 1, pb: 1.5 }}>
                  <AppTextField
                    placeholder="Search people"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    helperText={null}
                    inputProps={{ "aria-label": "Search people" }}
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
                  No one matches your search.
                </Typography>
              )}

              {matches.chums.length > 0 && (
                <Box>
                  <SectionLabel first>Your chums</SectionLabel>
                  <Stack spacing={0.25}>
                    {matches.chums.map((contact) => (
                      <ContactRow key={contact.userId} contact={contact} onSelect={onSelect} />
                    ))}
                  </Stack>
                </Box>
              )}

              {matches.fromPlans.length > 0 && (
                <Box>
                  <SectionLabel first={matches.chums.length === 0}>From recent plans</SectionLabel>
                  <Stack spacing={0.25}>
                    {matches.fromPlans.map((contact) => (
                      <ContactRow key={contact.userId} contact={contact} onSelect={onSelect} />
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
