/**
 * Robust scroll helper for the app. Handles the two scroll-container realities
 * the app actually has:
 *
 *   - Desktop (≥600px): scroll lives in `#app-scroll-root`. html and body
 *     have `overflow: hidden` (see globals.css), so `window.scrollTo` is a
 *     no-op. The helper walks up to `#app-scroll-root` and scrolls it
 *     directly.
 *   - Mobile (<600px): html owns the scroll (`html { overflow-y: scroll }`).
 *     Body has `overflow: visible` and is not a scroll container, and
 *     `#app-scroll-root` is also not a scroll container — both are pure
 *     layout wrappers on mobile. The helper falls through to
 *     `window.scrollTo` (which targets `documentElement`).
 *
 * Two key implementation details that the previous round of attempts got
 * wrong:
 *
 *   1. The previous fixes used `el.scrollIntoView({ behavior: "smooth" })`,
 *      which walks the DOM looking for the nearest scrollable ancestor by
 *      computed-overflow alone. On mobile that sometimes landed on
 *      `#app-scroll-root` (whose computed overflow-y was auto due to a CSS
 *      cascade quirk on overflow-x: hidden) even though that element didn't
 *      actually overflow. Result: scrollIntoView fired, returned no-op,
 *      viewport never moved.
 *
 *   2. For documentElement (html), `getBoundingClientRect().top` is
 *      `-scrollTop` (the html box "moves up" as its content scrolls down),
 *      so the `(rect.top - ancestorRect.top + scrollTop)` formula that
 *      works for inner scroll containers double-counts the scroll on html.
 *      The else branch uses `rect.top + window.scrollY` which is the
 *      correct formula for document-level scroll.
 *
 * Also waits a double rAF so layout has settled after a state transition
 * (the single-rAF version was racing the React commit + paint on slow
 * mobile devices).
 */

const MOBILE_BREAKPOINT = 600;
const MOBILE_HEADER_HEIGHT = 64;
const DESKTOP_HEADER_HEIGHT = 80;
const BREATHING_ROOM = 16;

/**
 * Find an actually-scrollable ancestor (one whose content overflows). Returns
 * null if no such ancestor exists, in which case the caller should fall back
 * to scrolling the window.
 */
function findScrollableAncestor(el: HTMLElement): HTMLElement | null {
  let parent: HTMLElement | null = el.parentElement;
  while (parent) {
    const cs = window.getComputedStyle(parent);
    const overflowY = cs.overflowY;
    const canScroll = overflowY === "auto" || overflowY === "scroll";
    // Only count it as a scroll container if it ACTUALLY overflows. A
    // container that *can* scroll but doesn't (e.g. mobile #app-scroll-root)
    // would otherwise swallow our scroll request and the window would never
    // move.
    if (canScroll && parent.scrollHeight > parent.clientHeight + 1) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Scroll the element so its top sits below the sticky app header with a bit
 * of breathing room. Works on both mobile (window scroll) and desktop
 * (`#app-scroll-root`).
 *
 * Uses a double-rAF to wait for layout, then computes the target position
 * explicitly using getBoundingClientRect + the scroll container's current
 * scrollTop. Defaults to "auto" (instant) instead of "smooth" because iOS
 * Safari's smooth-scroll is unreliable when a state transition just unmounted
 * a sibling — the smooth animation gets cancelled by the layout shift and the
 * viewport ends up wherever it was when the cancel landed.
 */
export function scrollElementIntoView(
  el: HTMLElement,
  opts?: { extraOffset?: number; behavior?: ScrollBehavior },
): void {
  if (typeof window === "undefined") return;

  const run = () => {
    if (!el.isConnected) return;
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    const headerHeight = isMobile ? MOBILE_HEADER_HEIGHT : DESKTOP_HEADER_HEIGHT;
    const offset = headerHeight + BREATHING_ROOM + (opts?.extraOffset ?? 0);
    const behavior = opts?.behavior ?? "auto";

    const scrollAncestor = findScrollableAncestor(el);
    const rect = el.getBoundingClientRect();

    if (scrollAncestor && scrollAncestor !== document.documentElement) {
      // Inner scroll container (e.g. desktop #app-scroll-root). For an inner
      // element, getBoundingClientRect().top is the viewport position and
      // doesn't double-count the inner scroll, so the (rect.top -
      // ancestorRect.top + scrollTop) formula gives the element's position
      // within the container's scroll content.
      const ancestorRect = scrollAncestor.getBoundingClientRect();
      const targetY =
        rect.top - ancestorRect.top + scrollAncestor.scrollTop - offset;
      scrollAncestor.scrollTo({ top: Math.max(0, targetY), behavior });
    } else {
      // Document-level scroll (mobile, where html owns the scroll, OR no
      // scrollable ancestor at all). For documentElement, getBoundingClientRect
      // returns top = -scrollTop (the html box moves up as content scrolls
      // down), so we CANNOT use the (rect.top - htmlRect.top + scrollTop)
      // formula here — that would double-count the scroll. The correct
      // formula uses window.scrollY which directly tracks document scroll.
      const targetY = rect.top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, targetY), behavior });
    }
  };

  // Double-rAF: first frame lets React commit DOM mutations, second frame lets
  // the browser paint and computed layout settle. Without this, the rect we
  // measure can be from a stale layout pass.
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}
