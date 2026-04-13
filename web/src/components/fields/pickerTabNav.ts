/**
 * Keyboard handler that makes Tab/Shift+Tab navigate between date/time
 * sections (MM, DD, YYYY / hh, mm, AM) instead of jumping to the next
 * form field.
 *
 * MUI X v8's accessible field DOM structure renders each section as a
 * separate <span> inside a role="group" container. Arrow keys navigate
 * between sections by default, but Tab leaves the field entirely
 * (standard WAI-ARIA composite widget behavior).
 *
 * This handler intercepts Tab within the field and clicks the
 * next/previous section container, which triggers MUI's internal
 * setSelectedSections. On the last section (Tab) or first (Shift+Tab),
 * it falls through so the user can still Tab out of the field.
 *
 * Usage: pass as `onKeyDown` to the picker's `slotProps.textField`:
 *   slotProps={{ textField: { onKeyDown: pickerFieldTabKeyDown } }}
 */
export function pickerFieldTabKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;

  // Walk up to the root element that contains the sections.
  // MUI X renders sections inside a container with class MuiPickersSectionList-root.
  const root =
    event.currentTarget.querySelector("[data-sectionindex]")?.parentElement ??
    event.currentTarget;
  const sections = root.querySelectorAll<HTMLElement>("[data-sectionindex]");
  if (sections.length < 2) return;

  // Find which section is currently active via document.activeElement
  const active = document.activeElement as HTMLElement | null;
  if (!active || !root.contains(active)) return;

  const currentContainer = active.closest?.("[data-sectionindex]") as HTMLElement | null;
  if (!currentContainer) return;

  const currentIndex = Number(currentContainer.getAttribute("data-sectionindex"));
  if (Number.isNaN(currentIndex)) return;

  const sorted = Array.from(sections).sort(
    (a, b) =>
      Number(a.getAttribute("data-sectionindex")) -
      Number(b.getAttribute("data-sectionindex")),
  );
  const pos = sorted.findIndex(
    (el) => Number(el.getAttribute("data-sectionindex")) === currentIndex,
  );

  if (event.shiftKey) {
    if (pos <= 0) return; // first section: let Tab leave the field
    event.preventDefault();
    sorted[pos - 1].click();
  } else {
    if (pos >= sorted.length - 1) return; // last section: let Tab leave the field
    event.preventDefault();
    sorted[pos + 1].click();
  }
}
