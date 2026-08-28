"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import EmojiEmotionsOutlinedIcon from "@mui/icons-material/EmojiEmotionsOutlined";

/** Curated set, no search and no external picker dependency: the goal is a
 *  quick Discord-style "add an emoji" affordance, not full unicode coverage.
 *  Native glyphs render with the platform emoji font, so there is nothing to
 *  bundle. Ordered by how likely they are in post-plan / game-night chat. */
const EMOJI_SECTIONS: Array<{ label: string; emojis: string[] }> = [
  {
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😍",
      "🥰", "😘", "😜", "🤪", "😎", "🤩", "🥳", "😏", "😌", "😴", "🤤", "😋",
      "🤔", "🤨", "😐", "🙄", "😬", "😮", "😲", "🥺", "😢", "😭", "😤", "😠",
      "🤯", "😱", "😳", "🤗", "🤫", "🤭", "🫠", "🤠", "🤡", "💀", "👻", "🤖",
    ],
  },
  {
    label: "Gestures",
    emojis: [
      "👍", "👎", "👏", "🙌", "🙏", "🤝", "💪", "👊", "🤞", "🤘", "👌", "✌️",
      "🖐️", "👋", "🫶", "🤙", "🫡", "🤷", "🤦", "💁", "🙋", "🧠",
    ],
  },
  {
    label: "Hearts & hype",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "💖", "💯",
      "✨", "⭐", "🌟", "🔥", "⚡", "💥", "🎉", "🎊", "🎈", "🏆", "🥇", "🎯",
    ],
  },
  {
    label: "Food & drink",
    emojis: [
      "☕", "🍵", "🍺", "🍻", "🥂", "🍷", "🍕", "🍔", "🌮", "🍣", "🍜", "🍩",
      "🍪", "🎂", "🧁", "🍿", "🥨", "🧀", "🍇", "🍉", "🍓", "🥗",
    ],
  },
  {
    label: "Games & activities",
    emojis: [
      "🎲", "🃏", "♟️", "🎮", "🕹️", "🧩", "🎳", "🏓", "⚽", "🏀", "🎾", "🏸",
      "🥏", "🎣", "🏕️", "🚴", "🧗", "🎨", "🎭", "🎤", "🎸", "🎧", "📚", "✏️",
    ],
  },
  {
    label: "Everything else",
    emojis: [
      "📅", "⏰", "📍", "🗺️", "🚗", "🎁", "🔑", "💡", "🔔", "📢", "✅", "❌",
      "❓", "❗", "🙈", "🙉", "🙊", "🐶", "🐱", "🦄", "🌈", "☀️", "🌙", "❄️",
    ],
  },
];

/** The dropdown itself, exported separately so surfaces with their own
 *  trigger (the chat composer's smiley button, a message's add-reaction
 *  button) can share one grid. Picking always closes the popover, matching
 *  Discord's default click behavior. */
export function EmojiPickerPopover({
  anchorEl,
  onClose,
  onPick,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  return (
    <Popover
      open={!!anchorEl}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "right" }}
      transformOrigin={{ vertical: "bottom", horizontal: "right" }}
      // Focus should land back in the caller's input after a pick; the
      // caller refocuses it, so the popover must not fight that.
      disableRestoreFocus
      slotProps={{ paper: { sx: { borderRadius: 3, boxShadow: 6 } } }}
    >
      <Box sx={{ width: 296, maxHeight: 320, overflowY: "auto", p: 1.25 }}>
        {EMOJI_SECTIONS.map((section) => (
          <Box key={section.label} sx={{ mb: 0.75 }}>
            <Typography
              variant="caption"
              sx={{
                display: "block",
                fontWeight: 700,
                fontSize: "0.6875rem",
                color: "text.disabled",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                px: 0.5,
                mb: 0.25,
              }}
            >
              {section.label}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap" }}>
              {section.emojis.map((emoji) => (
                <ButtonBase
                  key={emoji}
                  onClick={() => {
                    onClose();
                    onPick(emoji);
                  }}
                  aria-label={`Insert ${emoji}`}
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 1.5,
                    fontSize: "1.25rem",
                    lineHeight: 1,
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  {emoji}
                </ButtonBase>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Popover>
  );
}

type Props = {
  /** Called with the picked emoji; the caller inserts it at the caret. */
  onPick: (emoji: string) => void;
  disabled?: boolean;
};

/** Discord-style emoji dropdown for chat composers: a smiley button that
 *  opens the shared categorized grid above. */
export default function ChatEmojiPicker({ onPick, disabled }: Props) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <Tooltip title="Add an emoji" arrow>
        {/* span keeps the tooltip working while the button is disabled */}
        <span>
          <IconButton
            onClick={(e) => setAnchorEl(e.currentTarget)}
            disabled={disabled}
            aria-label="Add an emoji"
            sx={{ flexShrink: 0, color: "text.secondary", "&:hover": { color: "primary.main" } }}
          >
            <EmojiEmotionsOutlinedIcon sx={{ fontSize: 22 }} />
          </IconButton>
        </span>
      </Tooltip>
      <EmojiPickerPopover anchorEl={anchorEl} onClose={() => setAnchorEl(null)} onPick={onPick} />
    </>
  );
}
