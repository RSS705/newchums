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
 * The element that actually scrolls, or null when that is the window.
 *
 * From the 600px breakpoint `#app-scroll-root` is a real scroll container
 * (`height` + `overflow-y: auto`); below it those rules deliberately do not
 * apply and the body scrolls instead. Which one is live changes both where
 * the scrollport's top sits and which `scrollTop` to watch for progress.
 */
function getScrollContainer(): HTMLElement | null {
  const root = document.getElementById("app-scroll-root");
  if (!root) return null;
  const overflowY = getComputedStyle(root).overflowY;
  const scrollable = overflowY === "auto" || overflowY === "scroll";
  return scrollable && root.scrollHeight > root.clientHeight + 1 ? root : null;
}

function readScrollTop(container: HTMLElement | null): number {
  return container ? container.scrollTop : window.scrollY;
}

/**
 * Where `scrollIntoView({ block: "start" })` should leave the element's top,
 * in viewport coordinates: the scrollport's own top plus the element's
 * resolved `scroll-margin-top`.
 *
 * Measuring this rather than assuming "just below the fixed header" is the
 * point. On desktop the scrollport is `#app-scroll-root`, which already sits
 * below the header via `margin-top: var(--header-h)`, so a correctly parked
 * target lands near `2 * headerHeight + 16`, not `headerHeight`. The previous
 * fixed band (`headerBottom - 4` to `headerBottom + 72`) was derived from the
 * mobile geometry and could not be satisfied on desktop: 176 measured against
 * a 152 ceiling at 1280px. The loop therefore never reported settled, burned
 * every attempt, and kept re-scrolling for over a second.
 */
function idealTopFor(el: Element, container: HTMLElement | null): number {
  const scrollMarginTop = Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const portTop = container ? container.getBoundingClientRect().top : 0;
  return portTop + scrollMarginTop;
}

/** Absorbs sub-pixel rounding and the tail of a smooth scroll. */
const SETTLE_TOLERANCE_PX = 12;

/**
 * Scroll a deep-link target into view and hold it there while the page
 * settles.
 *
 * A single scroll queued behind a fixed timeout races anything that mounts
 * late (the account-setup bar renders above the page content once the
 * session resolves, which can land after the timeout has already fired), so
 * the browser picks a scroll position and then the content moves underneath
 * it. Instead of guessing a longer delay, this re-checks the target's real
 * position and corrects until it is actually parked where it belongs.
 *
 * Stops at the first of: settled, no further progress (the scroll position
 * stopped moving, so the target cannot get closer, for example when it is
 * the last thing on a short page), `maxAttempts` reached, or the user taking
 * over. Any wheel, touch, key or pointer interaction cancels the remaining
 * corrections immediately: yanking the page back under someone who has
 * started reading is worse than an imperfectly positioned target.
 */
export function scrollSectionIntoView(id: string, maxAttempts = 6): void {
  if (typeof document === "undefined") return;

  let attempts = 0;
  let cancelled = false;
  let lastScrollTop: number | null = null;
  let timeoutId: number | undefined;

  // Only user-driven events. A `scroll` listener would be wrong here: our own
  // scrollIntoView fires it and would cancel the sequence immediately.
  const userEvents = ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"] as const;

  const teardown = () => {
    for (const type of userEvents) window.removeEventListener(type, cancel);
  };

  function cancel() {
    if (cancelled) return;
    cancelled = true;
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    teardown();
  }

  for (const type of userEvents) {
    window.addEventListener(type, cancel, { passive: true });
  }

  const step = () => {
    if (cancelled) return;
    const el = document.getElementById(id);
    if (!el) return teardown();

    const container = getScrollContainer();
    lastScrollTop = readScrollTop(container);

    el.scrollIntoView({ behavior: attempts === 0 ? "smooth" : "auto", block: "start" });
    attempts += 1;
    if (attempts >= maxAttempts) return teardown();

    // Allow the smooth scroll to finish before reading a position back;
    // later corrections are instant so they need much less settling time.
    timeoutId = window.setTimeout(
      () => {
        if (cancelled) return;
        const current = document.getElementById(id);
        if (!current) return teardown();

        const nowContainer = getScrollContainer();
        const rect = current.getBoundingClientRect();
        if (Math.abs(rect.top - idealTopFor(current, nowContainer)) <= SETTLE_TOLERANCE_PX) {
          return teardown();
        }

        // No progress: the scroll position is unchanged since the last
        // correction, so re-scrolling cannot improve it.
        if (readScrollTop(nowContainer) === lastScrollTop) return teardown();

        step();
      },
      attempts === 1 ? 420 : 200,
    );
  };

  requestAnimationFrame(step);
}
