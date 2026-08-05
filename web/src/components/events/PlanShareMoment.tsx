"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import { trackEvent } from "@/lib/analytics";

/**
 * The share moment.
 *
 * NewChums' whole job is "post the plan, share one link, see who's coming",
 * and the middle step used to be the weakest thing on the page: publishing
 * ended in a toast and a redirect, and the copy-link action was buried near
 * the bottom of the host actions.
 *
 * This is the one surface for that step, used in two places:
 *   - straight after publishing (`surface="post_publish"`), opened
 *     automatically so sharing is the obvious next action rather than
 *     something to go looking for;
 *   - any time afterwards from the plan page's Share button
 *     (`surface="plan_page"`).
 *
 * It shows the link itself, one full-width copy action, and a preview of
 * how the link unfurls when pasted into a group chat, so the host knows what
 * their friends will actually see. There is deliberately no second button:
 * the native share sheet used to sit beside Copy, and two ways to do the
 * same thing made the single most important tap on the page a choice.
 */

type PlanShareMomentProps = {
  open: boolean;
  onClose: () => void;
  /** Absolute share URL, share token included when there is one. */
  url: string;
  planTitle: string;
  /** Pre-formatted date/time line, matching the unfurl's description. */
  planWhen?: string | null;
  /** Distinguishes the two entry points in analytics. */
  surface: "post_publish" | "plan_page";
};

export default function PlanShareMoment({
  open,
  onClose,
  url,
  planTitle,
  planWhen,
  surface,
}: PlanShareMomentProps) {
  const [copied, setCopied] = React.useState(false);

  // One event per opening, per surface.
  const shownRef = React.useRef(false);
  React.useEffect(() => {
    if (!open) {
      shownRef.current = false;
      setCopied(false);
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;
    trackEvent("share_prompt_shown", { surface });
  }, [open, surface]);

  const copy = async () => {
    // Fires at tap time so a clipboard failure still counts the intent,
    // matching the existing handler's convention.
    trackEvent("share_link_copied", { surface, is_host: true });
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.cssText = "position:fixed;top:-9999px;left:-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* The link is on screen and selectable, so a failed copy is survivable. */
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: { borderRadius: 4 } }}
    >
      {/* The theme turns every dialog into a full-screen sheet below sm.
          This one auto-opens after publishing, so the sheet has to look
          deliberate: the content centres itself in the spare height (auto
          margins, not justify-content, so an overflowing short-landscape
          screen still scrolls from the top instead of clipping). */}
      <DialogContent sx={{ p: { xs: 2.5, sm: 3 }, display: "flex", flexDirection: "column" }}>
        <Stack spacing={2} sx={{ my: "auto" }}>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.125rem", lineHeight: 1.3 }}>
              {surface === "post_publish" ? "Your plan is live. Share it." : "Share this plan"}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5, lineHeight: 1.55 }}>
              Paste this link anywhere your group already talks. Nobody needs an
              account to see it or RSVP.
            </Typography>
          </Box>

          {/* The link itself, selectable so it stays usable if the clipboard
              write is refused. */}
          <Box
            sx={{
              px: 1.5,
              py: 1.25,
              borderRadius: 2,
              bgcolor: "background.default",
              border: "1px solid",
              borderColor: "divider",
              fontSize: "0.8125rem",
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              userSelect: "all",
            }}
          >
            {url}
          </Box>

          <Button
            onClick={copy}
            variant="contained"
            fullWidth
            startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", "&:hover": { boxShadow: "none" } }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>

          {/* Unfurl preview: mirrors the real share card (static
              /og-plan-card.png plus the og:title and og:description that
              carry the plan name and time), so the host can see what lands
              in the chat rather than guessing. */}
          <Box>
            <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600, display: "block", mb: 0.75 }}>
              How it looks when pasted
            </Typography>
            <Box sx={{ borderRadius: 2.5, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
              <Box
                component="img"
                src="/og-plan-card.png"
                alt=""
                sx={{ display: "block", width: "100%", height: "auto" }}
              />
              <Box sx={{ px: 1.5, py: 1.25, bgcolor: "background.paper" }}>
                <Typography
                  sx={{ fontWeight: 700, fontSize: "0.8125rem", lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  Join this plan: {planTitle}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {planWhen ? `${planWhen}. ` : ""}View details and RSVP on NewChums.
                </Typography>
              </Box>
            </Box>
          </Box>

          <Button
            onClick={onClose}
            variant="text"
            sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", alignSelf: "center" }}
          >
            {surface === "post_publish" ? "Awesome!" : "Done"}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
