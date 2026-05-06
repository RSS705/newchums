-- Migration 094: Optional minimum attendees required for a plan.
--
-- Distinct from min_confirmed_attendees (the 24-hour attendance check
-- threshold). This new column is a simpler, RSVP-based threshold: if fewer
-- than `min_attendees_required` people have RSVP'd "going" 2 hours before the
-- plan starts, the cron auto-cancels the plan. The host counts toward the
-- threshold (they're auto-RSVP'd as "going" on creation), matching the same
-- "going" definition used everywhere else.
--
-- Existing plans default to NULL (no auto-cancel by RSVP threshold).
--
-- Run: psql "$DATABASE_URL" -f web/sql/094_min_attendees_required.sql

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS min_attendees_required INT NULL;

ALTER TABLE newchums.events
  ADD CONSTRAINT events_min_attendees_required_positive
    CHECK (min_attendees_required IS NULL OR min_attendees_required >= 1);

ALTER TABLE newchums.events
  ADD CONSTRAINT events_min_attendees_required_within_seats
    CHECK (
      min_attendees_required IS NULL
      OR max_seats IS NULL
      OR min_attendees_required <= max_seats
    );

COMMENT ON COLUMN newchums.events.min_attendees_required IS
  'Optional. If set, the plan auto-cancels 2 hours before starts_at when fewer than this many RSVPs are "going" (host counts). NULL = no auto-cancel by RSVP threshold.';

-- Index to help the cron find candidate plans quickly. Only indexes published
-- plans within the cutoff window so the partial index stays small.
CREATE INDEX IF NOT EXISTS idx_events_min_attendees_required_pending
  ON newchums.events (starts_at)
  WHERE min_attendees_required IS NOT NULL
    AND status = 'published';
