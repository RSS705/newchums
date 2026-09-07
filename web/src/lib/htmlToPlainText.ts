/**
 * Plain-text helpers for rich-text fields (plan descriptions, profile bios).
 * Mirrors api/src/lib/htmlToPlainText.ts; keep the two in step.
 */

/** Rich-text HTML to a single-line string, for metadata and length checks. */
export function htmlToPlainText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<hr\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a stored value carries markup rather than legacy plain text. */
export function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Legacy plain text (bios written before the rich-text editor) loaded into
 * the editor as paragraphs: blank lines split paragraphs, single newlines
 * become line breaks. Values that already carry markup pass through.
 */
export function plainTextToEditorHtml(value: string): string {
  const text = value.trim();
  if (!text) return "";
  if (looksLikeHtml(text)) return text;
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((para) => `<p>${escape(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
