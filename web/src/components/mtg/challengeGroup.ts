import { apiFetch } from "@/lib/apiClient";

export type ChallengeGroupRef = { id: string; name: string; slug: string };

/** Resolve a community slug to its MTG challenge group: null when there's no
 *  such community or it isn't a challenge. Throws on a network failure. */
export async function loadChallengeGroup(slug: string): Promise<ChallengeGroupRef | null> {
  const res = await apiFetch(`/communities/${encodeURIComponent(slug)}`, { auth: true });
  const body = await res.json();
  if (!body.ok || !body.community || body.community.specialization !== "mtg_prediction_challenge") return null;
  return { id: String(body.community.id), name: String(body.community.name), slug };
}
