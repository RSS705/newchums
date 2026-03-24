"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Box, Typography, Stack, TextField, InputAdornment, Chip,
  CircularProgress, Table, TableHead, TableRow, TableCell, TableBody,
  IconButton, Tooltip, Button,
} from "@mui/material";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

type AdminCommunity = {
  id: string;
  slug: string;
  name: string;
  visibility: string;
  join_mode: string;
  chat_enabled: boolean;
  owner_name: string | null;
  owner_username: string | null;
  owner_email: string | null;
  member_count: number;
  plan_count: number;
  created_at: string;
};

export default function AdminCommunitiesClient() {
  const router = useRouter();
  const toast = useToast();
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchCommunities = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await apiFetch(`/admin/communities?${params.toString()}`, { auth: true });
      const data = await res.json();
      if (data.ok) setCommunities(data.communities);
    } catch { /* noop */ }
    setLoading(false);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(fetchCommunities, 300);
    return () => clearTimeout(timer);
  }, [fetchCommunities]);

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" and all its members? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/admin/communities/${id}/remove`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) { toast.success("Community removed"); fetchCommunities(); }
      else toast.error("Failed to remove");
    } catch { toast.error("Something went wrong"); }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: "auto", px: { xs: 2, sm: 3 }, py: 3 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Communities</Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          size="small"
          placeholder="Search by name, slug, owner..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </InputAdornment>
            ),
          }}
          sx={{ flex: 1, maxWidth: 400 }}
        />
      </Stack>

      {loading && communities.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : communities.length === 0 ? (
        <AppCard>
          <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
            No communities found.
          </Typography>
        </AppCard>
      ) : (
        <AppCard sx={{ overflow: "auto" }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Slug</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Visibility</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Join</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Members</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Plans</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Owner</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {communities.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>{c.name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary" noWrap>{c.slug}</Typography>
                  </TableCell>
                  <TableCell>
                    {c.visibility === "private" ? (
                      <Chip icon={<LockRoundedIcon sx={{ fontSize: "14px !important" }} />} label="Private" size="small" variant="outlined" />
                    ) : (
                      <Chip label="Public" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {c.join_mode === "approval_required" ? "Approval" : "Open"}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">{c.member_count}</TableCell>
                  <TableCell align="center">{c.plan_count}</TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                      {c.owner_name || c.owner_username || c.owner_email || "—"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(c.created_at).toLocaleDateString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="View">
                        <IconButton size="small" onClick={() => router.push(`/communities/${c.slug}`)}>
                          <OpenInNewRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Remove">
                        <IconButton size="small" color="error" onClick={() => handleRemove(c.id, c.name)}>
                          <DeleteRoundedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AppCard>
      )}
    </Box>
  );
}
