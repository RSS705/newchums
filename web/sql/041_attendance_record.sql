-- Migration 041: Attendance record support
-- Adds committed_at to event_rsvps so we can accurately track follow-through:
-- once a user RSVPs "going," committed_at is set and never cleared, even if
-- they later change to "cant_make_it." This lets us distinguish "backed out of
-- a commitment" from "directly declined without ever committing."
-- (July 2026 amendment: one deliberate exception now exists. The host-initiated
-- date-change reconfirmation reset in PATCH /events/:id clears committed_at on
-- the Going rows it flips to Maybe, because the commitment was to the old time
-- and the host's change must not read as the attendee backing out. See
-- docs/Technical_Specs.md, Attendance Record.)
-- Run: psql "$DATABASE_URL" -f web/sql/041_attendance_record.sql

ALTER TABLE newchums.event_rsvps
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ NULL;

-- Backfill: for all existing "going" RSVPs, set committed_at to created_at
-- (best available approximation of when the user first committed).
UPDATE newchums.event_rsvps
  SET committed_at = created_at
  WHERE status = 'going' AND committed_at IS NULL;

-- Index to support attendance-record queries (per-user aggregate over past events).
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_committed
  ON newchums.event_rsvps (user_id, committed_at)
  WHERE committed_at IS NOT NULL;
