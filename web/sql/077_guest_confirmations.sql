-- Migration 077: Guest attendance confirmations
--
-- Extends event_confirmations to support guest attendees (invited by email,
-- RSVP'd without an account). Guests are identified by guest_email when
-- user_id is NULL, mirroring the pattern used in event_rsvps (migration 035).
--
-- Run: psql "$DATABASE_URL" -f web/sql/077_guest_confirmations.sql

-- Allow guest confirmations (user_id NULL, guest_email set)
ALTER TABLE newchums.event_confirmations
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE newchums.event_confirmations
  ADD COLUMN IF NOT EXISTS guest_email TEXT;

-- Replace the single unique index with two partial indexes:
-- one for registered users, one for guests.
DROP INDEX IF EXISTS newchums.idx_event_confirmations_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_confirmations_user_unique
  ON newchums.event_confirmations (event_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_confirmations_guest_unique
  ON newchums.event_confirmations (event_id, guest_email)
  WHERE guest_email IS NOT NULL;
