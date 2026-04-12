import { scrollElementIntoView } from "./scrollUtils";

/**
 * Scroll the first errored field in a form into view, accounting for the
 * sticky header so the validation message is visible above any sticky bottom
 * bar (mobile in particular). Forms register fields by key into a ref map,
 * then call this helper after validation fails.
 *
 * `orderedKeys` defines the visual top-to-bottom order of fields in the form,
 * so the user always lands on the first problem they need to fix rather than
 * a later one.
 *
 * Implementation notes — the previous attempt used
 * `el.scrollIntoView({ block: "center", behavior: "smooth" })`. That picks the
 * nearest scrollable ancestor, which on mobile lands on `#app-scroll-root`
 * (whose computed `overflow-y` is `auto` because of `overflow-x: hidden`) even
 * though that element doesn't actually overflow on mobile. Result: the scroll
 * request fired but went to a non-scrolling element and the window never
 * moved. The shared `scrollElementIntoView` helper sidesteps that by
 * explicitly checking whether each ancestor *actually* overflows before
 * picking it as the scroll target, and falling through to `window.scrollTo`
 * when nothing does.
 */
export function scrollToFirstError(
  fieldRefs: Record<string, HTMLElement | null>,
  errors: Record<string, string>,
  orderedKeys: readonly string[],
): void {
  if (typeof window === "undefined") return;
  for (const key of orderedKeys) {
    if (!errors[key]) continue;
    const el = fieldRefs[key];
    if (!el) continue;
    scrollElementIntoView(el);
    // Focus the first focusable child so screen readers announce the error
    // and keyboard users land on the right place. Best-effort, never throws.
    // `preventScroll` keeps focus from fighting our explicit scroll above.
    const focusable = el.querySelector<HTMLElement>(
      'input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) {
      try { focusable.focus({ preventScroll: true }); } catch { /* noop */ }
    }
    return;
  }
}
