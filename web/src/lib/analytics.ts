/**
 * Thin wrapper around gtag for product analytics events.
 *
 * GA only loads in production (see the conditional Script tags in
 * web/src/app/layout.tsx), so in dev / preview `window.gtag` is undefined and
 * every call here is a silent no-op. Never let analytics break UX: all
 * failures are swallowed.
 *
 * Event naming: snake_case verbs scoped by surface, e.g. `feedback_submitted`,
 * `signup_step_completed`. Keep params flat (string | number | boolean).
 */

type GtagParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params?: GtagParams): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { gtag?: (...args: unknown[]) => void };
  if (typeof w.gtag !== "function") return;
  try {
    w.gtag("event", name, params ?? {});
  } catch {
    /* analytics must never break the product */
  }
}
