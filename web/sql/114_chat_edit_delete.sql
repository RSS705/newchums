-- Migration 114: plan-chat message editing and deletion.
--
-- Discord-style: authors (and only authors — the host deliberately gets no
-- special powers here) can edit or delete their own messages. Edits carry a
-- visible "(edited)" marker driven by edited_at. Deletion is a soft delete:
-- the row keeps its body for the admin safety transcript, but every
-- member-facing read filters deleted rows out entirely, so to users the
-- message is simply gone, as on Discord.

ALTER TABLE newchums.event_chat_messages
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
