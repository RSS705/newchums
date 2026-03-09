"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CakeOutlinedIcon from "@mui/icons-material/CakeOutlined";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { AppCard, useToast } from "@/components/ui";
import UserAvatar from "@/components/common/UserAvatar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ChumUser = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  chummedAt?: string | Date;
  isMutual?: boolean;
  note?: string | null;
  birthday?: { month: number; day: number } | null;
};

type SearchUser = ChumUser & { isChummed: boolean };

type SearchResponse = {
  ok?: boolean;
  users?: SearchUser[];
  inviteEligible?: boolean;
  inviteeEmail?: string;
  alreadyInvited?: boolean;
};

// ─── ChumRow ─────────────────────────────────────────────────────────────────

function ChumRow({
  user,
  isChummed,
  actionLoading,
  avatarBaseUrl,
  onAdd,
  onRemove,
  onNoteChange,
}: {
  user: ChumUser;
  isChummed: boolean;
  actionLoading: boolean;
  avatarBaseUrl: string;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
  onNoteChange?: (userId: string, note: string | null) => void;
}) {
  const handle = user.handle;
  const handleSlug = handle?.replace(/^@/, "") ?? null;
  const profileHref = handleSlug ? `/u/${handleSlug}` : null;

  const showNote = typeof onNoteChange === "function";
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(user.note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      const res = await apiFetch(`/chums/${user.userId}/note`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ note: noteText.trim() || null }),
      });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      onNoteChange!(user.userId, noteText.trim() || null);
      setEditingNote(false);
    } catch {
      // toast is available via context but ChumRow doesn't import it directly;
      // failure is non-critical — just close the edit and let user try again
      setEditingNote(false);
      setNoteText(user.note ?? "");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleCancelNote = () => {
    setNoteText(user.note ?? "");
    setEditingNote(false);
  };

  const birthday = user.birthday;
  const birthdayLabel = birthday
    ? `${MONTH_NAMES[(birthday.month - 1) % 12]} ${birthday.day}`
    : null;

  return (
    <Box sx={{ py: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 1.5, sm: 2 },
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
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            {handle && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {handle}
              </Typography>
            )}
            {birthdayLabel && (
              <Tooltip title="Birthday (month & day only)" placement="top" arrow>
                <Stack direction="row" alignItems="center" spacing={0.4} sx={{ color: "text.disabled", flexShrink: 0 }}>
                  <CakeOutlinedIcon sx={{ fontSize: 13 }} />
                  <Typography variant="caption" sx={{ lineHeight: 1, letterSpacing: 0.1 }}>
                    {birthdayLabel}
                  </Typography>
                </Stack>
              </Tooltip>
            )}
          </Stack>
        </Box>

        {/* Mutual Chums indicator */}
        {user.isMutual && isChummed && (
          <Tooltip title="Mutual Chums" placement="top" arrow>
            <Box
              component="span"
              sx={{ display: "flex", alignItems: "center", flexShrink: 0, fontSize: 18, lineHeight: 1 }}
              aria-label="Mutual Chums"
            >
              🤝
            </Box>
          </Tooltip>
        )}

        {/* Note toggle (only in chum list) */}
        {showNote && (
          <Tooltip title={user.note ? "Edit note" : "Add private note"} placement="top" arrow>
            <IconButton
              size="small"
              onClick={() => setEditingNote((p) => !p)}
              sx={{
                color: user.note ? "primary.main" : "text.disabled",
                "&:hover": { color: "primary.main" },
                flexShrink: 0,
              }}
              aria-label="Private note"
            >
              <EditNoteRoundedIcon fontSize="small" />
            </IconButton>
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

      {/* Inline note editor — shown when showNote is true */}
      {showNote && editingNote && (
        <Box sx={{ mt: 1.25, ml: { xs: 0, sm: "60px" } }}>
          <TextField
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a private note about this person…"
            multiline
            minRows={2}
            maxRows={5}
            fullWidth
            size="small"
            inputProps={{ maxLength: 500 }}
            sx={{
              "& .MuiOutlinedInput-root": { borderRadius: 2, fontSize: "0.875rem" },
            }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center">
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveNote}
              disabled={noteSaving}
              sx={{ fontSize: "0.8rem", py: 0.4, px: 1.5 }}
            >
              {noteSaving ? <CircularProgress size={12} color="inherit" sx={{ mx: 0.5 }} /> : "Save"}
            </Button>
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={handleCancelNote}
              disabled={noteSaving}
              sx={{ fontSize: "0.8rem", py: 0.4 }}
            >
              Cancel
            </Button>
            {noteText.trim().length > 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ ml: "auto !important" }}>
                {noteText.trim().length}/500
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* Saved note display (collapsed view) */}
      {showNote && !editingNote && user.note && (
        <Box sx={{ mt: 0.75, ml: { xs: 0, sm: "60px" } }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              fontStyle: "italic",
              lineHeight: 1.5,
              cursor: "pointer",
              "&:hover": { color: "text.primary" },
            }}
            onClick={() => setEditingNote(true)}
          >
            {user.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── InviteDialog ────────────────────────────────────────────────────────────

function InviteDialog({
  open,
  email,
  alreadyInvited,
  onClose,
  onConfirm,
  sending,
}: {
  open: boolean;
  email: string;
  alreadyInvited: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sending: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
        {alreadyInvited ? "Invitation already sent" : "Invite to NewChums"}
      </DialogTitle>
      <DialogContent>
        {alreadyInvited ? (
          <Typography variant="body2" color="text.secondary">
            You already have a pending invitation out to <strong>{email}</strong>. Once they sign up through your invite, you&apos;ll automatically be added to each other&apos;s Chums.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              <strong>{email}</strong> isn&apos;t on NewChums yet. We&apos;ll send them a friendly invite on your behalf.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              If they sign up through your invite link, you&apos;ll automatically become Mutual Chums, no extra steps needed.
            </Typography>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="text" color="inherit" onClick={onClose} disabled={sending}>
          {alreadyInvited ? "Close" : "Cancel"}
        </Button>
        {!alreadyInvited && (
          <Button
            variant="contained"
            onClick={onConfirm}
            disabled={sending}
            startIcon={sending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {sending ? "Sending…" : "Send invitation"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChumsClient() {
  const toast = useToast();
  const avatarBaseUrl = getAvatarBaseUrl();

  const [chums, setChums] = useState<ChumUser[]>([]);
  const [chumsLoading, setChumsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Invite state
  const [inviteEligible, setInviteEligible] = useState(false);
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [alreadyInvited, setAlreadyInvited] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chummedIds = useMemo(() => new Set(chums.map((c) => c.userId)), [chums]);

  const isEmailInput = EMAIL_RE.test(searchQuery.trim());

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
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setInviteEligible(false);
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    setInviteEligible(false);
    try {
      const res = await apiFetch(`/chums/search?q=${encodeURIComponent(trimmed)}`, { auth: true });
      const data = await res.json() as SearchResponse;
      if (data.ok) {
        setSearchResults(data.users ?? []);
        setInviteEligible(data.inviteEligible ?? false);
        setInviteeEmail(data.inviteeEmail ?? "");
        setAlreadyInvited(data.alreadyInvited ?? false);
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
    searchDebounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleAdd = async (userId: string) => {
    setActionLoading((prev) => new Set(prev).add(userId));
    try {
      const res = await apiFetch(`/chums/${userId}`, { method: "POST", auth: true });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      const added = searchResults.find((u) => u.userId === userId);
      if (added) {
        setChums((prev) => [{ userId: added.userId, displayName: added.displayName, handle: added.handle, avatarUrl: added.avatarUrl, note: null, birthday: null }, ...prev]);
      }
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

  const handleNoteChange = useCallback((userId: string, note: string | null) => {
    setChums((prev) => prev.map((c) => c.userId === userId ? { ...c, note } : c));
  }, []);

  const handleSendInvite = async () => {
    setInviteSending(true);
    try {
      const res = await apiFetch("/chums/invite", {
        method: "POST",
        auth: true,
        body: JSON.stringify({ email: inviteeEmail }),
      });
      const data = await res.json() as { ok?: boolean; alreadyPending?: boolean; error?: { code?: string; message?: string } };
      if (!res.ok && data.error?.code === "RATE_LIMITED") {
        toast.error(data.error.message ?? "You've sent too many invites today.");
        setInviteDialogOpen(false);
        return;
      }
      if (!data.ok && !data.alreadyPending) throw new Error();
      setInviteDialogOpen(false);
      toast.success(`Invitation sent to ${inviteeEmail}! They'll be added to your Chums when they join.`);
      // Mark locally as already invited so re-search shows that state
      setAlreadyInvited(true);
    } catch {
      toast.error("Couldn't send invitation. Please try again.");
    } finally {
      setInviteSending(false);
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
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>Find new Chums</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Search by name, @handle, or email to connect with people you know.
            </Typography>
          </Box>
          <TextField
            placeholder="Search by name, @handle, or email…"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  {searchLoading
                    ? <CircularProgress size={18} />
                    : isEmailInput
                      ? <MailOutlineRoundedIcon sx={{ color: "text.secondary" }} />
                      : <SearchRoundedIcon sx={{ color: "text.secondary" }} />}
                </InputAdornment>
              ),
            }}
          />

          {/* No results */}
          {hasSearched && searchResults.length === 0 && !searchLoading && !inviteEligible && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No results found for &ldquo;{searchQuery}&rdquo;.
            </Typography>
          )}

          {/* Invite CTA — email entered, no eligible account found */}
          {hasSearched && inviteEligible && !searchLoading && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 1.5,
                py: 1,
                px: 1.5,
                borderRadius: 2,
                bgcolor: "action.hover",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inviteeEmail}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {alreadyInvited ? "Invitation already sent" : "Not on NewChums yet, invite them!"}
                </Typography>
              </Box>
              <Button
                variant={alreadyInvited ? "outlined" : "contained"}
                size="small"
                color={alreadyInvited ? "inherit" : "primary"}
                onClick={() => setInviteDialogOpen(true)}
                sx={{ flexShrink: 0, fontSize: "0.8125rem" }}
              >
                {alreadyInvited ? "Invited" : "Invite to NewChums"}
              </Button>
            </Box>
          )}

          {/* Search results */}
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
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>Your Chum list</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              People you enjoy planning with. Only you can see this list.
            </Typography>
          </Box>

          {chumsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : chums.length === 0 ? (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
                No Chums yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Use the search above to find people you know, or invite friends by email.
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
                  onNoteChange={handleNoteChange}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>

      {/* Invite confirmation dialog */}
      <InviteDialog
        open={inviteDialogOpen}
        email={inviteeEmail}
        alreadyInvited={alreadyInvited}
        onClose={() => setInviteDialogOpen(false)}
        onConfirm={handleSendInvite}
        sending={inviteSending}
      />
    </Stack>
  );
}
