"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Stack, TextField, InputAdornment, Chip, Avatar,
  CircularProgress, Button, ToggleButtonGroup, ToggleButton,
} from "@mui/material";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import Link from "next/link";
import { AppCard, EmptyState } from "@/components/ui";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

type Community = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
  avatar_key: string | null;
  member_count: number;
  location_name: string | null;
  owner_user_id: string;
  created_at: string;
};

export default function CommunitiesListClient() {
  const router = useRouter();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "mine">("all");

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (view === "mine") params.set("mine", "1");
      if (search.trim()) params.set("q", search.trim());
      const res = await apiFetch(`/communities?${params.toString()}`, { auth: true });
      const data = await res.json();
      if (data.ok) setCommunities(data.communities);
    } catch { /* noop */ }
    setLoading(false);
  }, [search, view]);

  useEffect(() => {
    const timer = setTimeout(fetchCommunities, 300);
    return () => clearTimeout(timer);
  }, [fetchCommunities]);

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "flex-start" }} spacing={2}>
        <Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.75rem", sm: "2rem" },
                fontWeight: 700,
                lineHeight: 1.25,
                letterSpacing: "-0.02em",
              }}
            >
              Communities
            </Typography>
            <Chip label="Beta" size="small" variant="outlined" color="info" sx={{ height: 22, fontSize: "0.75rem", fontWeight: 600 }} />
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
            Find groups of people who share your interests, or start your own.
          </Typography>
        </Box>
        <Button
          component={Link}
          href="/communities/create"
          variant="contained"
          startIcon={<AddCircleRoundedIcon />}
          sx={{
            borderRadius: 2.5,
            textTransform: "none",
            fontWeight: 600,
            fontSize: "0.9375rem",
            px: 3,
            py: 1.25,
            boxShadow: "none",
            whiteSpace: "nowrap",
            "&:hover": { boxShadow: "none", opacity: 0.92 },
          }}
        >
          Create a community
        </Button>
      </Stack>

      {/* Search + filter */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
        <TextField
          size="small"
          placeholder="Search communities..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, minWidth: 200 }}
        />
        <ToggleButtonGroup
          value={view}
          exclusive
          onChange={(_, v) => { if (v) setView(v); }}
          size="small"
        >
          <ToggleButton value="all" sx={{ textTransform: "none", px: 2 }}>All</ToggleButton>
          <ToggleButton value="mine" sx={{ textTransform: "none", px: 2 }}>Yours</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Content */}
      {loading && communities.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : communities.length === 0 ? (
        <AppCard>
          <EmptyState
            icon={<PeopleRoundedIcon sx={{ fontSize: 56 }} />}
            title={view === "mine" ? "You haven't joined any communities yet" : "No communities found"}
            description={
              view === "mine"
                ? "Browse what's available or start your own community."
                : search.trim()
                  ? "Try a different search or create a new community."
                  : "Be the first to create a community and bring people together."
            }
            action={
              <Stack direction="row" spacing={1.5}>
                {view === "mine" && (
                  <Button
                    variant="outlined"
                    onClick={() => setView("all")}
                    sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
                  >
                    Browse communities
                  </Button>
                )}
                <Button
                  component={Link}
                  href="/communities/create"
                  variant="contained"
                  startIcon={<AddCircleRoundedIcon />}
                  sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
                >
                  Create a community
                </Button>
              </Stack>
            }
          />
        </AppCard>
      ) : (
        <Stack spacing={2}>
          {communities.map((c) => (
            <AppCard
              key={c.id}
              sx={{
                cursor: "pointer",
                transition: "box-shadow 0.15s, transform 0.15s",
                "&:hover": { boxShadow: "0 4px 16px rgba(0,0,0,0.08)", transform: "translateY(-1px)" },
              }}
              onClick={() => router.push(`/communities/${c.slug}`)}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar
                  variant="rounded"
                  src={c.avatar_key ? `${getAvatarBaseUrl()}/communities/${c.id}/avatar` : undefined}
                  sx={{
                    width: 48, height: 48,
                    borderRadius: 2,
                    bgcolor: "primary.main", color: "primary.contrastText",
                    fontWeight: 700, fontSize: "1.1rem",
                  }}
                >
                  {c.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                    <Typography fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.35 }} noWrap>
                      {c.name}
                    </Typography>
                    {c.visibility === "private" ? (
                      <LockRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    ) : (
                      <PublicRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    )}
                  </Stack>
                  {c.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {c.description}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, fontSize: "0.8125rem" }}>
                      {c.member_count} {c.member_count === 1 ? "member" : "members"}
                    </Typography>
                    {c.location_name && (
                      <>
                        <Typography variant="body2" color="text.disabled">·</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem" }}>
                          {c.location_name}
                        </Typography>
                      </>
                    )}
                    {c.join_mode === "approval_required" && (
                      <Chip label="Approval required" size="small" color="warning" variant="outlined" />
                    )}
                  </Stack>
                </Box>
              </Stack>
            </AppCard>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
