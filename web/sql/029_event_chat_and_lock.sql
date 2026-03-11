-- Migration 029: In-plan group chat + host lock
--
-- Adds:
--   1. event_chat_messages — per-plan chat messages
--   2. event_chat_reads    — per-user last-read tracking for unread indicators
--   3. events.locked_at    — host can lock a plan to prevent new joins

-- 1. Chat messages
CREATE TABLE IF NOT EXISTS newchums.event_chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_chat_messages_event_time
  ON newchums.event_chat_messages (event_id, created_at ASC);

-- 2. Chat read tracking (last-read-at per user per event)
CREATE TABLE IF NOT EXISTS newchums.event_chat_reads (
  event_id      UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  last_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- 3. Lock column on events
ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;

-- Run: psql "$DATABASE_URL" -f web/sql/029_event_chat_and_lock.sql
