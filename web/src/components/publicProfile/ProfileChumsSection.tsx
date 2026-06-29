"use client";

import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HandshakeRoundedIcon from "@mui/icons-material/HandshakeRounded";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppCard } from "@/components/ui";
import UserAvatar from "@/components/common/UserAvatar";
import ProfileSectionHeader from "./ProfileSectionHeader";

// Whole multiple of every breakpoint's column count (3 on xs, 6 on sm) so each
// non-final page renders only complete rows — no orphan in a partial last row.
const PAGE_SIZE = 12;

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
      <Stack spacing={2}>
        <ProfileSectionHeader
          icon={<HandshakeRoundedIcon sx={{ fontSize: 20 }} />}
          title="Chums"
          meta={total}
        />

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(6, 1fr)" },
            columnGap: { xs: 2, sm: 2.5 },
            rowGap: { xs: 2.25, sm: 2.5 },
          }}
        >
          {chums.map((chum) => {
            const handleSlug = chum.handle?.replace(/^@/, "") ?? null;
            const href = handleSlug ? `/u/${handleSlug}` : null;
            const displayLabel = chum.handle ?? chum.displayName;

            const inner = (
              <Stack spacing={0.75} alignItems="center">
                <UserAvatar
                  src={chum.avatarUrl ? `${avatarBaseUrl}${chum.avatarUrl}` : null}
                  name={chum.displayName}
                  username={chum.handle}
                  size={64}
                />
                <Typography
                  sx={{
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    lineHeight: 1.3,
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
              // minWidth: 0 lets the 1fr track shrink below the label's
              // intrinsic (nowrap) width so long handles ellipsize instead of
              // forcing the column — and the grid — wider than the viewport.
              <Box key={chum.userId} sx={{ minWidth: 0 }}>
                {href ? (
                  <Box
                    component={Link}
                    href={href}
                    sx={{
                      display: "block",
                      textDecoration: "none",
                      borderRadius: 1.5,
                      px: 0.5,
                      py: 0.75,
                      transition: "background-color 0.15s ease",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    {inner}
                  </Box>
                ) : (
                  <Box sx={{ px: 0.5, py: 0.75 }}>{inner}</Box>
                )}
              </Box>
            );
          })}
        </Box>

        {totalPages > 1 && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="flex-end"
            spacing={0.5}
            sx={{ mt: 0.5 }}
          >
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                fontVariantNumeric: "tabular-nums",
                px: 0.5,
              }}
            >
              {page + 1} / {totalPages}
            </Typography>
            <IconButton
              size="small"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
              sx={{
                width: 28,
                height: 28,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              <ChevronLeftRoundedIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
            <IconButton
              size="small"
              disabled={!hasMore}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
              sx={{
                width: 28,
                height: 28,
                color: "text.secondary",
                "&:hover": { color: "text.primary" },
              }}
            >
              <ChevronRightRoundedIcon sx={{ fontSize: "1.125rem" }} />
            </IconButton>
          </Stack>
        )}
      </Stack>
    </AppCard>
  );
}
