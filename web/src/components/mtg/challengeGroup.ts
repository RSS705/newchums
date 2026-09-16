import { apiFetch } from "@/lib/apiClient";

export type ChallengeGroupRef = { id: string; name: string; slug: string };

const storageKey = (slug: string) => `mtg-group:${slug}`;

/** Remember a group's id and name for this tab, so its player and card pages
 *  skip the full community lookup when opened from the group home. */
export function rememberChallengeGroup(group: ChallengeGroupRef) {
  try {
    sessionStorage.setItem(storageKey(group.slug), JSON.stringify({ id: group.id, name: group.name }));
  } catch { /* storage can be unavailable; the lookup still works */ }
}

/** Resolve a community slug to its MTG challenge group: null when there's no
 *  such community or it isn't a challenge. Throws when the lookup itself
 *  fails, so a server error isn't reported as a missing group. */
export async function loadChallengeGroup(slug: string): Promise<ChallengeGroupRef | null> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(slug)) ?? "null") as { id?: unknown; name?: unknown } | null;
    if (saved && typeof saved.id === "string" && typeof saved.name === "string") return { id: saved.id, name: saved.name, slug };
  } catch { /* fall through to the lookup */ }
  const res = await apiFetch(`/communities/${encodeURIComponent(slug)}`, { auth: true });
  if (res.status === 404) return null;
  const body = await res.json();
  if (!res.ok || !body.ok) throw new Error(`Community lookup failed with ${res.status}`);
  if (!body.community || body.community.specialization !== "mtg_prediction_challenge") return null;
  const group = { id: String(body.community.id), name: String(body.community.name), slug };
  rememberChallengeGroup(group);
  return group;
}
