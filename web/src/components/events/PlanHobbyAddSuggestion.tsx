"use client";

import { useEffect, useMemo, useState } from "react";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
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

/** Lightweight, contextual "add this plan's hobby to my profile" chip.
 *
 *  Designed to sit inline within the plan header's hobby/badge row, right
 *  next to the actual hobby chips it relates to. Renders nothing unless the
 *  plan has at least one hobby the viewer doesn't already have, so it stays
 *  out of the way for users who already follow these interests.
 *
 *  Visually mirrors the other small outlined chips in the metadata row
 *  (variant="outlined", size="small") so it reads as a piece of contextual
 *  product guidance, not a second CTA block.
 */
export default function PlanHobbyAddSuggestion({ planHobbies }: Props) {
  const [viewerInterests, setViewerInterests] = useState<ViewerInterest[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
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

  // Fetch the viewer's interests once on mount so we can decide whether
  // to render at all. We render `null` while loading to avoid flashing in
  // and then disappearing when the user already has every plan hobby.
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

  const missingHobbies = useMemo(
    () => candidateHobbies.filter((h) => !viewerSlugSet.has(h.slug)),
    [candidateHobbies, viewerSlugSet],
  );

  // Wait for the viewer-interests fetch before deciding anything. Without
  // this gate the chip would briefly render and then vanish for users who
  // already follow the hobby.
  if (viewerInterests === null) return null;
  if (missingHobbies.length === 0 && !added) return null;

  const isPlural = missingHobbies.length > 1;
  // Use the actual hobby name in the singular case so the suggestion reads
  // as a concrete recommendation tied to *this* plan rather than a generic
  // settings nudge.
  const singularHobbyName = !isPlural && missingHobbies[0] ? missingHobbies[0].name : null;

  const label = added
    ? isPlural
      ? "Hobbies added"
      : `${singularHobbyName ?? "Hobby"} added`
    : adding
      ? "Adding…"
      : isPlural
        ? "Add these hobbies"
        : `Add ${singularHobbyName}`;

  const tooltipTitle = added
    ? "On your profile. You'll start hearing about more plans like this."
    : isPlural
      ? "Want more plans like this? Add this plan's hobbies to your profile."
      : `Want more plans like this? Add ${singularHobbyName} to your profile.`;

  const ariaLabel = added
    ? isPlural
      ? "Hobbies added to your profile"
      : `${singularHobbyName ?? "Hobby"} added to your profile`
    : isPlural
      ? "Add this plan's hobbies to your profile"
      : `Add ${singularHobbyName} to your profile`;

  const handleAdd = async () => {
    if (adding || added || missingHobbies.length === 0 || viewerInterests === null) return;
    setAdding(true);
    setError(null);
    // Merge the missing hobbies into the viewer's existing list. The
    // PUT /profile endpoint replaces user_interests with whatever we send,
    // so we need to include both the existing slugs and the new ones.
    const mergedItems = [
      ...viewerInterests.map((i) => ({ slug: i.slug, name: i.name })),
      ...missingHobbies.map((h) => ({ slug: h.slug, name: h.name })),
    ];
    const mergedSlugs = mergedItems.map((i) => i.slug);
    try {
      const res = await apiFetch("/profile", {
        method: "PUT",
        auth: true,
        body: JSON.stringify({
          interest_slugs: mergedSlugs,
          interest_items: mergedItems,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) {
        setError("Couldn't add right now");
        setAdding(false);
        return;
      }
      setViewerInterests(mergedItems);
      setAdded(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("nc:profile-changed"));
      }
    } catch {
      setError("Couldn't add right now");
    } finally {
      setAdding(false);
    }
  };

  const interactive = !added && !adding;

  // MUI Chip automatically applies role="button", tabIndex and keyboard
  // handlers when an onClick is provided, so this stays accessible without
  // dropping out of the existing chip-row pattern. Outlined variant keeps
  // it visually quieter than the filled hobby chips next to it.
  return (
    <Tooltip title={error ?? tooltipTitle} arrow placement="top">
      <Chip
        size="small"
        variant="outlined"
        clickable={interactive}
        onClick={interactive ? handleAdd : undefined}
        aria-label={ariaLabel}
        icon={
          adding ? (
            <CircularProgress size={12} thickness={6} sx={{ color: "inherit", ml: "8px !important" }} />
          ) : added ? (
            <CheckRoundedIcon sx={{ fontSize: "0.875rem !important" }} />
          ) : (
            <AddRoundedIcon sx={{ fontSize: "0.875rem !important" }} />
          )
        }
        label={label}
        sx={{
          fontWeight: 600,
          fontSize: "0.75rem",
          borderStyle: added ? "solid" : "dashed",
          borderColor: added ? "success.main" : "primary.main",
          color: added ? "success.dark" : "primary.dark",
          bgcolor: "transparent",
          "& .MuiChip-icon": {
            color: added ? "success.main" : "primary.main",
          },
          "&:hover": interactive
            ? {
                bgcolor: "primary.light",
                borderStyle: "solid",
              }
            : undefined,
          "&:focus-visible": {
            outline: "2px solid",
            outlineColor: "primary.main",
            outlineOffset: 2,
          },
        }}
      />
    </Tooltip>
  );
}
