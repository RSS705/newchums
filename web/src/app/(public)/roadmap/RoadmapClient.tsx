"use client";

import * as React from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import ThumbUpRoundedIcon from "@mui/icons-material/ThumbUpRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiClient";
import AppTextField from "@/components/ui/AppTextField";

type RoadmapItem = {
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

const CATEGORY_LABELS: Record<string, string> = {
  feature_request: "Feature request",
  bug: "Bug / issue",
  general_feedback: "General feedback",
};

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

function StatusBadge({ status }: { status: string }) {
  return (
    <Chip
      label={STATUS_LABELS[status] ?? status}
      size="small"
      sx={{
        fontWeight: 600,
        fontSize: "0.6875rem",
        height: 22,
        bgcolor: STATUS_COLORS[status] ?? "grey.400",
        color: status === "not_planned" ? "text.secondary" : "#fff",
      }}
    />
  );
}

function CategoryChip({ category }: { category: string }) {
  return (
    <Chip
      label={CATEGORY_LABELS[category] ?? category}
      size="small"
      variant="outlined"
      sx={{ fontWeight: 500, fontSize: "0.6875rem", height: 22 }}
    />
  );
}

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

type Props = { isLoggedIn: boolean };

export default function RoadmapClient({ isLoggedIn }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState<RoadmapItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState(0);
  const [category, setCategory] = React.useState("");
  const [sort, setSort] = React.useState("votes");
  const [offset, setOffset] = React.useState(0);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(value.trim());
    }, 350);
  };

  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [submitCategory, setSubmitCategory] = React.useState("feature_request");
  const [submitTitle, setSubmitTitle] = React.useState("");
  const [submitBody, setSubmitBody] = React.useState("");
  const [submitFollow, setSubmitFollow] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");

  const statusFilter = tab === 0 ? "active" : "completed";

  const fetchItems = React.useCallback(async (append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        sort,
        limit: "20",
        offset: append ? String(offset) : "0",
      });
      if (category) params.set("category", category);
      if (search) params.set("search", search);

      const res = await (isLoggedIn
        ? apiFetch(`/roadmap?${params}`, { auth: true })
        : fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/roadmap?${params}`));

      const data = await res.json();
      if (data.ok) {
        if (append) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotal(data.total);
        if (!append) setOffset(data.items.length);
        else setOffset((prev) => prev + data.items.length);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [statusFilter, sort, category, search, offset, isLoggedIn]);

  React.useEffect(() => {
    setOffset(0);
    fetchItems(false);
  }, [tab, category, sort, search]);

  const handleVote = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isLoggedIn) return;
    try {
      const res = await apiFetch(`/roadmap/${itemId}/vote`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, viewer_voted: data.voted, vote_count: data.vote_count } : i
          )
        );
      }
    } catch { /* noop */ }
  };

  const handleFollow = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isLoggedIn) return;
    try {
      const res = await apiFetch(`/roadmap/${itemId}/follow`, { auth: true, method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId ? { ...i, viewer_following: data.following, follower_count: data.follower_count } : i
          )
        );
      }
    } catch { /* noop */ }
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await apiFetch("/roadmap", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: submitTitle.trim(), body: submitBody.trim(), category: submitCategory }),
      });
      const data = await res.json();
      if (data.ok) {
        if (!submitFollow && data.id) {
          apiFetch(`/roadmap/${data.id}/follow`, { auth: true, method: "POST" }).catch(() => {});
        }
        setSubmitOpen(false);
        setSubmitTitle("");
        setSubmitBody("");
        setSubmitCategory("feature_request");
        setSubmitFollow(true);
        fetchItems(false);
      } else {
        setSubmitError(data.message || "Something went wrong. Please try again.");
      }
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <Box>
      {/* Hero header */}
      <Box sx={{ mb: { xs: 3, sm: 4 }, textAlign: { xs: "left", sm: "center" } }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Community Roadmap
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 600, mx: "auto", lineHeight: 1.7, mb: 2.5 }}
        >
          NewChums launched in 2026 and is actively shaped by our community. Every idea, bug report,
          and suggestion helps us build the best gathering tool possible.
        </Typography>
        {isLoggedIn ? (
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddRoundedIcon />}
            onClick={() => setSubmitOpen(true)}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
          >
            Submit an idea
          </Button>
        ) : (
          <Button
            component={Link}
            href="/login"
            variant="contained"
            color="primary"
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
          >
            Sign in to submit ideas and vote
          </Button>
        )}
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Active" sx={{ textTransform: "none", fontWeight: 600 }} />
          <Tab label="Completed" sx={{ textTransform: "none", fontWeight: 600 }} />
        </Tabs>
      </Box>

      {/* Search */}
      <TextField
        size="small"
        placeholder="Search requests..."
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon sx={{ fontSize: 18, color: "text.disabled" }} />
            </InputAdornment>
          ),
          endAdornment: searchInput ? (
            <InputAdornment position="end">
              <ClearRoundedIcon
                sx={{ fontSize: 16, color: "text.disabled", cursor: "pointer", "&:hover": { color: "text.secondary" } }}
                onClick={() => { setSearchInput(""); setSearch(""); }}
              />
            </InputAdornment>
          ) : null,
        }}
        sx={{ mb: 2, maxWidth: { xs: "100%", sm: 320 } }}
        fullWidth
      />

      {/* Filters */}
      <Stack direction="row" spacing={1} sx={{ mb: 2.5, flexWrap: "wrap", gap: 1 }} alignItems="center">
        {[
          { value: "", label: "All" },
          { value: "feature_request", label: "Features" },
          { value: "bug", label: "Bugs" },
          { value: "general_feedback", label: "General" },
        ].map((opt) => (
          <Chip
            key={opt.value}
            label={opt.label}
            variant={category === opt.value ? "filled" : "outlined"}
            color={category === opt.value ? "primary" : "default"}
            onClick={() => setCategory(opt.value)}
            size="small"
            sx={{ fontWeight: 500 }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        {tab === 0 && (
          <Stack direction="row" spacing={0.5}>
            <Chip
              label="Most voted"
              variant={sort === "votes" ? "filled" : "outlined"}
              color={sort === "votes" ? "primary" : "default"}
              onClick={() => setSort("votes")}
              size="small"
              sx={{ fontWeight: 500 }}
            />
            <Chip
              label="Newest"
              variant={sort === "newest" ? "filled" : "outlined"}
              color={sort === "newest" ? "primary" : "default"}
              onClick={() => setSort("newest")}
              size="small"
              sx={{ fontWeight: 500 }}
            />
          </Stack>
        )}
      </Stack>

      {/* Item list */}
      {loading && items.length === 0 ? (
        <Stack spacing={2}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 2 }} />
          ))}
        </Stack>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6, color: "text.secondary" }}>
          <Typography variant="body1">
            {search
              ? "No requests match your search."
              : tab === 0
                ? "No active requests yet. Be the first to share an idea!"
                : "No completed items yet. Stay tuned!"}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {items.map((item) => (
            <Box
              key={item.id}
              onClick={() => router.push(`/roadmap/${item.id}`)}
              sx={{
                p: 2,
                border: 1,
                borderColor: "divider",
                borderRadius: 2.5,
                bgcolor: "background.paper",
                cursor: "pointer",
                transition: "border-color 0.15s",
                "&:hover": { borderColor: "primary.light" },
                display: "flex",
                gap: 2,
                alignItems: "flex-start",
              }}
            >
              {/* Vote button */}
              <Tooltip title={item.viewer_voted ? "Remove your vote" : "I want this"} arrow>
                <Box
                  onClick={(e) => handleVote(e, item.id)}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minWidth: 48,
                    pt: 0.5,
                    px: 0.5,
                    pb: 0.5,
                    borderRadius: 2,
                    border: 1,
                    borderColor: item.viewer_voted ? "primary.main" : "divider",
                    bgcolor: item.viewer_voted ? "primary.50" : "transparent",
                    color: item.viewer_voted ? "primary.main" : "text.secondary",
                    transition: "all 0.15s",
                    cursor: isLoggedIn ? "pointer" : "default",
                    "&:hover": isLoggedIn ? {
                      borderColor: "primary.main",
                      bgcolor: "primary.50",
                    } : {},
                  }}
                >
                  {item.viewer_voted ? (
                    <ThumbUpRoundedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <ThumbUpOutlinedIcon sx={{ fontSize: 18 }} />
                  )}
                  <Typography variant="caption" fontWeight={700} sx={{ mt: 0.25, lineHeight: 1 }}>
                    {item.vote_count}
                  </Typography>
                </Box>
              </Tooltip>

              {/* Content */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5, flexWrap: "wrap" }}>
                  <CategoryChip category={item.category} />
                  <StatusBadge status={item.status} />
                </Stack>
                <Typography
                  variant="subtitle1"
                  fontWeight={600}
                  sx={{
                    color: "text.primary",
                    mb: 0.5,
                  }}
                >
                  {item.title}
                </Typography>
                {item.body && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75, lineHeight: 1.5 }} noWrap>
                    {item.body}
                  </Typography>
                )}
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Typography
                    component={Link}
                    href={`/u/${item.author_username}`}
                    variant="caption"
                    color="text.disabled"
                    onClick={(e) => e.stopPropagation()}
                    sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", color: "primary.main" } }}
                  >
                    @{item.author_username}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {timeAgo(item.created_at)}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="caption" color="text.disabled">{item.comment_count}</Typography>
                  </Stack>
                  <Tooltip title={item.viewer_following ? "You\u2019re following this \u2014 click to unfollow" : "Follow for email updates"} arrow>
                    <Stack
                      direction="row"
                      spacing={0.5}
                      alignItems="center"
                      onClick={(e) => handleFollow(e, item.id)}
                      sx={{
                        cursor: isLoggedIn ? "pointer" : "default",
                        borderRadius: 1,
                        px: 0.5,
                        py: 0.25,
                        transition: "background 0.15s",
                        "&:hover": isLoggedIn ? { bgcolor: "action.hover" } : {},
                      }}
                    >
                      {item.viewer_following ? (
                        <NotificationsActiveRoundedIcon sx={{ fontSize: 14, color: "primary.main" }} />
                      ) : (
                        <NotificationsNoneRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                      )}
                      <Typography variant="caption" color={item.viewer_following ? "primary.main" : "text.disabled"}>{item.follower_count}</Typography>
                    </Stack>
                  </Tooltip>
                </Stack>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {/* Load more */}
      {!loading && items.length < total && (
        <Box sx={{ textAlign: "center", mt: 3 }}>
          <Button
            variant="outlined"
            onClick={() => fetchItems(true)}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2 }}
          >
            Load more
          </Button>
        </Box>
      )}

      {loading && items.length > 0 && (
        <Box sx={{ textAlign: "center", mt: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}

      {/* Submit dialog */}
      <Dialog
        open={submitOpen}
        onClose={() => setSubmitOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>Submit an idea</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Even small suggestions are welcome, every idea helps us improve NewChums.
          </Typography>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Category
          </Typography>
          <RadioGroup
            value={submitCategory}
            onChange={(e) => setSubmitCategory(e.target.value)}
            sx={{ mb: 2 }}
          >
            <FormControlLabel value="feature_request" control={<Radio size="small" />} label="Feature request" />
            <FormControlLabel value="bug" control={<Radio size="small" />} label="Bug / issue" />
            <FormControlLabel value="general_feedback" control={<Radio size="small" />} label="General feedback" />
          </RadioGroup>

          <AppTextField
            label="Title"
            value={submitTitle}
            onChange={(e) => setSubmitTitle(e.target.value)}
            placeholder="A short summary of your idea"
            fullWidth
            inputProps={{ maxLength: 200 }}
            sx={{ mb: 2 }}
          />
          <AppTextField
            label="Description (optional)"
            value={submitBody}
            onChange={(e) => setSubmitBody(e.target.value)}
            placeholder="Add more detail if you'd like"
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            inputProps={{ maxLength: 5000 }}
            sx={{ mb: 1.5 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={submitFollow}
                onChange={(e) => setSubmitFollow(e.target.checked)}
                size="small"
              />
            }
            label={
              <Typography variant="body2" color="text.secondary">
                Follow this idea and receive email updates when addressed
              </Typography>
            }
          />
          {submitError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {submitError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setSubmitOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || !submitTitle.trim()}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
          >
            {submitting ? <CircularProgress size={20} /> : "Submit"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
