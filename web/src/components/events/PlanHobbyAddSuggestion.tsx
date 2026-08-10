"use client";

import { useEffect, useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { apiFetch } from "@/lib/apiClient";

export type PlanHobby = { name: string; slug: string };

type ViewerInterest = { slug: string; name: string; category?: string | null };

type Props = {
  /** Hobbies attached to the plan. Slugs are matched against the viewer's
   *  profile to figure out which (if any) are missing. */
  planHobbies: PlanHobby[];
};

/** Compact footer row for the post-plan card: one caption plus a small
 *  add-chip per plan hobby the viewer doesn't already follow. Clicking a
 *  chip adds that single hobby to the viewer's profile (which is what
 *  drives "plans near you" notifications for that tag); the chip flips to
 *  a check in place so the row never reflows. One chip per hobby rather
 *  than one button for all of them, so a three-tag plan reads as three
 *  small choices instead of one vague bulk action.
 *
 *  Self-contained: fetches the viewer's interests on mount and renders
 *  nothing while loading or when the viewer already follows every plan
 *  hobby, so the parent card collapses cleanly in those cases.
 */
export default function PlanHobbyAddSuggestion({ planHobbies }: Props) {
  const [viewerInterests, setViewerInterests] = useState<ViewerInterest[] | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [addedSlugs, setAddedSlugs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Normalised list of plan hobbies the viewer might want to adopt: drop
  // entries with empty slugs (legacy fallback objects from old plans) and
  // dedupe by slug just in case.
  const candidateHobbies = useMemo(() => {
    const seen = new Set<string>();
    const out: PlanHobby[] = [];
    for (const h of planHobbies ?? []) {
      const slug = (h?.slug ?? "").trim().toLowerCase();
      const name = (h?.name ?? "").trim();
      if (!slug || !name) continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, name });
    }
    return out;
  }, [planHobbies]);

  useEffect(() => {
    let cancelled = false;
    if (candidateHobbies.length === 0) {
      if (!cancelled) setViewerInterests([]);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const res = await apiFetch("/profile", { auth: true });
        if (!res.ok) {
          if (!cancelled) setViewerInterests([]);
          return;
        }
        const data = (await res.json()) as {
          ok?: boolean;
          profile?: { interest_items?: ViewerInterest[]; interest_slugs?: string[] };
        };
        if (cancelled) return;
        const items = data.profile?.interest_items
          ?? (data.profile?.interest_slugs ?? []).map((s) => ({ slug: s, name: s }));
        setViewerInterests(items);
      } catch {
        if (!cancelled) setViewerInterests([]);
      }
    })();
    return () => { cancelled = true; };
  }, [candidateHobbies.length]);

  const viewerSlugSet = useMemo(
    () => new Set((viewerInterests ?? []).map((i) => i.slug.trim().toLowerCase())),
    [viewerInterests],
  );

  // Chips added this session stay visible (flipped to a check) so the row
  // never reflows under the user; only hobbies the viewer already followed
  // before opening the page are hidden.
  const visibleHobbies = useMemo(
    () => candidateHobbies.filter((h) => !viewerSlugSet.has(h.slug) || addedSlugs.has(h.slug)),
    [candidateHobbies, viewerSlugSet, addedSlugs],
  );

  // Wait for the viewer-interests fetch before deciding anything. Without
  // this gate the chips would briefly render and then vanish for users who
  // already follow every hobby.
  if (viewerInterests === null) return null;
  if (visibleHobbies.length === 0) return null;

  const allAdded = visibleHobbies.every((h) => addedSlugs.has(h.slug));

  const handleAdd = async (hobby: PlanHobby) => {
    if (addingSlug !== null || addedSlugs.has(hobby.slug) || viewerInterests === null) return;
    setAddingSlug(hobby.slug);
    setError(null);
    // Merge the one hobby into the viewer's existing list. The PUT /profile
    // endpoint replaces user_interests with whatever we send, so we need to
    // include both the existing slugs and the new one.
    const mergedItems = [
      ...viewerInterests.map((i) => ({ slug: i.slug, name: i.name })),
      { slug: hobby.slug, name: hobby.name },
    ];
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          interest_slugs: mergedItems.map((i) => i.slug),
          interest_items: mergedItems,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Couldn't add right now. Please try again.");
        return;
      }
      setViewerInterests(mergedItems);
      setAddedSlugs((prev) => new Set(prev).add(hobby.slug));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("nc:profile-changed"));
      }
    } catch {
      setError("Couldn't add right now. Please try again.");
    } finally {
      setAddingSlug(null);
    }
  };

  return (
    <Stack direction="row" alignItems="center" flexWrap="wrap" useFlexGap spacing={0.75}>
      <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.75rem" }}>
        {allAdded
          ? "Added to your profile:"
          : "Add to your profile to hear about nearby plans:"}
      </Typography>
      {visibleHobbies.map((h) => {
        const isAdded = addedSlugs.has(h.slug);
        const isAdding = addingSlug === h.slug;
        return (
          <Tooltip
            key={h.slug}
            arrow
            title={isAdded
              ? `You'll hear about public plans near you tagged ${h.name}.`
              : `Adds ${h.name} to your profile hobbies. You'll hear about public plans near you with this tag.`}
          >
            <Chip
              size="small"
              label={h.name}
              onClick={isAdded || isAdding ? undefined : () => { void handleAdd(h); }}
              aria-label={isAdded ? `${h.name} added to your profile` : `Add ${h.name} to your profile`}
              icon={isAdded ? (
                <CheckRoundedIcon sx={{ fontSize: "0.9rem !important" }} />
              ) : isAdding ? (
                <CircularProgress size={12} thickness={6} sx={{ mx: 0.25, color: "inherit" }} />
              ) : (
                <AddRoundedIcon sx={{ fontSize: "0.9rem !important" }} />
              )}
              sx={{
                height: 24,
                fontSize: "0.75rem",
                fontWeight: 600,
                borderRadius: 2,
                border: "1px solid",
                ...(isAdded
                  ? {
                      bgcolor: "#f0fdf4",
                      color: "success.dark",
                      borderColor: "success.light",
                      "& .MuiChip-icon": { color: "success.dark" },
                    }
                  : {
                      bgcolor: "background.default",
                      color: "text.secondary",
                      borderColor: "divider",
                      cursor: "pointer",
                      "& .MuiChip-icon": { color: "inherit" },
                      "&:hover": {
                        bgcolor: "primary.light",
                        color: "primary.dark",
                        borderColor: "primary.light",
                      },
                    }),
              }}
            />
          </Tooltip>
        );
      })}
      {error && (
        <Typography variant="caption" sx={{ color: "error.main", fontSize: "0.75rem" }}>
          {error}
        </Typography>
      )}
    </Stack>
  );
}
