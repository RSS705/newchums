"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";
import { notifyObjectivesChanged } from "@/components/objectives/NextStepNudge";
import { AppCard, useToast } from "@/components/ui";
import UserAvatar from "@/components/common/UserAvatar";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type OnNewChumsContact = {
  contactId: string;
  userId: string;
  type: "on_newchums";
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  savedAt?: string | Date;
  note: string | null;
  birthday?: { month: number; day: number } | null;
};

type PrivateContact = {
  contactId: string;
  type: "private";
  displayName: string;
  email: string | null;
  savedAt?: string | Date;
  note: string | null;
};

type SearchUser = {
  userId: string;
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  isSaved: boolean;
};

type SearchResponse = {
  ok?: boolean;
  users?: SearchUser[];
  inviteEligible?: boolean;
  inviteeEmail?: string;
  alreadyInvited?: boolean;
  isPrivateContact?: boolean;
};

// ─── ContactRow (On NewChums) ────────────────────────────────────────────────

function ContactRow({
  contact,
  actionLoading,
  avatarBaseUrl,
  onRemove,
  onNoteChange,
}: {
  contact: OnNewChumsContact;
  actionLoading: boolean;
  avatarBaseUrl: string;
  onRemove: (contactId: string) => void;
  onNoteChange: (contactId: string, note: string | null) => void;
}) {
  const handle = contact.handle;
  const handleSlug = handle?.replace(/^@/, "") ?? null;
  const profileHref = handleSlug ? `/u/${handleSlug}` : null;

  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(contact.note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      const res = await apiFetch(`/chums/${contact.contactId}/note`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ note: noteText.trim() || null }),
      });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      onNoteChange(contact.contactId, noteText.trim() || null);
      setEditingNote(false);
    } catch {
      setEditingNote(false);
      setNoteText(contact.note ?? "");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleCancelNote = () => {
    setNoteText(contact.note ?? "");
    setEditingNote(false);
  };

  const birthday = contact.birthday;
  const birthdayLabel = birthday
    ? `${MONTH_NAMES[(birthday.month - 1) % 12]} ${birthday.day}`
    : null;

  return (
    <Box sx={{ py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.5, sm: 2 } }}>
        <UserAvatar
          src={contact.avatarUrl ? `${avatarBaseUrl}${contact.avatarUrl}` : null}
          name={contact.displayName}
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
              {contact.displayName}
            </Typography>
          ) : (
            <Typography
              fontWeight={600}
              sx={{ fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {contact.displayName}
            </Typography>
          )}
          <Stack direction="row" alignItems="center" spacing={1.25} flexWrap="wrap">
            {handle && (
              <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

        <Tooltip title={contact.note ? "Edit note" : "Add private note"} placement="top" arrow>
          <IconButton
            size="small"
            onClick={() => setEditingNote((p) => !p)}
            sx={{ color: contact.note ? "primary.main" : "text.disabled", "&:hover": { color: "primary.main" }, flexShrink: 0 }}
            aria-label="Private note"
          >
            <EditNoteRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Box sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            disabled={actionLoading}
            onClick={() => onRemove(contact.contactId)}
            sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
          >
            {actionLoading ? <CircularProgress size={14} sx={{ mx: 1 }} /> : "Remove"}
          </Button>
        </Box>
      </Box>

      {editingNote && (
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
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, fontSize: "0.875rem" } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center">
            <Button size="small" variant="contained" onClick={handleSaveNote} disabled={noteSaving} sx={{ fontSize: "0.8rem", py: 0.4, px: 1.5 }}>
              {noteSaving ? <CircularProgress size={12} color="inherit" sx={{ mx: 0.5 }} /> : "Save"}
            </Button>
            <Button size="small" variant="text" color="inherit" onClick={handleCancelNote} disabled={noteSaving} sx={{ fontSize: "0.8rem", py: 0.4 }}>
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

      {!editingNote && contact.note && (
        <Box sx={{ mt: 0.75, ml: { xs: 0, sm: "60px" } }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontStyle: "italic", lineHeight: 1.5, cursor: "pointer", "&:hover": { color: "text.primary" } }}
            onClick={() => setEditingNote(true)}
          >
            {contact.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── PrivateContactRow ──────────────────────────────────────────────────────

function PrivateContactRow({
  contact,
  actionLoading,
  onRemove,
  onNoteChange,
  onInvite,
}: {
  contact: PrivateContact;
  actionLoading: boolean;
  onRemove: (contactId: string) => void;
  onNoteChange: (contactId: string, note: string | null) => void;
  onInvite?: (email: string) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(contact.note ?? "");
  const [noteSaving, setNoteSaving] = useState(false);

  const handleSaveNote = async () => {
    setNoteSaving(true);
    try {
      const res = await apiFetch(`/chums/${contact.contactId}/note`, {
        method: "PATCH",
        auth: true,
        body: JSON.stringify({ note: noteText.trim() || null }),
      });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      onNoteChange(contact.contactId, noteText.trim() || null);
      setEditingNote(false);
    } catch {
      setEditingNote(false);
      setNoteText(contact.note ?? "");
    } finally {
      setNoteSaving(false);
    }
  };

  const handleCancelNote = () => {
    setNoteText(contact.note ?? "");
    setEditingNote(false);
  };

  return (
    <Box sx={{ py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.5, sm: 2 } }}>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            bgcolor: "action.hover",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <PersonOutlineRoundedIcon sx={{ color: "text.disabled", fontSize: 24 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            fontWeight={600}
            sx={{ fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {contact.displayName}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            {contact.email && contact.displayName !== contact.email && (
              <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {contact.email}
              </Typography>
            )}
            <Tooltip title="Only visible to you. Not on NewChums yet." placement="top" arrow enterTouchDelay={0}>
              <Chip label="Private" size="small" variant="outlined" sx={{ fontSize: "0.6875rem", height: 20, fontWeight: 500, color: "text.secondary", borderColor: "divider", cursor: "help" }} />
            </Tooltip>
          </Stack>
        </Box>

        <Tooltip title={contact.note ? "Edit note" : "Add private note"} placement="top" arrow>
          <IconButton
            size="small"
            onClick={() => setEditingNote((p) => !p)}
            sx={{ color: contact.note ? "primary.main" : "text.disabled", "&:hover": { color: "primary.main" }, flexShrink: 0 }}
            aria-label="Private note"
          >
            <EditNoteRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {onInvite && contact.email && (
          <Tooltip title="Invite to NewChums" placement="top" arrow>
            <IconButton
              size="small"
              onClick={() => onInvite(contact.email!)}
              sx={{ color: "text.disabled", "&:hover": { color: "primary.main" }, flexShrink: 0 }}
              aria-label="Invite to NewChums"
            >
              <MailOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}

        <Box sx={{ flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            disabled={actionLoading}
            onClick={() => onRemove(contact.contactId)}
            sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
          >
            {actionLoading ? <CircularProgress size={14} sx={{ mx: 1 }} /> : "Remove"}
          </Button>
        </Box>
      </Box>

      {editingNote && (
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
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2, fontSize: "0.875rem" } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center">
            <Button size="small" variant="contained" onClick={handleSaveNote} disabled={noteSaving} sx={{ fontSize: "0.8rem", py: 0.4, px: 1.5 }}>
              {noteSaving ? <CircularProgress size={12} color="inherit" sx={{ mx: 0.5 }} /> : "Save"}
            </Button>
            <Button size="small" variant="text" color="inherit" onClick={handleCancelNote} disabled={noteSaving} sx={{ fontSize: "0.8rem", py: 0.4 }}>
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

      {!editingNote && contact.note && (
        <Box sx={{ mt: 0.75, ml: { xs: 0, sm: "60px" } }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", fontStyle: "italic", lineHeight: 1.5, cursor: "pointer", "&:hover": { color: "text.primary" } }}
            onClick={() => setEditingNote(true)}
          >
            {contact.note}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

// ─── SearchResultRow ────────────────────────────────────────────────────────

function SearchResultRow({
  user,
  isSaved,
  actionLoading,
  avatarBaseUrl,
  onAdd,
}: {
  user: SearchUser;
  isSaved: boolean;
  actionLoading: boolean;
  avatarBaseUrl: string;
  onAdd: (userId: string) => void;
}) {
  const handle = user.handle;
  const handleSlug = handle?.replace(/^@/, "") ?? null;
  const profileHref = handleSlug ? `/u/${handleSlug}` : null;

  return (
    <Box sx={{ py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.5, sm: 2 } }}>
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
            <Typography fontWeight={600} sx={{ fontSize: "0.9375rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.displayName}
            </Typography>
          )}
          {handle && (
            <Typography variant="body2" color="text.secondary" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {handle}
            </Typography>
          )}
        </Box>

        <Box sx={{ flexShrink: 0 }}>
          {isSaved ? (
            <Button variant="outlined" size="small" color="inherit" disabled sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
              Added
            </Button>
          ) : (
            <Button
              variant="contained"
              size="small"
              disabled={actionLoading}
              onClick={() => onAdd(user.userId)}
              sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
            >
              {actionLoading ? <CircularProgress size={14} color="inherit" sx={{ mx: 1 }} /> : "Add"}
            </Button>
          )}
        </Box>
      </Box>
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
            You already have a pending invitation out to <strong>{email}</strong>. When they sign up, they&apos;ll appear in your On NewChums section.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              <strong>{email}</strong> isn&apos;t on NewChums yet. We&apos;ll send them a friendly invite on your behalf.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              When they sign up through your invite link, they&apos;ll appear in your On NewChums section automatically.
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

// ─── AddPrivateContactDialog ────────────────────────────────────────────────

function AddPrivateContactDialog({
  open,
  initialEmail,
  onClose,
  onAdded,
}: {
  open: boolean;
  initialEmail?: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(initialEmail ?? "");
      setName("");
      setNote("");
    }
  }, [open, initialEmail]);

  const handleSave = async () => {
    const emailVal = email.trim().toLowerCase();
    const nameVal = name.trim();
    if (!emailVal && !nameVal) {
      toast.error("Provide a name or email.");
      return;
    }
    if (emailVal && !EMAIL_RE.test(emailVal)) {
      toast.error("Please enter a valid email.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch("/chums/private", {
        method: "POST",
        auth: true,
        body: JSON.stringify({
          email: emailVal || undefined,
          name: nameVal || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json() as { ok?: boolean; autoLinked?: boolean; type?: string };
      if (!data.ok) throw new Error();
      if (data.autoLinked) {
        toast.success("This person already has an account — saved to On NewChums!");
      } else {
        toast.success("Private contact added.");
      }
      notifyObjectivesChanged();
      onAdded();
      onClose();
    } catch {
      toast.error("Couldn't add contact. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>Add private contact</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Private contacts are only visible to you. Useful for planning and invites. If they later join NewChums, they&apos;ll automatically move to your On NewChums section.
          </Typography>
          <TextField
            label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            fullWidth
            size="small"
            type="email"
            placeholder="friend@example.com"
          />
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            placeholder="Optional"
          />
          <TextField
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
            size="small"
            multiline
            minRows={2}
            maxRows={4}
            placeholder="e.g. likes board games, usually free Fridays"
            inputProps={{ maxLength: 500 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button variant="text" color="inherit" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || (!email.trim() && !name.trim())}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {saving ? "Saving…" : "Add contact"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChumsClient() {
  const toast = useToast();
  const avatarBaseUrl = getAvatarBaseUrl();

  const [onNewChums, setOnNewChums] = useState<OnNewChumsContact[]>([]);
  const [privateContacts, setPrivateContacts] = useState<PrivateContact[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [inviteEligible, setInviteEligible] = useState(false);
  const [inviteeEmail, setInviteeEmail] = useState("");
  const [alreadyInvited, setAlreadyInvited] = useState(false);
  const [isPrivateContact, setIsPrivateContact] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);

  const [addPrivateOpen, setAddPrivateOpen] = useState(false);
  const [addPrivateEmail, setAddPrivateEmail] = useState("");

  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedUserIds = useMemo(() => new Set(onNewChums.map((c) => c.userId)), [onNewChums]);

  const isEmailInput = EMAIL_RE.test(searchQuery.trim());

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/chums", { auth: true });
      const data = await res.json() as { ok?: boolean; onNewChums?: OnNewChumsContact[]; privateContacts?: PrivateContact[] };
      if (data.ok) {
        setOnNewChums(data.onNewChums ?? []);
        setPrivateContacts(data.privateContacts ?? []);
      }
    } catch {
      toast.error("Couldn't load your contacts.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      setInviteEligible(false);
      setIsPrivateContact(false);
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    setInviteEligible(false);
    setIsPrivateContact(false);
    try {
      const res = await apiFetch(`/chums/search?q=${encodeURIComponent(trimmed)}`, { auth: true });
      const data = await res.json() as SearchResponse;
      if (data.ok) {
        setSearchResults(data.users ?? []);
        setInviteEligible(data.inviteEligible ?? false);
        setInviteeEmail(data.inviteeEmail ?? "");
        setAlreadyInvited(data.alreadyInvited ?? false);
        setIsPrivateContact(data.isPrivateContact ?? false);
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

  /** Reset Find and add people (search field, results, email invite row). */
  const clearFindAndAddArea = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    setSearchQuery("");
    setSearchResults([]);
    setHasSearched(false);
    setInviteEligible(false);
    setInviteeEmail("");
    setAlreadyInvited(false);
    setIsPrivateContact(false);
    setSearchLoading(false);
  }, []);

  const handlePrivateContactAdded = useCallback(() => {
    clearFindAndAddArea();
    void fetchContacts();
  }, [clearFindAndAddArea, fetchContacts]);

  const handleAddOnNewChums = async (userId: string) => {
    setActionLoading((prev) => new Set(prev).add(userId));
    try {
      const res = await apiFetch(`/chums/${userId}`, { method: "POST", auth: true });
      const data = await res.json() as { ok?: boolean; contactId?: string };
      if (!data.ok) throw new Error();
      const added = searchResults.find((u) => u.userId === userId);
      if (added) {
        setOnNewChums((prev) => [{
          contactId: data.contactId ?? `temp-${userId}`,
          userId: added.userId,
          type: "on_newchums",
          displayName: added.displayName,
          handle: added.handle,
          avatarUrl: added.avatarUrl,
          note: null,
          birthday: null,
        }, ...prev]);
      }
      clearFindAndAddArea();
      toast.success("Chum saved");
      notifyObjectivesChanged();
    } catch {
      toast.error("Couldn't add contact. Please try again.");
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(userId); return next; });
    }
  };

  const handleRemoveContact = async (contactId: string) => {
    setActionLoading((prev) => new Set(prev).add(contactId));
    try {
      const res = await apiFetch(`/chums/${contactId}`, { method: "DELETE", auth: true });
      const data = await res.json() as { ok?: boolean };
      if (!data.ok) throw new Error();
      setOnNewChums((prev) => prev.filter((c) => c.contactId !== contactId));
      setPrivateContacts((prev) => prev.filter((c) => c.contactId !== contactId));
      toast.success("Chum removed");
    } catch {
      toast.error("Couldn't remove contact. Please try again.");
    } finally {
      setActionLoading((prev) => { const next = new Set(prev); next.delete(contactId); return next; });
    }
  };

  const handleNoteChange = useCallback((contactId: string, note: string | null) => {
    setOnNewChums((prev) => prev.map((c) => c.contactId === contactId ? { ...c, note } : c));
    setPrivateContacts((prev) => prev.map((c) => c.contactId === contactId ? { ...c, note } : c));
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
      toast.success(`Invitation sent to ${inviteeEmail}!`);
      setAlreadyInvited(true);
      fetchContacts();
    } catch {
      toast.error("Couldn't send invitation. Please try again.");
    } finally {
      setInviteSending(false);
    }
  };

  const handleInviteFromRow = (email: string) => {
    setInviteeEmail(email);
    setAlreadyInvited(false);
    setInviteDialogOpen(true);
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
          Keep track of people you connect with on NewChums and contacts for planning.
        </Typography>
      </Box>

      {/* Search / Add */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>Find and add people</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Search by name, @handle, or email.
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

          {hasSearched && searchResults.length === 0 && !searchLoading && !inviteEligible && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
              No results found for &ldquo;{searchQuery}&rdquo;.
            </Typography>
          )}

          {/* Invite / Add Private CTA — email entered, no eligible account found */}
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
                  {alreadyInvited ? "Invitation already sent" : "Not on NewChums yet"}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                {!isPrivateContact && (
                  <Button
                    variant="outlined"
                    size="small"
                    color="inherit"
                    onClick={() => { setAddPrivateEmail(inviteeEmail); setAddPrivateOpen(true); }}
                    sx={{ flexShrink: 0, fontSize: "0.8125rem" }}
                  >
                    Add as private contact
                  </Button>
                )}
                <Button
                  variant={alreadyInvited ? "outlined" : "contained"}
                  size="small"
                  color={alreadyInvited ? "inherit" : "primary"}
                  onClick={() => setInviteDialogOpen(true)}
                  sx={{ flexShrink: 0, fontSize: "0.8125rem" }}
                >
                  {alreadyInvited ? "Invited" : "Invite to NewChums"}
                </Button>
              </Stack>
            </Box>
          )}

          {/* Search results */}
          {searchResults.length > 0 && (
            <Stack divider={<Divider />} sx={{ mt: 0.5 }}>
              {searchResults.map((user) => (
                <SearchResultRow
                  key={user.userId}
                  user={user}
                  isSaved={user.isSaved || savedUserIds.has(user.userId)}
                  actionLoading={actionLoading.has(user.userId)}
                  avatarBaseUrl={avatarBaseUrl}
                  onAdd={handleAddOnNewChums}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>

      {/* Chum List */}
      <AppCard>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>Your chum list</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              People you&apos;ve saved. Private contacts are only visible to you.
            </Typography>
          </Box>

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : onNewChums.length === 0 && privateContacts.length === 0 ? (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 0.5 }}>
                No chums yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Use the search above to find and add people.
              </Typography>
            </Box>
          ) : (
            <Stack divider={<Divider />}>
              {onNewChums.map((contact) => (
                <ContactRow
                  key={contact.contactId}
                  contact={contact}
                  actionLoading={actionLoading.has(contact.contactId)}
                  avatarBaseUrl={avatarBaseUrl}
                  onRemove={handleRemoveContact}
                  onNoteChange={handleNoteChange}
                />
              ))}
              {privateContacts.map((contact) => (
                <PrivateContactRow
                  key={contact.contactId}
                  contact={contact}
                  actionLoading={actionLoading.has(contact.contactId)}
                  onRemove={handleRemoveContact}
                  onNoteChange={handleNoteChange}
                  onInvite={handleInviteFromRow}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </AppCard>

      <InviteDialog
        open={inviteDialogOpen}
        email={inviteeEmail}
        alreadyInvited={alreadyInvited}
        onClose={() => setInviteDialogOpen(false)}
        onConfirm={handleSendInvite}
        sending={inviteSending}
      />

      <AddPrivateContactDialog
        open={addPrivateOpen}
        initialEmail={addPrivateEmail}
        onClose={() => setAddPrivateOpen(false)}
        onAdded={handlePrivateContactAdded}
      />
    </Stack>
  );
}
