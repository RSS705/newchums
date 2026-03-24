"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppButton } from "@/components/ui";
import PublicProfileView, { type ChumAction, type PublicProfileUser } from "@/components/publicProfile/PublicProfileView";

type PublicProfilePageClientProps = {
  handle: string;
  /** When present (logged in), used to show preview subheader when viewing own profile */
  viewerHandle?: string;
};

type FetchState =
  | { status: "loading" }
  | { status: "success"; user: PublicProfileUser }
  | { status: "not_found" }
  | { status: "error"; message?: string };

export default function PublicProfilePageClient({ handle, viewerHandle }: PublicProfilePageClientProps) {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [saved, setSaved] = useState<boolean | null>(null);
  const [chumLoading, setChumLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!handle?.trim()) {
      setState({ status: "not_found" });
      return;
    }
    setState({ status: "loading" });
    try {
      const handleNorm = handle.trim().replace(/^@/, "").toLowerCase();
      const res = await apiFetch(`/public/users/${encodeURIComponent(handleNorm)}`, { auth: !!viewerHandle });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
        user?: PublicProfileUser;
      };
      if (res.ok && data.ok && data.user) {
        setState({ status: "success", user: data.user });
      } else if (res.status === 404 || data.error === "NOT_FOUND") {
        setState({ status: "not_found" });
      } else {
        setState({ status: "error", message: data.message ?? "Something went wrong." });
      }
    } catch {
      setState({ status: "error", message: "Failed to load profile." });
    }
  }, [handle, viewerHandle]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    if (state.status !== "success") return;
    if (!viewerHandle) return;
    const profileHandleNorm = (state.user.handle ?? "").replace(/^@/, "").toLowerCase().trim();
    const viewerNorm = viewerHandle.replace(/^@/, "").toLowerCase().trim();
    if (profileHandleNorm === viewerNorm) return;
    const userId = state.user.userId;
    apiFetch(`/chums/check/${userId}`, { auth: true })
      .then((res) => res.json())
      .then((data: unknown) => {
        const d = data as { ok?: boolean; isSaved?: boolean };
        if (d.ok) {
          setSaved(d.isSaved ?? false);
        }
      })
      .catch(() => {/* silently ignore */});
  }, [state.status, viewerHandle, state]);

  if (state.status === "loading") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (state.status === "not_found") {
    return (
      <Stack spacing={2} sx={{ py: { xs: 4, sm: 6 }, textAlign: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Profile not found
        </Typography>
        <Typography color="text.secondary" variant="body2">
          This profile doesn&apos;t exist or may have been removed.
        </Typography>
      </Stack>
    );
  }

  if (state.status === "error") {
    return (
      <Stack spacing={2} sx={{ py: { xs: 4, sm: 6 }, textAlign: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Unable to load profile
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {state.message}
        </Typography>
        <Box>
          <AppButton variant="outlined" size="medium" onClick={fetchProfile}>
            Try again
          </AppButton>
        </Box>
      </Stack>
    );
  }

  const profileHandleNorm = (state.user.handle ?? "").replace(/^@/, "").toLowerCase().trim();
  const viewerNorm = (viewerHandle ?? "").replace(/^@/, "").toLowerCase().trim();
  const isOwner = Boolean(viewerNorm && profileHandleNorm && profileHandleNorm === viewerNorm);

  const chumAction: ChumAction | undefined =
    viewerHandle && !isOwner && saved !== null
      ? {
          isSaved: saved,
          loading: chumLoading,
          onToggle: async () => {
            setChumLoading(true);
            try {
              const userId = state.user.userId;
              const endpoint = `/chums/${userId}`;
              const res = await apiFetch(endpoint, {
                method: saved ? "DELETE" : "POST",
                auth: true,
              });
              const data = (await res.json()) as { ok?: boolean };
              if (data.ok) setSaved((prev) => !prev);
            } catch {
              /* silently ignore */
            } finally {
              setChumLoading(false);
            }
          },
        }
      : undefined;

  return (
    <PublicProfileView
      user={state.user}
      avatarBaseUrl={getAvatarBaseUrl()}
      isOwner={isOwner}
      chumAction={chumAction}
      viewerLoggedIn={!!viewerHandle}
    />
  );
}
