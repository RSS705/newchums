"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import HandshakeRoundedIcon from "@mui/icons-material/HandshakeRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppCard, useToast } from "@/components/ui";
import UserAvatar from "@/components/common/UserAvatar";

type ChumUser = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  chummedAt?: string | Date;
  isMutual?: boolean;
};

type SearchUser = ChumUser & { isChummed: boolean };

function ChumRow({
  user,
  isChummed,
  actionLoading,
  avatarBaseUrl,
  onAdd,
  onRemove,
}: {
  user: ChumUser;
  isChummed: boolean;
  actionLoading: boolean;
  avatarBaseUrl: string;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const handle = user.handle;
  const handleSlug = handle?.replace(/^@/, "") ?? null;
  const profileHref = handleSlug ? `/u/${handleSlug}` : null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: { xs: 1.5, sm: 2 },
        py: 1.25,
      }}
    >
      <UserAvatar
        src={user.avatarUrl ? `${avatarBaseUrl}${user.avatarUrl}` : null}
        name={user.displayName}
        username={handle}
        size={44}
        sx={{ flexShrink: 0 }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {profileHref ? (
          <Typography
            component={Link}
            href={profileHref}
            fontWeight={600}
            sx={{
              fontSize: "0.9375rem",
              color: "text.primary",
              textDecoration: "none",
              "&:hover": { textDecoration: "underline" },
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.displayName}
          </Typography>
        ) : (
          <Typography
            fontWeight={600}
            sx={{
              fontSize: "0.9375rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {user.displayName}
          </Typography>
        )}
        {handle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {handle}
          </Typography>
        )}
      </Box>
      {/* Mutual Chums indicator — shown only when both users have added each other */}
      {user.isMutual && isChummed && (
        <Tooltip title="Mutual Chums" placement="top" arrow>
          <Box
            component="span"
            sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            aria-label="Mutual Chums"
          >
            <HandshakeRoundedIcon sx={{ fontSize: 18, color: "#F4B400", opacity: 0.9 }} />
          </Box>
        </Tooltip>
      )}
      <Box sx={{ flexShrink: 0 }}>
        {isChummed ? (
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            disabled={actionLoading}
            onClick={() => onRemove(user.userId)}
            sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
          >
            {actionLoading ? <CircularProgress size={14} sx={{ mx: 1 }} /> : "Remove"}
          </Button>
        ) : (
          <Button
            variant="contained"
            size="small"
            disabled={actionLoading}
            onClick={() => onAdd(user.userId)}
            sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
          >
            {actionLoading ? <CircularProgress size={14} color="inherit" sx={{ mx: 1 }} /> : "Add to Chums"}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default function ChumsClient() {
  const toast = useToast();
  const avatarBaseUrl = getAvatarBaseUrl();

  const [chums, setChums] = useState<ChumUser[]>([]);
  const [chumsLoading, setChumsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chummedIds = useMemo(() => new Set(chums.map((c) => c.userId)), [chums]);

  const fetchChums = useCallback(async () => {
    setChumsLoading(true);
    try {
      const res = await apiFetch("/chums", { auth: true });
      const data = await res.json() as { ok?: boolean; chums?: ChumUser[] };
      if (data.ok && Array.isArray(data.chums)) {
        setChums(data.chums);
      }
    } catch {
      toast.error("Couldn't load your Chum list.");
    } finally {
      setChumsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchChums();
  }, [fetchChums]);

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const res = await apiFetch(`/chums/search?q=${encodeURIComponent(q.trim())}`, { auth: true });
      const data = await res.json() as { ok?: boolean; users?: SearchUser[] };
      if (data.ok && Array.isArray(data.users)) {
        setSearchResults(data.users);
      }
    } catch {
      // Silently fail search
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  const handleAdd = async (userId: string) => {
    setActionLoading((prev) => new Set(prev).add(userId));
    try {
      const res = await apiFetch(`/chums/${userId}`, { method: "POST", auth: true });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      // Optimistically add to chums list
      const added = searchResults.find((u) => u.userId === userId);
      if (added) {
        setChums((prev) => [{ userId: added.userId, displayName: added.displayName, handle: added.handle, avatarUrl: added.avatarUrl }, ...prev]);
      }
      // Update search results
      setSearchResults((prev) => prev.map((u) => u.userId === userId ? { ...u, isChummed: true } : u));
      toast.success(`${added?.displayName ?? "User"} added to your Chums.`);
    } catch {
      toast.error("Couldn't add Chum. Please try again.");
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    }
  };

  const handleRemove = async (userId: string) => {
    setActionLoading((prev) => new Set(prev).add(userId));
    try {
      const res = await apiFetch(`/chums/${userId}`, { method: "DELETE", auth: true });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      const removed = chums.find((c) => c.userId === userId);
      setChums((prev) => prev.filter((c) => c.userId !== userId));
      setSearchResults((prev) => prev.map((u) => u.userId === userId ? { ...u, isChummed: false } : u));
      toast.success(`${removed?.displayName ?? "User"} removed from your Chums.`);
    } catch {
      toast.error("Couldn't remove Chum. Please try again.");
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    }
  };

  return (
    <Stack spacing={{ xs: 3, sm: 4 }}>
      {/* Header */}
      <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
        <Typography
          component="h1"
          sx={{ fontSize: { xs: "1.75rem", sm: "2rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em" }}
        >
          Your Chums
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}>
          Keep track of people you enjoy spending time with.
        </Typography>
      </Box>

      {/* Find New Chums */}
      <AppCard>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Find New Chums</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
              Search by name or @handle to find someone and add them to your Chums.
            </Typography>
          </Box>
          <TextField
            placeholder="Search by name or @handle…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {searchLoading
                    ? <CircularProgress size={18} />
                    : <SearchRoundedIcon sx={{ color: "text.secondary" }} />}
                </InputAdornment>
              ),
            }}
          />

          {/* Search results */}
          {hasSearched && searchResults.length === 0 && !searchLoading && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No results found for &ldquo;{searchQuery}&rdquo;.
            </Typography>
          )}
          {searchResults.length > 0 && (
            <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
              {searchResults.map((user) => (
                <ChumRow
                  key={user.userId}
                  user={user}
                  isChummed={user.isChummed || chummedIds.has(user.userId)}
                  actionLoading={actionLoading.has(user.userId)}
                  avatarBaseUrl={avatarBaseUrl}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>

      {/* Your Chum List */}
      <AppCard>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Your Chum List</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
              People you&apos;ve saved. Only you can see this list.
            </Typography>
          </Box>

          {chumsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : chums.length === 0 ? (
            <Box sx={{ py: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                You haven&apos;t added any Chums yet.
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Use the search above to find people you&apos;d like to keep in touch with.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {chums.map((user) => (
                <ChumRow
                  key={user.userId}
                  user={user}
                  isChummed={true}
                  actionLoading={actionLoading.has(user.userId)}
                  avatarBaseUrl={avatarBaseUrl}
                  onAdd={handleAdd}
                  onRemove={handleRemove}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>
    </Stack>
  );
}
