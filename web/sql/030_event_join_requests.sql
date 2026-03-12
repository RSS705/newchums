-- Migration 030: Request-to-join for plans
--
-- Adds:
--   1. events.require_approval — host can require approval before joining
--   2. event_join_requests     — tracks join requests with status and messages

-- 1. Require-approval flag on events
ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Join request records
CREATE TABLE IF NOT EXISTS newchums.event_join_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  message         TEXT        NULL,
  host_message    TEXT        NULL,
  decided_at      TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active request per user per event (pending requests block duplicates;
-- approved/declined users can re-request if the host later clears them)
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_join_requests_user_event
  ON newchums.event_join_requests (event_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_join_requests_event_status
  ON newchums.event_join_requests (event_id, status, created_at ASC);

-- Run: psql "$DATABASE_URL" -f web/sql/030_event_join_requests.sql
