"use client";

import { useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import IosShareRoundedIcon from "@mui/icons-material/IosShareRounded";
import { ordinal } from "../mtgTypes";

export type ShareResultsImageProps = {
  setName: string;
  groupName: string;
  finalDateLabel: string;
  /** Players ranked in the group. */
  players: number;
  /** Up to three rows, best first; tied players share a rank. */
  podium: Array<{ rank: number; name: string; total: number }>;
  /** Null for someone who didn't play. */
  viewer: null | { name: string; rank: number; total: number; badgeCount: number; topBadges: string[] };
};

type ResultsImage = { url: string; file: File; canShare: boolean };
type Line = { text: string; size: number; weight: number };

/** A square post for the group chat: a white card on the brand orange. */
const SIZE = 1080;
const INSET = 60;
const CARD_RADIUS = 36;
const PAD = 64;
const LEFT = INSET + PAD;
const RIGHT = SIZE - INSET - PAD;
const TOP = INSET + PAD;
const BOTTOM = SIZE - INSET - PAD;
const WIDTH = RIGHT - LEFT;

const ORANGE = "#E65B13";
const ORANGE_DEEP = "#C44D10";
const INK = "#1F2937";
const INK_SOFT = "#4B5563";
const INK_MUTED = "#6B7280";
const INK_FAINT = "#9CA3AF";
const PANEL = "#F3F4F6";
const RULE = "#E5E7EB";
const MEDAL: Record<number, string> = { 1: "#D4A017", 2: "#9CA3AF", 3: "#B87333" };
/** Failure text at 6.5:1 on white, as on the Everyone board; the theme's error color is too light for small type. */
const FAILED = "#B91C1C";

const LABEL = "MTG CARD EVALUATION CHALLENGE";
const TRACKING = 4;
/** The only place the image names the site, so a rename is one edit. */
const SITE = "newchums.com";
const ATTRIBUTION = "Unofficial Fan Content. Not approved/endorsed by Wizards.";
const FALLBACK_FAMILY = "system-ui, sans-serif";
const WEIGHTS = [800, 700, 600, 500];
/** Long enough for a slow font file, short enough that the button never hangs on one. */
const FONT_WAIT_MS = 3000;

const ROW_H = 84;
const ROW_GAP = 12;
const MEDAL_R = 28;
const NAME_SIZE = 38;
const RULE_H = 2;
/** Space above the second and third of the viewer's lines. */
const LINE_GAPS = [14, 10];

/** Cap height and descender depth as shares of the font size. Close enough
 *  across the page font and system faces to stack lines, and the card's
 *  padding absorbs the difference. */
const cap = (size: number) => size * 0.72;
const descent = (size: number) => size * 0.24;
const whole = (n: number) => (Math.round(n) || 0).toLocaleString("en-US");
const pointsText = (n: number) => `${whole(n)} ${Math.round(n) === 1 ? "point" : "points"}`;
const isAbort = (err: unknown) => typeof err === "object" && err !== null && "name" in err && err.name === "AbortError";

/** "FRA Seven" → "fra-seven-final-standings.png". */
function fileNameFor(groupName: string): string {
  const slug = groupName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${slug || "mtg"}-final-standings.png`;
}

/** The page's font as its text actually renders. MUI text, this button
 *  included, is set in the theme font, while `body` keeps the plain-HTML
 *  face, so the body is only the fallback. */
function pageFontFamily(button: HTMLElement | null): string {
  for (const el of [button, document.body]) {
    const family = el ? getComputedStyle(el).fontFamily.trim() : "";
    if (family) return family;
  }
  return FALLBACK_FAMILY;
}

/** Waits for each weight the image uses, for the characters it draws.
 *  `document.fonts.ready` alone can settle before a weight the page hasn't
 *  shown yet has even started loading, and the canvas would draw a stand-in.
 *  Only the first family is requested: one request fails outright when any
 *  family in it can't load, such as a `local(Arial)` fallback face on an
 *  Android phone, which has no Arial. */
async function fontsLoaded(family: string, text: string) {
  if (!document.fonts) return;
  const first = family.match(/^\s*("[^"]*"|'[^']*'|[^,]+)/)?.[1].trim() || family;
  const sample = Array.from(new Set(Array.from(text))).join("");
  const loads = Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 40px ${first}`, sample).catch(() => [])));
  const timeout = new Promise<void>((resolve) => { window.setTimeout(resolve, FONT_WAIT_MS); });
  await Promise.race([loads.then(() => document.fonts.ready), timeout]);
}

/** Where the browser can split text into what readers see as characters, so
 *  an ellipsis never cuts an emoji or an accented letter in half. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

/** `text` at the current font, cut short with "…" to fit `room`. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, room: number): string {
  if (ctx.measureText(text).width <= room) return text;
  const parts = graphemes(text);
  const cut = (n: number) => `${parts.slice(0, n).join("").trimEnd()}…`;
  // The longest start of the text that still fits with its ellipsis.
  let lo = 0;
  let hi = parts.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(cut(mid)).width <= room) lo = mid;
    else hi = mid - 1;
  }
  return cut(lo);
}

/** By hand, since `ctx.roundRect` is missing on phones a few years old. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Letter-spaced text. Browsers without canvas letter spacing get it one character at a time. */
function fillTracked(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  if (typeof ctx.letterSpacing === "string") {
    ctx.letterSpacing = `${TRACKING}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = "0px";
    return;
  }
  let cursor = x;
  for (const ch of Array.from(text)) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + TRACKING;
  }
}

/** True where the share sheet takes image files: most phones, few desktops. */
function canShareFile(file: File): boolean {
  try {
    return typeof navigator.share === "function" && navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/**
 * Draws the results image: the set, the group and the final day, the podium,
 * then the viewer's own finish and badges when they played. Every line is
 * measured against the card, shrinking the headings first and then cutting
 * with "…", and the card is a clip, so nothing can paint past its edge.
 */
async function drawResultsImage(p: ShareResultsImageProps, pageFamily: string): Promise<Blob> {
  const podium = p.podium.slice(0, 3);
  const viewer = p.viewer;
  const viewerName = viewer?.name.trim() || "You";
  const badges = viewer ? viewer.topBadges.slice(0, 3).join(" · ") : "";

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is not available");

  // A family the canvas can't parse leaves its default "10px sans-serif" in place.
  ctx.font = `700 40px ${pageFamily}`;
  const family = ctx.font.includes("40px") ? pageFamily : FALLBACK_FAMILY;
  await fontsLoaded(family, [
    LABEL, p.setName, p.groupName, p.finalDateLabel, SITE, ATTRIBUTION, badges, viewerName,
    "Final standings · finished of with points pts badges this season 0123456789,…", ...podium.map((r) => r.name),
  ].join(""));

  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  const paint = (line: Line, x: number, y: number, color: string, align: CanvasTextAlign = "left") => {
    ctx.font = font(line.weight, line.size);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(line.text, x, y);
  };
  /** The largest size from `max` down to `min` at which `text` fits `room`,
   *  cut short with "…" if it is still too wide at `min`. */
  const fit = (text: string, weight: number, max: number, min = max, room = WIDTH): Line => {
    ctx.font = font(weight, max);
    const natural = ctx.measureText(text).width;
    let size = max;
    if (natural > room) {
      // Width grows with size, so start close to the answer and step down.
      size = Math.max(min, Math.floor((max * room) / natural));
      ctx.font = font(weight, size);
      while (size > min && ctx.measureText(text).width > room) {
        size -= 1;
        ctx.font = font(weight, size);
      }
    }
    return { text: ellipsize(ctx, text, room), size, weight };
  };

  const wash = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  wash.addColorStop(0, ORANGE);
  wash.addColorStop(1, ORANGE_DEEP);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.shadowColor = "rgba(84, 32, 6, 0.28)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = "#FFFFFF";
  roundedRect(ctx, INSET, INSET, SIZE - INSET * 2, SIZE - INSET * 2, CARD_RADIUS);
  ctx.fill();
  ctx.restore();
  roundedRect(ctx, INSET, INSET, SIZE - INSET * 2, SIZE - INSET * 2, CARD_RADIUS);
  ctx.clip();
  ctx.textBaseline = "alphabetic";

  // The header, from the top.
  let labelSize = 24;
  ctx.font = font(800, labelSize);
  while (labelSize > 16 && ctx.measureText(LABEL).width + TRACKING * (LABEL.length - 1) > WIDTH) {
    labelSize -= 1;
    ctx.font = font(800, labelSize);
  }
  let y = TOP + cap(labelSize);
  ctx.fillStyle = ORANGE;
  ctx.textAlign = "left";
  fillTracked(ctx, LABEL, LEFT, y);

  const title = fit(p.setName, 800, 84, 48);
  y += 26 + cap(title.size);
  paint(title, LEFT, y, INK);
  const group = fit(`Final standings · ${p.groupName}`, 700, 38, 28);
  y += descent(title.size) + 16 + cap(group.size);
  paint(group, LEFT, y, INK_SOFT);
  const date = fit(p.finalDateLabel, 500, 30, 24);
  y += descent(group.size) + 12 + cap(date.size);
  paint(date, LEFT, y, INK_MUTED);
  const headerBottom = y + descent(date.size);

  // The footer, from the bottom.
  const attribution = fit(ATTRIBUTION, 500, 19, 15);
  const attributionY = BOTTOM - descent(attribution.size);
  paint(attribution, LEFT, attributionY, INK_FAINT);
  const site = fit(SITE, 800, 32);
  const siteY = attributionY - cap(attribution.size) - 14 - descent(site.size);
  paint(site, LEFT, siteY, ORANGE);
  const footerTop = siteY - cap(site.size);

  // The viewer's lines are sized before placing anything between header and footer.
  const you: Array<Line & { color: string }> = [];
  if (viewer) {
    const result = ` finished ${ordinal(viewer.rank)} of ${whole(p.players)} with ${pointsText(viewer.total)}`;
    const standing = fit(viewerName + result, 700, 36, 28);
    if (standing.text !== viewerName + result) {
      // Still too wide at the smallest size: a long name gives up letters before the result does.
      ctx.font = font(standing.weight, standing.size);
      standing.text = ellipsize(ctx, ellipsize(ctx, viewerName, WIDTH - ctx.measureText(result).width) + result, WIDTH);
    }
    you.push({ ...standing, color: INK });
    const count = viewer.badgeCount === 0 ? "No badges this season" : `${whole(viewer.badgeCount)} ${viewer.badgeCount === 1 ? "badge" : "badges"} this season`;
    you.push({ ...fit(count, 600, 30, 24), color: INK_SOFT });
    if (badges) you.push({ ...fit(badges, 500, 28), color: INK_MUTED });
  }

  const podiumH = podium.length > 0 ? podium.length * ROW_H + (podium.length - 1) * ROW_GAP : 0;
  const youH = you.reduce((h, line, i) => h + (i > 0 ? LINE_GAPS[i - 1] : 0) + cap(line.size) + descent(line.size), 0);
  const divided = podium.length > 0 && you.length > 0;
  const blocks = (podium.length > 0 ? 1 : 0) + (you.length > 0 ? 1 : 0);
  // Header, podium, the viewer's lines and footer sit evenly spaced.
  const gap = Math.max(24, (footerTop - headerBottom - podiumH - youH - (divided ? RULE_H : 0)) / (blocks + 1));
  let cursor = headerBottom + gap;

  podium.forEach((row, i) => {
    const rowTop = cursor + i * (ROW_H + ROW_GAP);
    const cy = rowTop + ROW_H / 2;
    ctx.fillStyle = PANEL;
    roundedRect(ctx, LEFT, rowTop, WIDTH, ROW_H, 22);
    ctx.fill();

    // The medal, its number centred on the digits' ink rather than their advance width.
    const cx = LEFT + 20 + MEDAL_R;
    ctx.fillStyle = MEDAL[row.rank] ?? INK_MUTED;
    ctx.beginPath();
    ctx.arc(cx, cy, MEDAL_R, 0, Math.PI * 2);
    ctx.fill();
    const rank = fit(String(row.rank), 800, 30, 16, MEDAL_R * 2 - 14);
    ctx.font = font(rank.weight, rank.size);
    ctx.textAlign = "center";
    const ink = ctx.measureText(rank.text);
    const up = ink.actualBoundingBoxAscent || cap(rank.size);
    const down = ink.actualBoundingBoxDescent || 0;
    const shift = (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2 || 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(rank.text, cx - shift, cy + (up - down) / 2);

    // Points at the right edge, then the name in the room that's left.
    const baseline = cy + cap(NAME_SIZE) / 2;
    const end = RIGHT - 24;
    const unit: Line = { text: Math.round(row.total) === 1 ? "pt" : "pts", size: 26, weight: 600 };
    paint(unit, end, baseline, INK_MUTED, "right");
    const unitW = ctx.measureText(unit.text).width + 8;
    const value: Line = { text: whole(row.total), size: 36, weight: 800 };
    paint(value, end - unitW, baseline, INK, "right");
    const valueW = ctx.measureText(value.text).width;
    const nameX = LEFT + 20 + MEDAL_R * 2 + 22;
    ctx.font = font(700, NAME_SIZE);
    const name = ellipsize(ctx, row.name.trim() || "Player", Math.max(0, end - unitW - valueW - 28 - nameX));
    paint({ text: name, size: NAME_SIZE, weight: 700 }, nameX, baseline, INK);
  });
  if (podium.length > 0) cursor += podiumH + gap;

  if (divided) {
    ctx.fillStyle = RULE;
    ctx.fillRect(LEFT, cursor - gap / 2, WIDTH, RULE_H);
    cursor += RULE_H;
  }
  you.forEach((line, i) => {
    cursor += (i > 0 ? LINE_GAPS[i - 1] : 0) + cap(line.size);
    paint(line, LEFT, cursor, line.color);
    cursor += descent(line.size);
  });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The PNG could not be encoded"))), "image/png");
  });
}

/**
 * "Share your results" beside the final podium (spec 10.5). The image is a
 * real PNG drawn in the browser, since the platform avoids server-side image
 * generation. It opens in a dialog with Share, where the device's share sheet
 * takes files (phones, for the group chat), and Download everywhere. Drawing
 * happens on the click, never at load, and the image goes when the dialog closes.
 */
export default function ShareResultsImage(props: ShareResultsImageProps) {
  const { setName, groupName, players, podium, viewer } = props;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Bumped by each draw and on unmount, so a draw that finishes after a newer
  // one, or after the page has gone, is dropped instead of opening or leaking.
  const drawRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<ResultsImage | null>(null);

  // An image's object URL is released when the image is replaced, when it is
  // cleared once the dialog has finished closing, and on unmount.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.url);
  }, [image]);
  useEffect(() => () => { drawRef.current += 1; }, []);

  const fileName = fileNameFor(groupName);
  const viewerName = viewer?.name.trim() || "You";
  const podiumText = podium.slice(0, 3).map((r) => `${ordinal(r.rank)} ${r.name}, ${pointsText(r.total)}`).join("; ");
  const alt = `Final standings image for ${groupName}, ${setName}${podiumText ? `: ${podiumText}` : ""}${viewer ? `. ${viewerName} finished ${ordinal(viewer.rank)} of ${whole(players)}` : ""}.`;
  const shareTitle = `${groupName} final standings`;
  const shareText = viewer
    ? `I finished ${ordinal(viewer.rank)} of ${whole(players)} in the ${setName} challenge in ${groupName}.`
    : `Final standings for the ${setName} challenge in ${groupName}.`;

  const makeImage = async () => {
    if (busy) return;
    const id = ++drawRef.current;
    setBusy(true);
    setError(null);
    let next: ResultsImage | null = null;
    try {
      const blob = await drawResultsImage(props, pageFontFamily(buttonRef.current));
      if (id === drawRef.current) {
        const file = new File([blob], fileName, { type: "image/png" });
        next = { url: URL.createObjectURL(blob), file, canShare: canShareFile(file) };
      }
    } catch {
      // No image, so the error line below shows.
    }
    if (id !== drawRef.current) return;
    setBusy(false);
    if (!next) {
      setError("We couldn't make the image. Try again.");
      return;
    }
    setShareError(null);
    setImage(next);
    setOpen(true);
  };

  const share = async () => {
    if (!image) return;
    setShareError(null);
    try {
      await navigator.share({ files: [image.file], title: shareTitle, text: shareText });
    } catch (err) {
      // Closing the share sheet without picking an app isn't a failure.
      if (isAbort(err)) return;
      setShareError("Sharing didn't work on this device. Download the image instead.");
    }
  };

  const close = () => setOpen(false);
  const actionSx = { textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44, boxShadow: "none" } as const;

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Not disabled while drawing: a disabled button can lose keyboard focus, and the dialog would then have nothing to hand focus back to on close. */}
      <Button
        ref={buttonRef}
        variant="outlined"
        onClick={makeImage}
        aria-busy={busy}
        startIcon={busy ? <CircularProgress size={18} color="inherit" sx={{ m: "1px" }} /> : <IosShareRoundedIcon />}
        sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, minHeight: 44 }}
      >
        {viewer ? "Share your results" : "Share the results"}
      </Button>
      {error && (
        <Typography variant="caption" role="alert" sx={{ display: "block", mt: 0.5, color: FAILED }}>{error}</Typography>
      )}

      <Dialog open={open} onClose={close} fullWidth maxWidth="xs" slotProps={{ transition: { onExited: () => setImage(null) } }}>
        <DialogTitle sx={{ pr: { xs: 7, sm: 8 } }}>Your results image</DialogTitle>
        <IconButton onClick={close} aria-label="Close" sx={{ position: "absolute", top: { xs: 8, sm: 12 }, right: { xs: 6, sm: 12 }, width: 44, height: 44 }}>
          <CloseRoundedIcon />
        </IconButton>
        <DialogContent>
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.url} alt={alt} width={SIZE} height={SIZE} style={{ display: "block", width: "100%", height: "auto", borderRadius: 12 }} />
          )}
          {shareError && (
            <Typography variant="body2" role="alert" sx={{ mt: 1.5, color: FAILED }}>{shareError}</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            component="a"
            href={image?.url}
            download={fileName}
            variant={image?.canShare ? "outlined" : "contained"}
            startIcon={<DownloadRoundedIcon />}
            sx={actionSx}
          >
            Download
          </Button>
          {image?.canShare && (
            <Button variant="contained" onClick={share} startIcon={<IosShareRoundedIcon />} sx={actionSx}>
              Share
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
