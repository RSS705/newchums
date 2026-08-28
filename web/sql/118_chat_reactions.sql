-- 118: Emoji reactions on plan chat messages (Discord style).
-- One row per (message, user, emoji); toggling a reaction off deletes the
-- row. Aggregates are computed at read time; the ChatRoom DO broadcasts a
-- chat_reaction event so open clients update live. Reactions are silent:
-- no emails, no bell entries.
CREATE TABLE IF NOT EXISTS newchums.event_chat_reactions (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id  UUID        NOT NULL REFERENCES newchums.event_chat_messages(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  emoji       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_event_chat_reactions_message
  ON newchums.event_chat_reactions (message_id);
