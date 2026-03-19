"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ThumbUpRoundedIcon from "@mui/icons-material/ThumbUpRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import MergeRoundedIcon from "@mui/icons-material/MergeRounded";
import Link from "next/link";
import { apiFetch } from "@/lib/apiClient";
import AppTextField from "@/components/ui/AppTextField";

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  needs_clarification: "Needs clarification",
  in_progress: "In progress",
  completed: "Completed",
  not_planned: "Not planned",
};

const STATUS_COLORS: Record<string, string> = {
  received: "#D4880F",
  needs_clarification: "#C67A12",
  in_progress: "#9C3587",
  completed: "#0E8A6D",
  not_planned: "text.disabled",
};

const CATEGORY_LABELS: Record<string, string> = {
  feature_request: "Feature request",
  bug: "Bug / issue",
  general_feedback: "General feedback",
};

type ItemDetail = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  status: string;
  vote_count: number;
  comment_count: number;
  follower_count: number;
  completed_at: string | null;
  created_at: string;
  author_username: string;
  viewer_voted: boolean;
  viewer_following: boolean;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_username: string;
};

type AdminNote = {
  id: string;
  body: string;
  status_before: string | null;
  status_after: string | null;
  created_at: string;
  admin_username: string;
};

type MergedInto = { id: string; title: string } | null;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type Props = { itemId: string; isLoggedIn: boolean };

export default function RoadmapItemClient({ itemId, isLoggedIn }: Props) {
  const [item, setItem] = React.useState<ItemDetail | null>(null);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [adminNotes, setAdminNotes] = React.useState<AdminNote[]>([]);
  const [mergedInto, setMergedInto] = React.useState<MergedInto>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const [commentBody, setCommentBody] = React.useState("");
  const [submittingComment, setSubmittingComment] = React.useState(false);
  const [commentError, setCommentError] = React.useState("");

  const fetchItem = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = isLoggedIn
        ? await apiFetch(`/roadmap/${itemId}`, { auth: true })
        : await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/roadmap/${itemId}`);
      const data = await res.json();
      if (data.ok) {
        setItem(data.item);
        setComments(data.comments);
        setAdminNotes(data.admin_notes);
        setMergedInto(data.merged_into);
      } else {
        setError("This roadmap item could not be found.");
      }
    } catch {
      setError("Something went wrong loading this item.");
    }
    setLoading(false);
  }, [itemId, isLoggedIn]);

  React.useEffect(() => { fetchItem(); }, [fetchItem]);

  const handleVote = async () => {
    if (!isLoggedIn || !item) return;
    try {
      const res = await apiFetch(`/roadmap/${itemId}/vote`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setItem((prev) => prev ? { ...prev, viewer_voted: data.voted, vote_count: data.vote_count } : prev);
      }
    } catch { /* noop */ }
  };

  const handleFollow = async () => {
    if (!isLoggedIn || !item) return;
    try {
      const res = await apiFetch(`/roadmap/${itemId}/follow`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setItem((prev) => prev ? { ...prev, viewer_following: data.following, follower_count: data.follower_count } : prev);
      }
    } catch { /* noop */ }
  };

  const handleComment = async () => {
    if (!commentBody.trim()) return;
    setCommentError("");
    setSubmittingComment(true);
    try {
      const res = await apiFetch(`/roadmap/${itemId}/comment`, {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setComments((prev) => [...prev, data.comment]);
        setCommentBody("");
        setItem((prev) => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
      } else {
        setCommentError(data.message || "Could not post comment.");
      }
    } catch {
      setCommentError("Something went wrong. Please try again.");
    }
    setSubmittingComment(false);
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={28} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="70%" height={36} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={120} sx={{ borderRadius: 2, mb: 2 }} />
        <Skeleton variant="rounded" height={200} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  if (error || !item) {
    return (
      <Box>
        <Alert severity="warning">{error || "Item not found."}</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Merged banner */}
      {mergedInto && (
        <Alert
          severity="info"
          icon={<MergeRoundedIcon />}
          sx={{ mb: 2, borderRadius: 2 }}
        >
          This request was merged into{" "}
          <Typography
            component={Link}
            href={`/roadmap/${mergedInto.id}`}
            fontWeight={600}
            sx={{ textDecoration: "underline" }}
          >
            {mergedInto.title}
          </Typography>
        </Alert>
      )}

      {/* Item header */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          label={CATEGORY_LABELS[item.category] ?? item.category}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500, fontSize: "0.6875rem" }}
        />
        <Chip
          label={STATUS_LABELS[item.status] ?? item.status}
          size="small"
          sx={{
            fontWeight: 600,
            fontSize: "0.6875rem",
            bgcolor: STATUS_COLORS[item.status] ?? "grey.400",
            color: item.status === "not_planned" ? "text.secondary" : "#fff",
          }}
        />
      </Stack>

      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
        {item.title}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Submitted by{" "}
        <Typography
          component={Link}
          href={`/u/${item.author_username}`}
          variant="body2"
          sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", color: "primary.main" } }}
        >
          @{item.author_username}
        </Typography>
        {" "}&middot; {formatDate(item.created_at)}
      </Typography>

      {item.body && (
        <Typography variant="body1" sx={{ mb: 3, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {item.body}
        </Typography>
      )}

      {/* Actions */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        <Tooltip title={item.viewer_voted ? "Remove your vote" : "Vote if you want this"} arrow>
          <Button
            variant={item.viewer_voted ? "contained" : "outlined"}
            size="small"
            startIcon={item.viewer_voted ? <ThumbUpRoundedIcon /> : <ThumbUpOutlinedIcon />}
            onClick={handleVote}
            disabled={!isLoggedIn}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: "none",
              "&:hover": { boxShadow: "none", opacity: 0.92 },
            }}
          >
            {item.viewer_voted ? "Voted" : "I want this"} &middot; {item.vote_count}
          </Button>
        </Tooltip>
        <Tooltip title={item.viewer_following ? "You\u2019ll receive email updates \u2014 click to unfollow" : "Get email updates when this is addressed"} arrow>
          <Button
            variant={item.viewer_following ? "contained" : "outlined"}
            size="small"
            color={item.viewer_following ? "secondary" : "inherit"}
            startIcon={item.viewer_following ? <NotificationsActiveRoundedIcon /> : <NotificationsNoneRoundedIcon />}
            onClick={handleFollow}
            disabled={!isLoggedIn}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: "none",
              "&:hover": { boxShadow: "none", opacity: 0.92 },
            }}
          >
            {item.viewer_following ? "Following" : "Follow for updates"} &middot; {item.follower_count}
          </Button>
        </Tooltip>
      </Stack>

      <Divider sx={{ mb: 3 }} />

      {/* Admin notes / status timeline */}
      {adminNotes.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
            Developer Updates
          </Typography>
          <Stack spacing={1.5}>
            {adminNotes.map((note) => (
              <Box
                key={note.id}
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 2,
                  bgcolor: "action.hover",
                }}
              >
                {note.status_after && (
                  <Box sx={{ mb: 0.5 }}>
                    <Chip
                      label={STATUS_LABELS[note.status_after] ?? note.status_after}
                      size="small"
                      sx={{
                        fontWeight: 600,
                        fontSize: "0.625rem",
                        height: 20,
                        bgcolor: STATUS_COLORS[note.status_after] ?? "grey.400",
                        color: note.status_after === "not_planned" ? "text.secondary" : "#fff",
                      }}
                    />
                  </Box>
                )}
                <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                  {note.body}
                </Typography>
                <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75, display: "block" }}>
                  <Typography
                    component={Link}
                    href={`/u/${note.admin_username}`}
                    variant="caption"
                    sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", color: "primary.main" } }}
                  >
                    @{note.admin_username}
                  </Typography>
                  {" "}&middot; {formatDate(note.created_at)}
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* Comments */}
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        Comments ({item.comment_count})
      </Typography>

      {comments.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No comments yet. {isLoggedIn ? "Be the first to share your thoughts!" : "Sign in to join the discussion."}
        </Typography>
      )}

      <Stack spacing={1.5} sx={{ mb: 3 }}>
        {comments.map((comment) => (
          <Box
            key={comment.id}
            sx={{
              p: 2,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {comment.body}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.75, display: "block" }}>
              <Typography
                component={Link}
                href={`/u/${comment.author_username}`}
                variant="caption"
                sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", color: "primary.main" } }}
              >
                @{comment.author_username}
              </Typography>
              {" "}&middot; {timeAgo(comment.created_at)}
            </Typography>
          </Box>
        ))}
      </Stack>

      {/* Add comment */}
      {isLoggedIn && (
        <Box>
          <AppTextField
            label="Add a comment"
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Share your thoughts..."
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            inputProps={{ maxLength: 2000 }}
            sx={{ mb: 1.5 }}
          />
          {commentError && (
            <Typography variant="body2" color="error" sx={{ mb: 1 }}>
              {commentError}
            </Typography>
          )}
          <Button
            variant="contained"
            onClick={handleComment}
            disabled={submittingComment || !commentBody.trim()}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              px: 3,
              py: 1,
              boxShadow: "none",
              "&:hover": { boxShadow: "none", opacity: 0.92 },
            }}
          >
            {submittingComment ? <CircularProgress size={20} /> : "Post comment"}
          </Button>
        </Box>
      )}
    </Box>
  );
}
