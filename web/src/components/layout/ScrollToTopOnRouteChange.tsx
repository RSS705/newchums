"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Scroll the page to the top on every route change.
 *
 * Why this is its own component: Next.js App Router's `Link scroll={true}`
 * (the default) calls `window.scrollTo(0, 0)` after navigation. That works
 * when html/body is the scroll container, but on desktop this app pins
 * `html, body { overflow: hidden }` (see globals.css) and the actual
 * scroll lives on `#app-scroll-root`. The window.scrollTo call is a no-op
 * there, so without this component the new page would inherit the
 * previous page's scroll position (e.g., clicking "Browse communities"
 * from the homepage's final CTA dropped the user partway down
 * /communities at exactly the scroll offset they had on the homepage).
 *
 * Behavior:
 *   - Reset `#app-scroll-root.scrollTop` on every pathname change.
 *   - Also call `window.scrollTo` so mobile (where html owns scroll)
 *     stays consistent.
 *   - Skip when the URL carries a `#hash` so the browser's native
 *     scroll-to-anchor on hash navigation isn't overridden. That's how
 *     the homepage's `#for-organizers` style anchors keep working.
 *   - Only fires on pathname changes. Search-param-only updates (tab
 *     switches that sync `?tab=…` to the URL, deep-link cleanup that
 *     strips `?section=…` / `?invite_token=…` / `?focus=…`, etc.) must
 *     preserve the viewer's scroll position. Pages that need to scroll
 *     on a search-param change own that behavior locally (e.g.
 *     EventDetailClient's `scrollIntoView` for `?section=` deep links).
 *   - "auto" behavior, not "smooth". Page-load scroll resets should
 *     feel instant; smooth scrolling between routes reads as broken.
 */
export default function ScrollToTopOnRouteChange() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Native hash navigation handles its own scroll. Don't fight it.
    if (window.location.hash) return;

    const root = document.getElementById("app-scroll-root");
    if (root) {
      root.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    // Mobile (and any other case where html/window is the scroll target).
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
