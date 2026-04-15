/**
 * Convert Tiptap rich-text HTML (the editor used for plan descriptions) to a
 * single-line plain-text string suitable for email digests and change
 * summaries. Block-level boundaries become a single space, inline tags are
 * removed, and the HTML entities Tiptap/our sanitizer can emit are decoded.
 *
 * Kept intentionally minimal — we only need to clean the tag set produced by
 * the editor's whitelist (p, br, ul, ol, li, strong, em, a).
 */
export function htmlToPlainText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<\/(p|li|ul|ol|div|h[1-6])>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
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
