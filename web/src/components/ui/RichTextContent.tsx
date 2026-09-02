"use client";

import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";

type RichTextContentProps = {
  html: string;
  /** Typography variant size: "body1" (default, plan detail) or "body2" (compact contexts) */
  size?: "body1" | "body2";
};

const URL_RE = /(?<!\w)(https?:\/\/[^\s<]+)/g;

/**
 * Convert bare URLs in text to <a> tags, but skip URLs already inside an <a> tag.
 */
function autoLinkUrls(text: string): string {
  const parts = text.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);
  return parts.map((part) => {
    if (/^<a\b/i.test(part)) return part;
    return part.replace(URL_RE, '<a href="$1" rel="noopener noreferrer" target="_blank">$1</a>');
  }).join("");
}

/**
 * Renders sanitized HTML content from the rich text editor.
 *
 * Content is sanitized server-side before storage (see sanitizeDescriptionHtml in the API).
 * Only whitelisted tags are stored: p, strong, em, u, s, ul, ol, li, a, br.
 *
 * Plain-text descriptions (pre-rich-text) are detected and rendered with preserved line breaks.
 * Bare URLs are auto-linked in both plain text and HTML content.
 */
export default function RichTextContent({ html, size = "body1" }: RichTextContentProps) {
  const theme = useTheme();
  const isPlainText = !/<[a-z][\s\S]*>/i.test(html);
  const fontSize = size === "body1" ? "1rem" : "0.875rem";
  const textColor = size === "body2" ? theme.palette.text.secondary : theme.palette.text.primary;
  const linkColor = theme.palette.primary.main;

  const linkStyles = `
    .nc-rich-content a {
      color: ${linkColor};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .nc-rich-content a:hover {
      opacity: 0.85;
    }
  `;

  if (isPlainText) {
    const escaped = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const withBreaks = escaped.replace(/\n/g, "<br>");
    const linked = autoLinkUrls(withBreaks);

    return (
      <>
        <style>{linkStyles}</style>
        <div
          className="nc-rich-content"
          dangerouslySetInnerHTML={{ __html: linked }}
          style={{
            fontSize,
            lineHeight: 1.7,
            color: textColor,
            wordBreak: "break-word",
          }}
        />
      </>
    );
  }

  const linked = autoLinkUrls(html);

  return (
    <>
      <style>{linkStyles}</style>
      <Box
        className="nc-rich-content"
        component="div"
        dangerouslySetInnerHTML={{ __html: linked }}
        sx={{
          fontSize,
          lineHeight: 1.7,
          color: textColor,
          wordBreak: "break-word",
          "& p": { m: 0, mb: 1 },
          "& p:last-child": { mb: 0 },
          "& ul, & ol": { m: 0, pl: 2.5, mb: 1 },
          "& ul:last-child, & ol:last-child": { mb: 0 },
          "& li": { mb: 0.25 },
          "& li p": { mb: 0 },
          "& strong": { fontWeight: 600 },
          "& u": { textUnderlineOffset: "2px" },
        }}
      />
    </>
  );
}
