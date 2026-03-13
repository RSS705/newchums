-- Migration 034: Track host-initiated attendee removals
--
-- Records each time a host removes an attendee from a plan.
-- Used for future host quality metrics, moderation review, and trust scoring.
-- No scoring logic is implemented here — this is the raw event log.
--
-- Run: psql "$DATABASE_URL" -f web/sql/034_host_attendee_removals.sql

CREATE TABLE IF NOT EXISTS newchums.host_attendee_removals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  host_user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  removed_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  status_at_removal TEXT      NOT NULL,
  reason          TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_host_attendee_removals_host
  ON newchums.host_attendee_removals (host_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_host_attendee_removals_event
  ON newchums.host_attendee_removals (event_id);
