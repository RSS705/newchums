"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Switch from "@mui/material/Switch";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import PushPinRoundedIcon from "@mui/icons-material/PushPinRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import { AppButton, AppCard, AppTextField, useToast } from "@/components/ui";
import RichTextEditor from "@/components/ui/RichTextEditor";
import { apiFetch, getAvatarBaseUrl } from "@/lib/apiClient";

export type CommunityAnnouncement = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  authorUserId: string;
  authorName: string;
  /** Versioned avatar path (`/users/:id/avatar?v=<ts>`) or `null` when the
   *  author has no uploaded avatar. The card falls back to a Material
   *  Avatar with the author's initial in that case. */
  authorAvatarUrl: string | null;
};

type Props = {
  communityId: string;
  /** True when the viewer holds an authed session with read access. Drives
   *  the "mark seen" call on mount; logged-out viewers skip it. */
  isAuthenticated: boolean;
  /** Optional first-render hint that the viewer can manage. The tab
   *  refines this from the API response (`viewerCanManage`) once the list
   *  loads, so super admins (whose role isn't tracked client-side) still
   *  see the manage UI even when the parent passes `false`. */
  canManageHint?: boolean;
  /** Pre-fetched list and management flag from the parent. When provided,
   *  the tab skips its own initial fetch and renders immediately, so
   *  clicking the tab doesn't flash a spinner. `null` means the parent
   *  hasn't fetched yet (or returned no data) and the tab should fall
   *  back to its own fetch. Mutations re-fetch internally and notify
   *  back via `onListSynced` so the parent cache stays warm. */
  initialAnnouncements?: CommunityAnnouncement[] | null;
  initialCanManage?: boolean;
  /** Called after the tab successfully marks the community's announcements
   *  as seen for the viewer. The parent uses this to clear the tab badge
   *  (`hasUnseenAnnouncements`) without having to re-fetch the entire
   *  community detail payload. Fires on mount once the list resolves and
   *  again after every successful manager mutation, so a manager who just
   *  posted doesn't briefly see the badge for their own new post. */
  onMarkedSeen?: () => void;
  /** Called whenever the tab refreshes its list (after a mutation), so
   *  the parent can mirror the updated list into its prefetch cache and
   *  re-renders of this tab continue to paint instantly. */
  onListSynced?: (items: CommunityAnnouncement[], canManage: boolean) => void;
  /** Optional announcement id from the email CTA's `?announcement=<id>`
   *  query param. When present and the matching card is in the rendered
   *  list, the tab scrolls it into view and briefly highlights it so
   *  the recipient lands on the specific post they were emailed about
   *  rather than just the top of the list. */
  focusAnnouncementId?: string | null;
};

function formatPostedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffHrs < 48) return "Yesterday";
  // Past 48h: always include the date so old announcements have stable
  // wording. Year is appended once we cross a calendar year so a
  // years-old post doesn't look like it might be from this year.
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" });
}

/** True when the announcement has been meaningfully edited after the
 *  initial post. The DB sets `created_at` and `updated_at` from the same
 *  `NOW()` on insert, so a tiny clock-tick drift between the two is
 *  expected; only treat updates beyond a few seconds as a real edit. */
function wasEdited(createdIso: string, updatedIso: string): boolean {
  const created = new Date(createdIso).getTime();
  const updated = new Date(updatedIso).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  return updated - created > 5_000;
}

const MAX_TITLE_LEN = 200;
const MAX_BODY_LEN = 10000;

/** Best-effort first-letter for the avatar fallback. The author label is
 *  always either `@username` or a display name, so we strip the leading `@`
 *  before grabbing a character. Empty/odd inputs fall back to a neutral
 *  `?` glyph rather than rendering an empty circle. */
function authorInitial(name: string): string {
  const trimmed = name.replace(/^@/, "").trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/** Resolve the relative avatar path returned by the API (e.g.
 *  `/users/abc/avatar?v=123`) against the configured avatar base URL.
 *  Returns null untouched so the caller can render the initial fallback. */
function resolveAuthorAvatarSrc(authorAvatarUrl: string | null): string | undefined {
  if (!authorAvatarUrl) return undefined;
  return `${getAvatarBaseUrl()}${authorAvatarUrl}`;
}

export default function CommunityAnnouncementsTab({
  communityId,
  isAuthenticated,
  canManageHint = false,
  initialAnnouncements = null,
  initialCanManage = false,
  onMarkedSeen,
  onListSynced,
  focusAnnouncementId = null,
}: Props) {
  const toast = useToast();
  // When the parent has already prefetched the list, render with that
  // data immediately. `loading` only goes true if we have no seed and
  // need to fetch ourselves, so the common case (parent prefetch) paints
  // cards on first frame with no spinner flash.
  const seeded = initialAnnouncements !== null;
  const [loading, setLoading] = useState(!seeded);
  const [announcements, setAnnouncements] = useState<CommunityAnnouncement[]>(
    initialAnnouncements ?? [],
  );
  // The list endpoint is the source of truth for management permission so
  // super admins (whose role isn't tracked on the community detail client)
  // still see the manage UI. Prefer the parent's seeded value (already
  // computed from the API response), fall back to the cheap hint, then to
  // the API response itself once a list refresh resolves.
  const [canManage, setCanManage] = useState(
    seeded ? initialCanManage : canManageHint,
  );
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<CommunityAnnouncement | null>(null);
  const [composerTitle, setComposerTitle] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerPinned, setComposerPinned] = useState(false);
  // Notify-members toggle. Defaults to ON so the common case (post +
  // email members) is one click; managers who want a quiet update can
  // flip it off before posting. Not surfaced when editing (we don't
  // re-email on edit), so the flag isn't sent to the PATCH endpoint.
  const [composerNotify, setComposerNotify] = useState(true);
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  const [composerErrors, setComposerErrors] = useState<{ title?: string; body?: string }>({});
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuTarget, setMenuTarget] = useState<CommunityAnnouncement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommunityAnnouncement | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Track the latest list snapshot inside a ref so the post-fetch
  // mark-seen branch can decide whether there's anything worth stamping
  // without re-running on every render.
  const itemCountRef = useRef(0);
  itemCountRef.current = announcements.length;

  // Stable mark-seen helper. Used both on first list resolution and after
  // every successful manager mutation, so a manager who just posted
  // doesn't briefly see the badge re-appear for their own new post on the
  // next slug fetch. Logged-out viewers don't track seen state.
  const markSeen = useCallback(async () => {
    if (!isAuthenticated) return;
    if (itemCountRef.current === 0) return; // nothing to be seen of
    try {
      await apiFetch(`/communities/${communityId}/announcements/seen`, {
        auth: true,
        method: "POST",
      });
      onMarkedSeen?.();
    } catch { /* non-fatal, badge can lag a tick */ }
  }, [isAuthenticated, communityId, onMarkedSeen]);

  // Guard against firing the initial mark-seen more than once per mount
  // of this tab. Manager-mutation paths call markSeen() directly and don't
  // touch this guard; only the post-load auto-mark uses it.
  const initialMarkRef = useRef(false);

  // Email-deeplink highlight state. Tracks which card is currently being
  // emphasised so the styling can fade out cleanly after a few seconds
  // rather than staying lit forever.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focusAppliedRef = useRef(false);

  const fetchList = useCallback(async () => {
    try {
      const res = await apiFetch(`/communities/${communityId}/announcements`, { auth: isAuthenticated });
      if (!res.ok) {
        // Logged-out + private community: 403 expected; the parent page
        // will hide the tab entirely so we shouldn't even land here, but
        // bail gracefully if we somehow do.
        setAnnouncements([]);
        onListSynced?.([], false);
        return;
      }
      const data = (await res.json()) as {
        ok: boolean;
        announcements?: CommunityAnnouncement[];
        viewerCanManage?: boolean;
      };
      if (data.ok && Array.isArray(data.announcements)) {
        const nextCanManage = data.viewerCanManage === true;
        setAnnouncements(data.announcements);
        setCanManage(nextCanManage);
        onListSynced?.(data.announcements, nextCanManage);
      }
    } catch {
      /* noop, keep prior list rather than wiping the panel on a transient failure */
    } finally {
      setLoading(false);
    }
  }, [communityId, isAuthenticated, onListSynced]);

  // Initial fetch on mount / community change. Skipped when the parent
  // already prefetched a seed list, so opening the tab paints with cards
  // immediately. Resets the seen guard so navigating between communities
  // re-stamps the new community's row.
  useEffect(() => {
    initialMarkRef.current = false;
    if (seeded) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchList();
    // `seeded` is captured from the prop value at mount; subsequent
    // changes to it shouldn't retrigger this effect because mutations
    // already keep the list in sync via `onListSynced`. Tracking
    // fetchList covers the (rare) case where communityId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchList]);

  // Mark seen once per mount, after the list resolves. Subsequent
  // mutations call `markSeen()` directly so the badge stays clear without
  // refiring this effect.
  useEffect(() => {
    if (loading) return;
    if (initialMarkRef.current) return;
    initialMarkRef.current = true;
    void markSeen();
  }, [loading, markSeen]);

  // Email-deeplink: when ?announcement=<id> matches a card in the
  // current list, scroll it into view and light it with a transient
  // outline. Runs once per id once the list has loaded; the ref guard
  // prevents re-firing if the user switches tabs and comes back.
  useEffect(() => {
    if (loading) return;
    if (!focusAnnouncementId) return;
    if (focusAppliedRef.current) return;
    const match = announcements.find((a) => a.id === focusAnnouncementId);
    if (!match) return;
    focusAppliedRef.current = true;
    setHighlightId(focusAnnouncementId);
    // Defer the scroll one tick so the card has painted before we ask
    // the browser to bring it into view.
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`community-announcement-${focusAnnouncementId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    const fadeTimer = window.setTimeout(() => setHighlightId(null), 3200);
    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(fadeTimer);
    };
  }, [loading, focusAnnouncementId, announcements]);

  const openComposerForCreate = () => {
    setEditing(null);
    setComposerTitle("");
    setComposerBody("");
    setComposerPinned(false);
    // Defaults to true on create so the common case (post + notify) is
    // one click; managers can flip it off for a quiet update.
    setComposerNotify(true);
    setComposerErrors({});
    setComposerOpen(true);
  };

  const openComposerForEdit = (a: CommunityAnnouncement) => {
    setEditing(a);
    setComposerTitle(a.title);
    setComposerBody(a.body);
    setComposerPinned(a.isPinned);
    setComposerNotify(false);
    setComposerErrors({});
    setComposerOpen(true);
    setMenuAnchor(null);
    setMenuTarget(null);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditing(null);
    setComposerErrors({});
  };

  const handleSubmitComposer = async () => {
    const errs: { title?: string; body?: string } = {};
    const trimmedTitle = composerTitle.trim();
    if (!trimmedTitle) errs.title = "Add a title";
    else if (trimmedTitle.length > MAX_TITLE_LEN) errs.title = `Keep it under ${MAX_TITLE_LEN} characters`;
    const plainBody = composerBody.replace(/<[^>]*>/g, "").trim();
    if (!plainBody) errs.body = "Add a message";
    if (Object.keys(errs).length > 0) {
      setComposerErrors(errs);
      return;
    }
    setComposerErrors({});
    setComposerSubmitting(true);
    try {
      const path = editing
        ? `/communities/${communityId}/announcements/${editing.id}`
        : `/communities/${communityId}/announcements`;
      const res = await apiFetch(path, {
        auth: true,
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          body: composerBody.slice(0, MAX_BODY_LEN),
          is_pinned: composerPinned,
          // Only sent on create. Edits intentionally never re-email
          // members so a typo fix can't blast the inbox a second time.
          ...(editing ? {} : { notify_members: composerNotify }),
        }),
      });
      const data = await res.json() as {
        ok: boolean; message?: string; field?: string;
        notified?: boolean; notifyQueuedCount?: number;
      };
      if (data.ok) {
        if (editing) {
          toast.success("Announcement updated");
        } else if (data.notified && typeof data.notifyQueuedCount === "number" && data.notifyQueuedCount > 0) {
          toast.success(
            data.notifyQueuedCount === 1
              ? "Announcement posted (notifying 1 member)"
              : `Announcement posted (notifying ${data.notifyQueuedCount} members)`
          );
        } else {
          toast.success("Announcement posted");
        }
        closeComposer();
        await fetchList();
        // Manager just acted on the list; mark seen so the badge stays
        // clear for the post they themselves just made.
        await markSeen();
      } else if (data.field) {
        setComposerErrors({ [data.field]: data.message ?? "Something needs fixing" });
      } else {
        toast.error(data.message ?? "Something went wrong");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setComposerSubmitting(false);
    }
  };

  const handleTogglePin = async (a: CommunityAnnouncement) => {
    setMenuAnchor(null);
    setMenuTarget(null);
    try {
      const res = await apiFetch(`/communities/${communityId}/announcements/${a.id}`, {
        auth: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_pinned: !a.isPinned }),
      });
      const data = await res.json() as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success(a.isPinned ? "Unpinned" : "Pinned");
        await fetchList();
      } else {
        toast.error(data.message ?? "Couldn't update the pin");
      }
    } catch { toast.error("Something went wrong"); }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const res = await apiFetch(`/communities/${communityId}/announcements/${deleteTarget.id}`, {
        auth: true, method: "DELETE",
      });
      const data = await res.json() as { ok: boolean; message?: string };
      if (data.ok) {
        toast.success("Announcement deleted");
        setDeleteTarget(null);
        await fetchList();
      } else {
        toast.error(data.message ?? "Couldn't delete the announcement");
      }
    } catch { toast.error("Something went wrong"); }
    finally { setDeleteSubmitting(false); }
  };

  // Section header is suppressed when the list is empty: the empty-state
  // card already owns the heading + manager CTA, and showing a second
  // header above it duplicates copy and adds visual weight to a
  // "nothing here yet" state.
  const showSectionHeader = canManage && announcements.length > 0;

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }}>
      {showSectionHeader && (
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 0.25, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" }, fontWeight: 700, lineHeight: 1.3 }}
            >
              Announcements
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: "0.8125rem", mt: 0.125 }}>
              {announcements.length === 1 ? "1 announcement" : `${announcements.length} announcements`}
            </Typography>
          </Box>
          {/* Visible on every breakpoint: this is the only entry point to
              create an announcement, unlike the Plans tab which has other
              ways to start a plan from the rest of the app. */}
          <AppButton
            variant="text"
            size="small"
            startIcon={<AddCircleRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={openComposerForCreate}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              color: "primary.main",
              flexShrink: 0,
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>Post an announcement</Box>
            <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>Post</Box>
          </AppButton>
        </Stack>
      )}

      {loading && announcements.length === 0 ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : announcements.length === 0 ? (
        <AppCard>
          <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 }, px: { xs: 2, sm: 3 } }}>
            <Box
              sx={{
                width: 64, height: 64, borderRadius: "50%",
                bgcolor: "primary.light",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <CampaignRoundedIcon sx={{ fontSize: 32, color: "primary.main" }} />
            </Box>
            <Box sx={{ textAlign: "center", maxWidth: 420 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                No announcements yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {canManage
                  ? "Post a quick update for members and visitors."
                  : "Updates from the organizers will appear here."}
              </Typography>
            </Box>
            {canManage && (
              <AppButton
                variant="contained"
                startIcon={<AddCircleRoundedIcon />}
                onClick={openComposerForCreate}
                sx={{
                  textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3, mt: 1,
                  boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Post an announcement
              </AppButton>
            )}
          </Stack>
        </AppCard>
      ) : (
        <Stack spacing={{ xs: 1.5, sm: 2 }}>
          {announcements.map((a) => {
            const isHighlighted = highlightId === a.id;
            // Card sx is composed of three concerns:
            //   - pinned: subtle primary-tinted stripe + background
            //   - highlight: transient primary outline + slightly
            //     stronger tint when the email-deeplink lands here
            //   - default: nothing extra
            // The outline is declared on every card as `2px solid
            // transparent` so the highlight on/off transition animates
            // both the colour and the bg, instead of the outline
            // appearing/disappearing instantly. Pinned + highlight
            // compose: highlight wins on bg colour for the lit moment,
            // then bg fades back to the pinned tint.
            const pinnedBg = "rgba(230, 91, 19, 0.025)";
            const highlightBg = "rgba(230, 91, 19, 0.06)";
            const cardSx = {
              outline: "2px solid",
              outlineColor: isHighlighted ? "primary.main" : "transparent",
              outlineOffset: "2px",
              bgcolor: isHighlighted ? highlightBg : a.isPinned ? pinnedBg : undefined,
              transition: "outline-color 600ms ease-out, background-color 600ms ease-out",
              ...(a.isPinned
                ? {
                    position: "relative" as const,
                    borderColor: "rgba(230, 91, 19, 0.2)",
                    "&::before": {
                      content: '""',
                      position: "absolute" as const,
                      left: 0, top: 0, bottom: 0,
                      width: 3,
                      bgcolor: "primary.main",
                      borderTopLeftRadius: "inherit",
                      borderBottomLeftRadius: "inherit",
                    },
                  }
                : {}),
            };
            return (
            <AppCard
              key={a.id}
              id={`community-announcement-${a.id}`}
              sx={cardSx}
            >
              <Stack spacing={1.25}>
                <Stack direction="row" alignItems="flex-start" spacing={1.25}>
                  {/* Author avatar. Falls back to a neutral primary-tinted
                      circle with the author's initial when no avatar is
                      uploaded. Sized to align with the title row's
                      cap-height baseline, with a small top offset so it
                      visually hangs from the same horizontal line as the
                      pinned chip + title. */}
                  <Avatar
                    src={resolveAuthorAvatarSrc(a.authorAvatarUrl)}
                    alt=""
                    sx={{
                      width: 36,
                      height: 36,
                      mt: 0.25,
                      flexShrink: 0,
                      bgcolor: "primary.light",
                      color: "primary.dark",
                      fontWeight: 700,
                      fontSize: "0.9375rem",
                    }}
                  >
                    {authorInitial(a.authorName)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5, mb: 0.25 }}>
                      {a.isPinned && (
                        <Chip
                          icon={<PushPinRoundedIcon sx={{ fontSize: 13, transform: "rotate(45deg)" }} />}
                          label="Pinned"
                          size="small"
                          sx={{
                            height: 22, fontSize: "0.6875rem", fontWeight: 700,
                            bgcolor: "primary.light", color: "primary.dark",
                            "& .MuiChip-icon": { color: "primary.dark", ml: 0.5 },
                          }}
                        />
                      )}
                      <Typography
                        sx={{ fontSize: { xs: "1rem", sm: "1.0625rem" }, fontWeight: 700, lineHeight: 1.35, wordBreak: "break-word" }}
                      >
                        {a.title}
                      </Typography>
                    </Stack>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block", fontSize: "0.75rem", lineHeight: 1.5 }}
                    >
                      {a.authorName} &middot; {formatPostedAt(a.createdAt)}
                      {wasEdited(a.createdAt, a.updatedAt) && (
                        <Box
                          component="span"
                          sx={{ ml: 0.5, fontStyle: "italic", color: "text.disabled" }}
                        >
                          (edited)
                        </Box>
                      )}
                    </Typography>
                  </Box>
                  {canManage && (
                    <IconButton
                      size="small"
                      onClick={(e) => { setMenuAnchor(e.currentTarget); setMenuTarget(a); }}
                      aria-label="Announcement actions"
                      sx={{ mt: -0.5, mr: -0.5 }}
                    >
                      <MoreVertRoundedIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                {/* Sanitized HTML body. Same allow-list as community / plan
                    descriptions (sanitizeDescriptionHtml on the API). */}
                <Box
                  sx={{
                    fontSize: "0.9375rem",
                    lineHeight: 1.55,
                    color: "text.primary",
                    "& p": { m: 0, mb: 1 },
                    "& p:last-child": { mb: 0 },
                    "& ul, & ol": { pl: 3, mb: 1 },
                    "& a": { color: "primary.main", textDecorationColor: "rgba(0,0,0,0.2)" },
                    "& img": { maxWidth: "100%", borderRadius: 1.5 },
                    wordBreak: "break-word",
                  }}
                  dangerouslySetInnerHTML={{ __html: a.body }}
                />
              </Stack>
            </AppCard>
            );
          })}
        </Stack>
      )}

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => { setMenuAnchor(null); setMenuTarget(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: { sx: { minWidth: 180, borderRadius: 2.5, mt: 0.5 } },
        }}
      >
        <MenuItem onClick={() => menuTarget && handleTogglePin(menuTarget)}>
          <ListItemIcon>
            <PushPinRoundedIcon fontSize="small" sx={{ transform: "rotate(45deg)" }} />
          </ListItemIcon>
          <ListItemText>{menuTarget?.isPinned ? "Unpin" : "Pin to top"}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuTarget && openComposerForEdit(menuTarget)}>
          <ListItemIcon>
            <EditRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuTarget) setDeleteTarget(menuTarget);
            setMenuAnchor(null);
            setMenuTarget(null);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteOutlineRoundedIcon fontSize="small" sx={{ color: "error.main" }} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Composer dialog: shared between create and edit. */}
      <Dialog
        open={composerOpen}
        onClose={composerSubmitting ? undefined : closeComposer}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {editing ? "Edit announcement" : "Post an announcement"}
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2}>
            <AppTextField
              label="Title"
              value={composerTitle}
              onChange={(e) => setComposerTitle(e.target.value)}
              error={!!composerErrors.title}
              helperText={composerErrors.title ?? null}
              inputProps={{ maxLength: MAX_TITLE_LEN }}
              autoFocus
            />
            <Box>
              <RichTextEditor
                label="Message"
                value={composerBody}
                onChange={setComposerBody}
                placeholder="Share what's new with members and visitors."
                maxLength={MAX_BODY_LEN}
              />
              {composerErrors.body && (
                <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
                  {composerErrors.body}
                </Typography>
              )}
            </Box>
            {/* Pin / Notify-members toggles. Grouped in their own
                tighter sub-Stack so they cluster together as a single
                "post options" block under the editor; the parent Stack's
                wider spacing still separates the block from the title /
                editor above. Each row is a `<label>` so clicking the
                text also toggles the switch (standard form UX), with a
                subtle hover tint for affordance. Notify-members is only
                rendered on create, edits never re-email. */}
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              <Box
                component="label"
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1,
                  py: 0.5,
                  ml: -1,
                  borderRadius: 1.5,
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background-color 120ms ease-out",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Switch
                  checked={composerPinned}
                  onChange={(e) => setComposerPinned(e.target.checked)}
                  sx={{ flexShrink: 0 }}
                />
                <Typography variant="subtitle2" fontWeight={600}>
                  Pin to top
                </Typography>
              </Box>
              {!editing && (
                <Box
                  component="label"
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    ml: -1,
                    borderRadius: 1.5,
                    cursor: "pointer",
                    userSelect: "none",
                    transition: "background-color 120ms ease-out",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Switch
                    checked={composerNotify}
                    onChange={(e) => setComposerNotify(e.target.checked)}
                    sx={{ flexShrink: 0 }}
                  />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Notify members
                  </Typography>
                </Box>
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "flex-end",
            gap: 1,
            px: 3,
            pb: 2.5,
          }}
        >
          <AppButton
            variant="text"
            onClick={closeComposer}
            disabled={composerSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            onClick={handleSubmitComposer}
            disabled={composerSubmitting}
            startIcon={composerSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {composerSubmitting ? "Saving…" : editing ? "Save" : "Post"}
          </AppButton>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation. Soft-deletes server-side. */}
      <Dialog
        open={!!deleteTarget}
        onClose={deleteSubmitting ? undefined : () => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle>Delete announcement?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This removes the announcement from the community page. Members will no longer see it.
          </Typography>
        </DialogContent>
        <DialogActions
          sx={{
            display: "flex",
            flexDirection: { xs: "column-reverse", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "flex-end",
            gap: 1,
            px: 3,
            pb: 2.5,
          }}
        >
          <AppButton
            variant="text"
            onClick={() => setDeleteTarget(null)}
            disabled={deleteSubmitting}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            Cancel
          </AppButton>
          <AppButton
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={deleteSubmitting}
            startIcon={deleteSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {deleteSubmitting ? "Deleting…" : "Delete"}
          </AppButton>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
