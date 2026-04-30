"use client";

import * as React from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Stack,
  Snackbar,
  Alert,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import ThumbUpRoundedIcon from "@mui/icons-material/ThumbUpRounded";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";
import RouteRoundedIcon from "@mui/icons-material/RouteRounded";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getApiBaseUrl } from "@/lib/apiClient";
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
  is_anonymous: boolean;
  is_private: boolean;
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
  planned: "Planned",
  completed: "Completed",
  not_planned: "Not planned",
};

const STATUS_COLORS: Record<string, string> = {
  received: "#D4880F",
  needs_clarification: "#C67A12",
  in_progress: "#9C3587",
  planned: "#2E7D9B",
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
        fontSize: "0.75rem",
        height: 24,
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
      sx={{ fontWeight: 500, fontSize: "0.75rem", height: 24 }}
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
  const [submitAnonymous, setSubmitAnonymous] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState("");
  const [submitSuccess, setSubmitSuccess] = React.useState(false);
  const [submitFile, setSubmitFile] = React.useState<File | null>(null);
  const [submitFilePreview, setSubmitFilePreview] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const statusFilter = tab === 0 ? "active" : "completed";

  const fetchItems = React.useCallback(
    async (append = false) => {
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
      } catch {
        /* noop */
      }
      setLoading(false);
    },
    [statusFilter, sort, category, search, offset, isLoggedIn]
  );

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
    } catch {
      /* noop */
    }
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
            i.id === itemId
              ? { ...i, viewer_following: data.following, follower_count: data.follower_count }
              : i
          )
        );
      }
    } catch {
      /* noop */
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setSubmitError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitError("Attachment must be 5 MB or less.");
      return;
    }
    setSubmitError("");
    setSubmitFile(file);
    setSubmitFilePreview(URL.createObjectURL(file));
  };

  const clearFile = () => {
    if (submitFilePreview) URL.revokeObjectURL(submitFilePreview);
    setSubmitFile(null);
    setSubmitFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      let attachmentKey: string | null = null;

      if (submitFile) {
        const initRes = await apiFetch("/media/init", {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            purpose: "roadmap_attachment",
            contentType: submitFile.type,
            contentLength: submitFile.size,
          }),
        });
        const initData = await initRes.json();
        if (!initData.ok) {
          setSubmitError(initData.error ?? "Failed to start upload.");
          setSubmitting(false);
          return;
        }

        const uploadUrl = `${getApiBaseUrl()}${initData.uploadUrl}`;
        const upRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": submitFile.type },
          body: submitFile,
        });
        if (!upRes.ok) {
          setSubmitError("File upload failed. Please try again.");
          setSubmitting(false);
          return;
        }

        const finRes = await apiFetch("/media/finalize", {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ objectKey: initData.objectKey, purpose: "roadmap_attachment" }),
        });
        const finData = await finRes.json();
        if (!finData.ok) {
          setSubmitError(finData.error ?? "Failed to finalize upload.");
          setSubmitting(false);
          return;
        }
        attachmentKey = finData.objectKey;
      }

      const res = await apiFetch("/roadmap", {
        auth: true,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: submitTitle.trim(),
          body: submitBody.trim(),
          category: submitCategory,
          ...(attachmentKey ? { attachment_key: attachmentKey } : {}),
          ...(submitAnonymous ? { is_anonymous: true } : {}),
        }),
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
        setSubmitAnonymous(false);
        clearFile();
        fetchItems(false);
        setSubmitSuccess(true);
        if (typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
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
      {/* Hero header. Warm-wash treatment matching the rest of the
          logged-in surfaces (Explore, Your Plans, Communities, Your
          Chums, Profile) plus the public communities discovery page so
          the roadmap reads as part of the same product surface for both
          authed and unauthed visitors. Eyebrow + large H1 + subtitle on
          the left, submit/sign-in CTA on the right. */}
      <Paper
        variant="outlined"
        sx={{
          mb: { xs: 3, sm: 4 },
          p: { xs: 2.5, sm: 3.5 },
          borderRadius: 4,
          borderColor: "primary.light",
          background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
        }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 3 }}
          alignItems={{ xs: "stretch", sm: "flex-end" }}
          justifyContent="space-between"
        >
          <Stack spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <RouteRoundedIcon sx={{ color: "primary.contrastText", fontSize: 18 }} />
              </Box>
              <Typography
                sx={{
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "primary.dark",
                }}
              >
                What&apos;s next
              </Typography>
            </Stack>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.875rem", sm: "2.375rem" },
                fontWeight: 700,
                lineHeight: 1.15,
                letterSpacing: "-0.025em",
                color: "text.primary",
              }}
            >
              Community Roadmap
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{
                fontSize: { xs: "0.9375rem", sm: "1rem" },
                lineHeight: 1.6,
                maxWidth: 600,
              }}
            >
              NewChums launched in 2026 and is actively shaped by our community. Every idea, bug
              report, and suggestion helps us build the best gathering tool possible.
            </Typography>
          </Stack>
          {isLoggedIn ? (
            <Button
              variant="contained"
              color="primary"
              startIcon={submitOpen ? <CloseRoundedIcon /> : <AddRoundedIcon />}
              onClick={() => setSubmitOpen((v) => !v)}
              sx={{
                flexShrink: 0,
                alignSelf: { xs: "stretch", sm: "flex-end" },
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2.5,
                px: 3,
                py: 1.125,
                fontSize: "0.9375rem",
                boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
                "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
              }}
            >
              {submitOpen ? "Close form" : "Submit feedback"}
            </Button>
          ) : (
            <Button
              component={Link}
              href="/login?next=/roadmap"
              variant="contained"
              color="primary"
              sx={{
                flexShrink: 0,
                alignSelf: { xs: "stretch", sm: "flex-end" },
                textTransform: "none",
                fontWeight: 700,
                borderRadius: 2.5,
                px: 3,
                py: 1.125,
                fontSize: "0.9375rem",
                boxShadow: "0 4px 14px rgba(230, 91, 19, 0.25)",
                "&:hover": { boxShadow: "0 6px 18px rgba(230, 91, 19, 0.32)", opacity: 0.96 },
              }}
            >
              Sign in to submit feedback and vote
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Inline submit form */}
      <Collapse in={submitOpen} unmountOnExit>
        <Box
          sx={{
            mb: { xs: 3, sm: 4 },
            p: { xs: 2.5, sm: 3 },
            border: 1,
            borderColor: "divider",
            borderRadius: 3,
            bgcolor: "background.paper",
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h5" fontWeight={700}>
              Submit feedback
            </Typography>
            <IconButton
              size="small"
              onClick={() => setSubmitOpen(false)}
              sx={{ color: "text.secondary" }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
            Bug reports, feature requests, and suggestions are all welcome.
          </Typography>

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
            Category
          </Typography>
          <RadioGroup
            value={submitCategory}
            onChange={(e) => setSubmitCategory(e.target.value)}
            sx={{ mb: 2 }}
          >
            <FormControlLabel
              value="feature_request"
              control={<Radio size="small" />}
              label="Feature request"
            />
            <FormControlLabel value="bug" control={<Radio size="small" />} label="Bug / issue" />
            <FormControlLabel
              value="general_feedback"
              control={<Radio size="small" />}
              label="General feedback"
            />
          </RadioGroup>

          <AppTextField
            label="Title"
            value={submitTitle}
            onChange={(e) => setSubmitTitle(e.target.value)}
            placeholder="A short summary"
            fullWidth
            inputProps={{ maxLength: 200 }}
            sx={{ mb: 2 }}
          />
          <AppTextField
            label="Description (optional)"
            value={submitBody}
            onChange={(e) => setSubmitBody(e.target.value)}
            placeholder="The more detail the better!"
            fullWidth
            multiline
            minRows={3}
            maxRows={8}
            inputProps={{ maxLength: 5000 }}
            sx={{ mb: 1.5 }}
          />

          <Box sx={{ mb: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              Attach a screenshot (optional)
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
            {submitFile && submitFilePreview ? (
              <Box sx={{ position: "relative", display: "inline-block" }}>
                <Box
                  component="img"
                  src={submitFilePreview}
                  alt="Attachment preview"
                  sx={{
                    maxWidth: "100%",
                    maxHeight: 160,
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
                <IconButton
                  size="small"
                  onClick={clearFile}
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    bgcolor: "background.paper",
                    boxShadow: 1,
                    "&:hover": { bgcolor: "background.paper" },
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            ) : (
              <Button
                size="small"
                startIcon={<AttachFileRoundedIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ textTransform: "none" }}
              >
                Choose file
              </Button>
            )}
          </Box>

          <Stack spacing={0.5} sx={{ mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={submitFollow}
                  onChange={(e) => setSubmitFollow(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Follow this and receive email updates when addressed
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={submitAnonymous}
                  onChange={(e) => setSubmitAnonymous(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Post anonymously on the public roadmap
                </Typography>
              }
            />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
            Submissions are reviewed before they appear publicly.
          </Typography>

          {submitError && (
            <Typography variant="body2" color="error" sx={{ mb: 1.5 }}>
              {submitError}
            </Typography>
          )}

          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting || !submitTitle.trim()}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                boxShadow: "none",
                "&:hover": { boxShadow: "none", opacity: 0.92 },
              }}
            >
              {submitting ? <CircularProgress size={20} /> : "Submit"}
            </Button>
            <Button onClick={() => setSubmitOpen(false)} sx={{ textTransform: "none" }}>
              Cancel
            </Button>
          </Stack>
        </Box>
      </Collapse>

      {/* Tabs. Custom 3px primary indicator and elevated active state
          matching the styled tabs on Your Plans and the community detail
          page so the section navigation reads as a real navigation
          surface rather than a thin underline. */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          minHeight: 52,
          "& .MuiTabs-indicator": {
            height: 3,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
            backgroundColor: "primary.main",
          },
        }}
      >
        <Tab
          label="Active"
          sx={{
            textTransform: "none",
            minHeight: 52,
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "text.secondary",
            "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            transition: "color 0.15s ease, background-color 0.15s ease",
          }}
        />
        <Tab
          label="Completed"
          sx={{
            textTransform: "none",
            minHeight: 52,
            fontWeight: 600,
            fontSize: "0.9375rem",
            color: "text.secondary",
            "&.Mui-selected": { color: "primary.main", fontWeight: 700 },
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            transition: "color 0.15s ease, background-color 0.15s ease",
          }}
        />
      </Tabs>

      {/* Search */}
      <TextField
        placeholder="Search requests..."
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        inputProps={{ "aria-label": "Search roadmap requests" }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon sx={{ fontSize: 22, color: "text.secondary" }} />
            </InputAdornment>
          ),
          endAdornment: searchInput ? (
            <InputAdornment position="end">
              <ClearRoundedIcon
                role="button"
                tabIndex={0}
                aria-label="Clear search"
                sx={{
                  fontSize: 16,
                  color: "text.disabled",
                  cursor: "pointer",
                  "&:hover": { color: "text.secondary" },
                }}
                onClick={() => {
                  setSearchInput("");
                  setSearch("");
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSearchInput("");
                    setSearch("");
                  }
                }}
              />
            </InputAdornment>
          ) : null,
        }}
        sx={{
          mb: 2,
          maxWidth: { xs: "100%", sm: 360 },
          "& .MuiOutlinedInput-root": {
            borderRadius: 2.5,
            fontSize: "0.9375rem",
            bgcolor: "background.default",
            "& fieldset": { borderColor: "grey.200" },
            "&:hover fieldset": { borderColor: "grey.300" },
          },
          "& .MuiOutlinedInput-input": {
            py: { xs: 1.125, sm: 1.25 },
          },
        }}
        fullWidth
      />

      {/* Filters */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mb: 2.5, flexWrap: "wrap", gap: 1 }}
        alignItems="center"
      >
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
            size="medium"
            sx={{ fontWeight: 500, fontSize: "0.8125rem", minWidth: 56 }}
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
              size="medium"
              sx={{ fontWeight: 500, fontSize: "0.8125rem" }}
            />
            <Chip
              label="Newest"
              variant={sort === "newest" ? "filled" : "outlined"}
              color={sort === "newest" ? "primary" : "default"}
              onClick={() => setSort("newest")}
              size="medium"
              sx={{ fontWeight: 500, fontSize: "0.8125rem" }}
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
        <Paper
          variant="outlined"
          sx={{
            borderRadius: 3,
            borderColor: "grey.200",
            bgcolor: "background.paper",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <Stack spacing={2} alignItems="center" sx={{ py: { xs: 5, sm: 6 }, px: { xs: 2, sm: 3 } }}>
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                bgcolor: "primary.light",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LightbulbOutlinedIcon sx={{ fontSize: 36, color: "primary.main" }} />
            </Box>
            <Box sx={{ textAlign: "center", maxWidth: 420 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
                {search
                  ? "Nothing matched this search"
                  : tab === 0
                    ? "No active requests yet"
                    : "No completed items yet"}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {search
                  ? "Try a different keyword or clear the search to see all requests."
                  : tab === 0
                    ? "Be the first to share an idea, bug report, or piece of feedback."
                    : "Once we ship something, it'll show up here. Stay tuned!"}
              </Typography>
            </Box>
            {!search && tab === 0 && isLoggedIn && !submitOpen && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddRoundedIcon />}
                onClick={() => setSubmitOpen(true)}
                sx={{
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2.5,
                  px: 3,
                  mt: 1,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none", opacity: 0.92 },
                }}
              >
                Submit feedback
              </Button>
            )}
          </Stack>
        </Paper>
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
                    "&:hover": isLoggedIn
                      ? {
                          borderColor: "primary.main",
                          bgcolor: "primary.50",
                        }
                      : {},
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
                <Stack
                  direction="row"
                  spacing={0.75}
                  alignItems="center"
                  sx={{ mb: 0.5, flexWrap: "wrap" }}
                >
                  <CategoryChip category={item.category} />
                  <StatusBadge status={item.status} />
                  {item.is_private && (
                    <Tooltip title="Only you and the NewChums team can see this idea">
                      <Chip
                        label="Private"
                        size="small"
                        color="warning"
                        sx={{ fontWeight: 600, fontSize: "0.75rem", height: 24 }}
                      />
                    </Tooltip>
                  )}
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
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 0.75, lineHeight: 1.5 }}
                    noWrap
                  >
                    {item.body}
                  </Typography>
                )}
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {item.is_anonymous ? (
                    <Typography variant="caption" color="text.disabled">
                      @anonymous
                    </Typography>
                  ) : (
                    <Typography
                      component={Link}
                      href={`/u/${item.author_username}`}
                      variant="caption"
                      color="text.disabled"
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline", color: "primary.main" },
                      }}
                    >
                      @{item.author_username}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.disabled">
                    {timeAgo(item.created_at)}
                  </Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                    <Typography variant="caption" color="text.disabled">
                      {item.comment_count}
                    </Typography>
                  </Stack>
                  <Tooltip
                    title={
                      item.viewer_following
                        ? "You're following this -- click to unfollow"
                        : "Follow for email updates"
                    }
                    arrow
                  >
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
                        <NotificationsActiveRoundedIcon
                          sx={{ fontSize: 14, color: "primary.main" }}
                        />
                      ) : (
                        <NotificationsNoneRoundedIcon
                          sx={{ fontSize: 14, color: "text.disabled" }}
                        />
                      )}
                      <Typography
                        variant="caption"
                        color={item.viewer_following ? "primary.main" : "text.disabled"}
                      >
                        {item.follower_count}
                      </Typography>
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

      <Snackbar
        open={submitSuccess}
        autoHideDuration={6000}
        onClose={() => setSubmitSuccess(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSubmitSuccess(false)}
          severity="success"
          variant="filled"
          sx={{ width: "100%" }}
        >
          Thanks! Your feedback was received and will appear publicly once reviewed.
        </Alert>
      </Snackbar>

      {loading && items.length > 0 && (
        <Box sx={{ textAlign: "center", mt: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
}
