"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppCard } from "@/components/ui";
import UserAvatar from "@/components/common/UserAvatar";

const PAGE_SIZE = 8;

type PublicChum = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
};

type FetchState =
  | { status: "loading" }
  | { status: "success"; chums: PublicChum[]; total: number; hasMore: boolean }
  | { status: "error" };

type ProfileChumsSectionProps = {
  ownerHandle: string;
  viewerLoggedIn?: boolean;
};

export default function ProfileChumsSection({ ownerHandle, viewerLoggedIn }: ProfileChumsSectionProps) {
  const avatarBaseUrl = getAvatarBaseUrl();
  const [page, setPage] = useState(0);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  const fetchPage = useCallback(
    async (pageNum: number) => {
      setFetchState((prev) => (prev.status === "success" ? prev : { status: "loading" }));
      try {
        const offset = pageNum * PAGE_SIZE;
        const handleSlug = ownerHandle.replace(/^@/, "");
        const res = await apiFetch(
          `/public/users/${encodeURIComponent(handleSlug)}/chums?offset=${offset}&limit=${PAGE_SIZE}`,
          { auth: viewerLoggedIn === true },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          chums?: PublicChum[];
          total?: number;
          hasMore?: boolean;
          hidden?: boolean;
        };
        if (!res.ok || !data.ok) {
          setFetchState({ status: "error" });
          return;
        }
        if (data.hidden) {
          setFetchState({ status: "success", chums: [], total: 0, hasMore: false });
          return;
        }
        setFetchState({
          status: "success",
          chums: data.chums ?? [],
          total: data.total ?? 0,
          hasMore: data.hasMore ?? false,
        });
      } catch {
        setFetchState({ status: "error" });
      }
    },
    [ownerHandle],
  );

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  // Return nothing while loading, on error, or when there are no chums.
  // The AppCard wrapper lives here so we never render an empty card.
  if (
    fetchState.status === "loading" ||
    fetchState.status === "error" ||
    (fetchState.status === "success" && fetchState.chums.length === 0 && page === 0)
  ) {
    return null;
  }

  const { chums, total, hasMore } = fetchState as Extract<FetchState, { status: "success" }>;
  const hasPrev = page > 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={1.5}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
          Chums
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))",
            gap: { xs: 1.5, sm: 2 },
          }}
        >
          {chums.map((chum) => {
            const handleSlug = chum.handle?.replace(/^@/, "") ?? null;
            const href = handleSlug ? `/u/${handleSlug}` : null;
            const displayLabel = chum.handle ?? chum.displayName;

            const inner = (
              <Stack spacing={0.5} alignItems="center">
                <UserAvatar
                  src={chum.avatarUrl ? `${avatarBaseUrl}${chum.avatarUrl}` : null}
                  name={chum.displayName}
                  username={chum.handle}
                  size={64}
                />
                <Typography
                  variant="caption"
                  fontWeight={600}
                  sx={{
                    textAlign: "center",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    width: "100%",
                    display: "block",
                    color: "text.primary",
                  }}
                >
                  {displayLabel}
                </Typography>
              </Stack>
            );

            return (
              <Box key={chum.userId}>
                {href ? (
                  <Box
                    component={Link}
                    href={href}
                    sx={{
                      display: "block",
                      textDecoration: "none",
                      borderRadius: 1,
                      p: 0.5,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    {inner}
                  </Box>
                ) : (
                  <Box sx={{ p: 0.5 }}>{inner}</Box>
                )}
              </Box>
            );
          })}
        </Box>

        {totalPages > 1 && (
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pt: 0.5 }}>
            <Button
              variant="text"
              size="small"
              startIcon={<ChevronLeftRoundedIcon />}
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              sx={{ color: "text.secondary", fontSize: "0.8125rem" }}
            >
              Previous
            </Button>
            <Typography variant="caption" color="text.secondary">
              {page + 1} / {totalPages}
            </Typography>
            <Button
              variant="text"
              size="small"
              endIcon={<ChevronRightRoundedIcon />}
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              sx={{ color: "text.secondary", fontSize: "0.8125rem" }}
            >
              Next
            </Button>
          </Stack>
        )}
      </Stack>
    </AppCard>
  );
}
