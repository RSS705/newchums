/**
 * Lightweight HTML sanitizer for rich text descriptions.
 *
 * Whitelists only the tags produced by the Tiptap editor:
 *   p, strong, em, u, s, ul, ol, li, a, br
 *
 * Strips all other tags. Only allows `href` on <a> tags, and only
 * http/https/mailto URLs. Adds rel="noopener noreferrer" target="_blank"
 * to all links. Designed for the Cloudflare Workers runtime (no DOM required).
 */

const ALLOWED_TAGS = new Set(["p", "strong", "em", "u", "s", "ul", "ol", "li", "a", "br"]);

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function sanitizeDescriptionHtml(raw: string): string {
  if (!raw) return "";

  // Replace HTML tags: keep whitelisted ones, strip the rest
  return raw.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";

    const isClosing = match.startsWith("</");
    if (isClosing) return `</${tag}>`;

    // Self-closing br
    if (tag === "br") return "<br>";

    // For <a>, extract and sanitize href
    if (tag === "a") {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
      const href = hrefMatch?.[1] ?? "";
      if (href && /^(https?:\/\/|mailto:)/i.test(href)) {
        return `<a href="${escapeHtmlAttr(href)}" rel="noopener noreferrer" target="_blank">`;
      }
      // Link without valid href — render as plain <a> with safety attrs
      return `<a rel="noopener noreferrer" target="_blank">`;
    }

    // All other allowed tags: strip any attributes
    return `<${tag}>`;
  });
}
