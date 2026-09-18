/**
 * "I pressed Join while signed out": remembered across the trip through
 * sign-in or sign-up, so the community page can finish the join when the
 * visitor comes back signed in, instead of asking them to press Join again.
 *
 * It lives in this browser's localStorage, not in the URL, on purpose: a
 * `?join=1` link could enrol any signed-in person who merely opened it. Only
 * our own Join buttons write this, it names one community, and it goes stale
 * after two hours. localStorage rather than sessionStorage because an email
 * sign-up comes back in a new tab, from the verification email.
 */
const KEY = "nc:join-intent";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function rememberJoinIntent(slug: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ slug, at: Date.now() }));
  } catch { /* storage is off or full: they press Join once more, as before */ }
}

/** True once, when a fresh intent for this community is waiting. Reading it uses it up. */
export function takeJoinIntent(slug: string): boolean {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { slug?: unknown; at?: unknown };
    const fresh = typeof parsed.at === "number" && Date.now() - parsed.at < MAX_AGE_MS;
    if (!fresh) {
      window.localStorage.removeItem(KEY);
      return false;
    }
    if (parsed.slug !== slug) return false;
    window.localStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
