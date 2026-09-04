"use client";

import { useCallback, useState, type MouseEvent as ReactMouseEvent } from "react";
import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import FormatBoldRoundedIcon from "@mui/icons-material/FormatBoldRounded";
import FormatItalicRoundedIcon from "@mui/icons-material/FormatItalicRounded";
import FormatUnderlinedRoundedIcon from "@mui/icons-material/FormatUnderlinedRounded";
import StrikethroughSRoundedIcon from "@mui/icons-material/StrikethroughSRounded";
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import LinkRoundedIcon from "@mui/icons-material/LinkRounded";
import LinkOffRoundedIcon from "@mui/icons-material/LinkOffRounded";
import EmojiEmotionsOutlinedIcon from "@mui/icons-material/EmojiEmotionsOutlined";
import HorizontalRuleRoundedIcon from "@mui/icons-material/HorizontalRuleRounded";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EmojiPickerPopover } from "@/components/events/ChatEmojiPicker";

type RichTextEditorProps = {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
};

export default function RichTextEditor({ label, value, onChange, placeholder, maxLength = 5000 }: RichTextEditorProps) {
  const theme = useTheme();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [focused, setFocused] = useState(false);
  // Anchor for the emoji dropdown; shares the chat composer's picker so the
  // grid, look, and behavior are identical everywhere emojis can be typed.
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        // Underline and strike stay on (StarterKit bundles both): inline
        // marks that cannot disturb layout and survive the sanitizer,
        // emails, and unfurl excerpts. Block-level styling (headings, sizes,
        // colors) is deliberately not offered.
        // StarterKit bundles its own Link since tiptap v3; disabled here so
        // the separately-configured Link below is the only instance (the
        // duplicate triggered a "[tiptap warn]: Duplicate extension names"
        // and risked the default config winning over ours).
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: value || "",
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      if (html === "<p></p>") {
        onChange("");
      } else {
        onChange(html);
      }
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    editorProps: {
      attributes: {
        class: "nc-rich-editor",
      },
    },
  });

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const existing = editor.getAttributes("link").href ?? "";
    setLinkUrl(existing);
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url) {
      const href = /^https?:\/\//i.test(url) || /^mailto:/i.test(url) ? url : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDialogOpen(false);
    setLinkUrl("");
  }, [editor]);

  if (!editor) return null;

  const charCount = editor.getText().length;
  const isActive = (name: string, attrs?: Record<string, unknown>) => editor.isActive(name, attrs);
  // Toolbar buttons must not take focus on mousedown: a focus change clears
  // ProseMirror's stored marks, so toggling a mark OFF at the end of a run
  // (bold, underline, ...) would silently re-inherit it on the next
  // keystroke. Same fix every tiptap toolbar applies.
  const keepEditorFocus = (e: ReactMouseEvent) => e.preventDefault();
  // One style for every toolbar button so additions can't drift from the
  // originals.
  const toolSx = (active: boolean) => ({
    borderRadius: 1,
    color: active ? "primary.main" : "text.secondary",
    bgcolor: active ? "primary.50" : "transparent",
    "&:hover": { bgcolor: active ? "primary.100" : "action.hover" },
  });

  return (
    <Box>
      {label && (
        <Typography
          component="label"
          variant="subtitle1"
          fontWeight={600}
          sx={{ display: "block", mb: 0.625, cursor: "text" }}
          onClick={() => editor.chain().focus().run()}
        >
          {label}
        </Typography>
      )}

      <Box
        sx={{
          border: "1px solid",
          borderColor: focused ? "primary.main" : "divider",
          borderRadius: 1,
          transition: "border-color 0.15s",
          overflow: "hidden",
          "&:hover": { borderColor: focused ? "primary.main" : "text.disabled" },
        }}
      >
        {/* Toolbar */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.25}
          // Eight tools now; wrap rather than overflow at phone widths.
          flexWrap="wrap"
          useFlexGap
          sx={{
            px: 0.75,
            py: 0.5,
            rowGap: 0.25,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: (theme) => theme.palette.mode === "light" ? "grey.50" : "rgba(255,255,255,0.03)",
          }}
        >
          <Tooltip title="Bold" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleBold().run()}
              sx={{
                borderRadius: 1,
                color: isActive("bold") ? "primary.main" : "text.secondary",
                bgcolor: isActive("bold") ? "primary.50" : "transparent",
                "&:hover": { bgcolor: isActive("bold") ? "primary.100" : "action.hover" },
              }}
            >
              <FormatBoldRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Italic" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              sx={{
                borderRadius: 1,
                color: isActive("italic") ? "primary.main" : "text.secondary",
                bgcolor: isActive("italic") ? "primary.50" : "transparent",
                "&:hover": { bgcolor: isActive("italic") ? "primary.100" : "action.hover" },
              }}
            >
              <FormatItalicRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Underline" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              sx={toolSx(isActive("underline"))}
            >
              <FormatUnderlinedRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Strikethrough" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              sx={toolSx(isActive("strike"))}
            >
              <StrikethroughSRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.5 }} />

          <Tooltip title="Bullet list" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              sx={{
                borderRadius: 1,
                color: isActive("bulletList") ? "primary.main" : "text.secondary",
                bgcolor: isActive("bulletList") ? "primary.50" : "transparent",
                "&:hover": { bgcolor: isActive("bulletList") ? "primary.100" : "action.hover" },
              }}
            >
              <FormatListBulletedRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Numbered list" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              sx={{
                borderRadius: 1,
                color: isActive("orderedList") ? "primary.main" : "text.secondary",
                bgcolor: isActive("orderedList") ? "primary.50" : "transparent",
                "&:hover": { bgcolor: isActive("orderedList") ? "primary.100" : "action.hover" },
              }}
            >
              <FormatListNumberedRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Section divider" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              sx={toolSx(false)}
            >
              <HorizontalRuleRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.25, my: 0.5 }} />

          <Tooltip title={isActive("link") ? "Edit link" : "Add link"} arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={openLinkDialog}
              sx={{
                borderRadius: 1,
                color: isActive("link") ? "primary.main" : "text.secondary",
                bgcolor: isActive("link") ? "primary.50" : "transparent",
                "&:hover": { bgcolor: isActive("link") ? "primary.100" : "action.hover" },
              }}
            >
              <LinkRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Emoji" arrow enterDelay={400}>
            <IconButton
              size="small"
              onMouseDown={keepEditorFocus}
              onClick={(e) => setEmojiAnchor(e.currentTarget)}
              sx={toolSx(!!emojiAnchor)}
            >
              <EmojiEmotionsOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          <EmojiPickerPopover
            anchorEl={emojiAnchor}
            onClose={() => setEmojiAnchor(null)}
            onPick={(emoji) => editor.chain().focus().insertContent(emoji).run()}
          />

          <Box sx={{ flex: 1 }} />

          {maxLength && (
            <Typography
              variant="caption"
              color={charCount > maxLength * 0.9 ? "warning.main" : "text.disabled"}
              sx={{ fontSize: "0.6875rem", mr: 0.5, userSelect: "none" }}
            >
              {charCount.toLocaleString()}
            </Typography>
          )}
        </Stack>

        {/* Editor content */}
        <style>{`
          .nc-rich-editor { outline: none; min-height: 100px; max-height: 280px; overflow-y: auto; padding: 12px 14px; font-size: 1rem; line-height: 1.7; font-family: inherit; color: ${theme.palette.text.primary}; }
          .nc-rich-editor p { margin: 0 0 4px 0; }
          .nc-rich-editor p:last-child { margin-bottom: 0; }
          .nc-rich-editor ul, .nc-rich-editor ol { margin: 0 0 4px 0; padding-left: 20px; }
          .nc-rich-editor li { margin-bottom: 2px; }
          .nc-rich-editor li p { margin-bottom: 0; }
          .nc-rich-editor a { color: ${theme.palette.primary.main}; text-decoration: underline; cursor: text; }
          .nc-rich-editor hr { border: 0; border-top: 1px solid ${theme.palette.divider}; margin: 12px 0; }
          .nc-rich-editor p.is-editor-empty:first-of-type::before { content: attr(data-placeholder); color: ${theme.palette.text.disabled}; pointer-events: none; float: left; height: 0; }
        `}</style>
        <Box>
          <EditorContent editor={editor} />
        </Box>
      </Box>

      {/* Link dialog */}
      <Dialog
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          {isActive("link") ? "Edit link" : "Add link"}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          {isActive("link") && (
            <Button
              onClick={removeLink}
              startIcon={<LinkOffRoundedIcon />}
              color="error"
              sx={{ textTransform: "none", mr: "auto" }}
            >
              Remove link
            </Button>
          )}
          <Button onClick={() => setLinkDialogOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={applyLink}
            disabled={!linkUrl.trim()}
            sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, boxShadow: "none", "&:hover": { boxShadow: "none", opacity: 0.92 } }}
          >
            {isActive("link") ? "Update" : "Add link"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
