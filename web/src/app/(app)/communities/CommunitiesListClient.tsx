"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Stack, TextField, InputAdornment, Chip, Avatar,
  CircularProgress, Button, ToggleButtonGroup, ToggleButton,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import PublicRoundedIcon from "@mui/icons-material/PublicRounded";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type Community = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: string;
  join_mode: string;
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
    <Box sx={{ maxWidth: 800, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Communities</Typography>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={() => router.push("/communities/create")}
          sx={{ borderRadius: 2, textTransform: "none" }}
        >
          Create
        </Button>
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }} sx={{ mb: 3 }}>
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

      {loading && communities.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : communities.length === 0 ? (
        <AppCard>
          <Stack spacing={1.5} alignItems="center" sx={{ py: 4 }}>
            <PeopleRoundedIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography variant="body1" color="text.secondary">
              {view === "mine" ? "You haven't joined any communities yet." : "No communities found."}
            </Typography>
            {view === "mine" && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => setView("all")}
                sx={{ textTransform: "none", mt: 1 }}
              >
                Browse communities
              </Button>
            )}
          </Stack>
        </AppCard>
      ) : (
        <Stack spacing={2}>
          {communities.map((c) => (
            <AppCard
              key={c.id}
              sx={{
                cursor: "pointer",
                transition: "box-shadow 0.15s",
                "&:hover": { boxShadow: "0 2px 12px rgba(0,0,0,0.08)" },
              }}
              onClick={() => router.push(`/communities/${c.slug}`)}
            >
              <Stack direction="row" spacing={2} alignItems="flex-start">
                <Avatar
                  sx={{
                    width: 48, height: 48,
                    bgcolor: "primary.main", color: "primary.contrastText",
                    fontWeight: 700, fontSize: "1.1rem",
                  }}
                >
                  {c.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap>
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
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip
                      icon={<PeopleRoundedIcon sx={{ fontSize: "14px !important" }} />}
                      label={`${c.member_count} member${c.member_count !== 1 ? "s" : ""}`}
                      size="small"
                      variant="outlined"
                    />
                    {c.location_name && (
                      <Chip label={c.location_name} size="small" variant="outlined" />
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
    </Box>
  );
}
