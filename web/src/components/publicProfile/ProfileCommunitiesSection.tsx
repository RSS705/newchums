"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppCard } from "@/components/ui";

type PublicCommunity = {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  visibility: "public" | "private" | string;
  isOnline: boolean;
  memberCount: number;
  hobbies: { name: string; slug: string }[];
};

type FetchState =
  | { status: "loading" }
  | { status: "success"; communities: PublicCommunity[] }
  | { status: "error" };

type Props = {
  ownerHandle: string;
  viewerLoggedIn?: boolean;
};

const HOBBY_CAP = 3;

export default function ProfileCommunitiesSection({ ownerHandle, viewerLoggedIn }: Props) {
  const avatarBaseUrl = getAvatarBaseUrl();
  const [state, setState] = useState<FetchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const handleSlug = ownerHandle.replace(/^@/, "");
    const run = async () => {
      try {
        const res = await apiFetch(
          `/public/users/${encodeURIComponent(handleSlug)}/communities`,
          { auth: viewerLoggedIn === true },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          communities?: PublicCommunity[];
          hidden?: boolean;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setState({ status: "error" });
          return;
        }
        if (data.hidden) {
          setState({ status: "success", communities: [] });
          return;
        }
        setState({ status: "success", communities: data.communities ?? [] });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [ownerHandle, viewerLoggedIn]);

  // Empty / loading / error: render nothing so we never produce an empty card.
  if (state.status !== "success" || state.communities.length === 0) {
    return null;
  }

  return (
    <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
          Communities
        </Typography>

        {/* Spacing-only separation, no dividers, keeps the section feeling
            light next to the avatar-grid Chums section above. */}
        <Stack spacing={1}>
          {state.communities.map((community) => {
            const isPrivate = community.visibility === "private";
            const visibleHobbies = community.hobbies.slice(0, HOBBY_CAP);
            const overflowHobbies = Math.max(0, community.hobbies.length - visibleHobbies.length);
            return (
              <Box
                key={community.id}
                component={Link}
                href={`/communities/${community.slug}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: { xs: 1.75, sm: 2 },
                  py: 1.25,
                  px: 1,
                  mx: -1,
                  textDecoration: "none",
                  color: "inherit",
                  borderRadius: 1.5,
                  transition: "background-color 0.15s ease",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Avatar
                  variant="rounded"
                  src={community.avatarUrl ? `${avatarBaseUrl}${community.avatarUrl}` : undefined}
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 1.5,
                    bgcolor: community.avatarUrl ? "grey.100" : "primary.main",
                    color: "primary.contrastText",
                    fontWeight: 700,
                    fontSize: "1.0625rem",
                    flexShrink: 0,
                  }}
                >
                  {community.name.charAt(0).toUpperCase()}
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                    <Typography
                      fontWeight={600}
                      sx={{
                        fontSize: "0.9375rem",
                        lineHeight: 1.35,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {community.name}
                    </Typography>
                    {isPrivate ? (
                      <LockRoundedIcon
                        aria-label="Private community"
                        sx={{ fontSize: "0.875rem", color: "text.disabled", flexShrink: 0 }}
                      />
                    ) : (
                      <PublicRoundedIcon
                        aria-label="Public community"
                        sx={{ fontSize: "0.875rem", color: "text.disabled", flexShrink: 0 }}
                      />
                    )}
                  </Stack>

                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    sx={{ mt: 0.5, flexWrap: "wrap", rowGap: 0.5 }}
                  >
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                      {community.memberCount === 1 ? "1 member" : `${community.memberCount} members`}
                    </Typography>
                    {visibleHobbies.length > 0 && (
                      <>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: "0.75rem" }}>
                          ·
                        </Typography>
                        {visibleHobbies.map((h) => (
                          <Chip
                            key={h.slug}
                            label={h.name}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: "0.6875rem",
                              fontWeight: 500,
                              bgcolor: "action.hover",
                              color: "text.secondary",
                              "& .MuiChip-label": { px: 0.875 },
                            }}
                          />
                        ))}
                        {overflowHobbies > 0 && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.75rem" }}>
                            +{overflowHobbies}
                          </Typography>
                        )}
                      </>
                    )}
                  </Stack>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </Stack>
    </AppCard>
  );
}
