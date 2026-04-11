/**
 * Scroll the first errored field in a form into view, smoothly and centered so
 * the validation message is visible above any sticky bottom bar (mobile in
 * particular). Forms register fields by key into a ref map, then call this
 * helper after validation fails.
 *
 * `orderedKeys` defines the visual top-to-bottom order of fields in the form,
 * so the user always lands on the first problem they need to fix rather than a
 * later one.
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
    // `block: "center"` keeps the field comfortably in view on small screens
    // even when a sticky submit bar is hugging the bottom of the viewport.
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    // Focus the first focusable child so screen readers announce the error
    // and keyboard users land on the right place. Best-effort, never throws.
    const focusable = el.querySelector<HTMLElement>(
      'input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable) {
      try { focusable.focus({ preventScroll: true }); } catch { /* noop */ }
    }
    return;
  }
}
