"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
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

/** Single text-style button rendered inside the post-feedback "Thanks for
 *  sharing your feedback" Paper. Replaces the previous Report + Hide row.
 *
 *  Self-contained: fetches the viewer's interests on mount, gates render
 *  on whether the plan has at least one hobby they don't already follow,
 *  and on click PUTs the merged interest list back to /profile. Renders
 *  nothing while loading or when the viewer already has every plan hobby,
 *  so the success Paper collapses cleanly to its heading + body in those
 *  cases.
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
  // this gate the button would briefly render and then vanish for users who
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
      ? "Hobbies added to your profile"
      : `${singularHobbyName ?? "Hobby"} added to your profile`
    : adding
      ? "Adding…"
      : isPlural
        ? "Add this plan's hobbies to your profile to be notified next time"
        : `Add ${singularHobbyName} to your profile to be notified next time`;

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
        setError("Couldn't add right now. Please try again.");
        setAdding(false);
        return;
      }
      setViewerInterests(mergedItems);
      setAdded(true);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("nc:profile-changed"));
      }
    } catch {
      setError("Couldn't add right now. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Button
      size="small"
      variant="text"
      onClick={handleAdd}
      disabled={adding || added}
      aria-label={ariaLabel}
      startIcon={
        added ? (
          <CheckRoundedIcon sx={{ fontSize: "1rem !important" }} />
        ) : adding ? (
          <CircularProgress size={14} thickness={6} sx={{ color: "inherit" }} />
        ) : (
          <AddRoundedIcon sx={{ fontSize: "1rem !important" }} />
        )
      }
      sx={{
        mt: 2.5,
        textTransform: "none",
        fontWeight: 600,
        fontSize: "0.8125rem",
        borderRadius: 2,
        px: 1.5,
        color: added ? "success.dark" : "text.secondary",
        "&:hover": {
          color: "primary.main",
          bgcolor: "primary.light",
        },
        "&.Mui-disabled": {
          // Keep the success state legible — MUI fades disabled buttons,
          // but we want the green check state to stay readable.
          color: added ? "success.dark" : undefined,
          opacity: added ? 1 : undefined,
        },
      }}
    >
      {error ?? label}
    </Button>
  );
}
