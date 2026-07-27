/**
 * Shared scroll offset for in-page deep-link targets.
 *
 * The app header is `position: fixed` and, on the mobile path, the body is
 * the scroll container (see the `#app-scroll-root` rules in globals.css), so
 * `scrollIntoView({ block: "start" })` aligns a target's top with the top of
 * the scrollport and parks it underneath the header. `--header-h` is declared
 * on `#app-scroll-root` (64px, 80px from the 1200px breakpoint), so deriving
 * the offset from it stays correct at every breakpoint instead of hardcoding
 * a number that only happens to work at one size.
 */
export const SECTION_SCROLL_MARGIN = "calc(var(--header-h, 64px) + 16px)";

/** Resolved pixel height of the fixed header, for in-viewport assertions. */
export function getHeaderHeightPx(): number {
  if (typeof document === "undefined") return 64;
  const root = document.getElementById("app-scroll-root");
  const raw = root ? getComputedStyle(root).getPropertyValue("--header-h") : "";
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 64;
}

/**
 * Scroll a deep-link target into view and hold it there while the page
 * settles.
 *
 * A single scroll queued behind a fixed timeout races anything that mounts
 * late (the account-setup bar renders above the page content once the
 * session resolves, which can land after the timeout has already fired), so
 * the browser picks a scroll position and then the content moves underneath
 * it. Instead of guessing a longer delay, this re-checks the target's real
 * position and corrects until it is actually sitting below the header, then
 * stops. Bounded so it can never loop: at most `maxAttempts` corrections,
 * and it gives up quietly if the target cannot reach the ideal position
 * (for example when it is the last thing on a short page).
 */
export function scrollSectionIntoView(id: string, maxAttempts = 6): void {
  if (typeof document === "undefined") return;

  let attempts = 0;

  const step = () => {
    const el = document.getElementById(id);
    if (!el) return;

    el.scrollIntoView({ behavior: attempts === 0 ? "smooth" : "auto", block: "start" });
    attempts += 1;
    if (attempts >= maxAttempts) return;

    // Allow the smooth scroll to finish before reading a position back;
    // later corrections are instant so they need much less settling time.
    window.setTimeout(
      () => {
        const current = document.getElementById(id);
        if (!current) return;
        const rect = current.getBoundingClientRect();
        const headerBottom = getHeaderHeightPx();
        // Settled when the target's top sits just below the header. The
        // upper bound absorbs the scroll margin plus sub-pixel rounding.
        const settled = rect.top >= headerBottom - 4 && rect.top <= headerBottom + 72;
        if (!settled) step();
      },
      attempts === 1 ? 420 : 200,
    );
  };

  requestAnimationFrame(step);
}
