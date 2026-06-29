-- Migration 100: Per-message plan chat notifications
--
-- Replaces the old "everything is silently batched into a daily unread-chat
-- digest" model with an explicit, per-message opt-in.
--
-- event_chat_messages.notify_attendees — when the sender flags a message, that
-- message notifies the plan's attendees (Going + Maybe RSVPs + host, excluding
-- the sender) by an immediate email and an in-app notification. Unflagged
-- messages stay silent: real-time broadcast and the unread badge only. Off by
-- default so the common case sends nothing.
--
-- event_chat_notify_sends — per-recipient, per-plan record of the last chat
-- notification email sent, used to rate-limit immediate emails so a burst of
-- flagged messages cannot spam the same recipient. The in-app notification is
-- never rate-limited.

ALTER TABLE newchums.event_chat_messages
  ADD COLUMN IF NOT EXISTS notify_attendees BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS newchums.event_chat_notify_sends (
  event_id          UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  recipient_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  last_sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, recipient_user_id)
);

-- Run: psql "$DATABASE_URL" -f web/sql/100_chat_message_notify.sql
