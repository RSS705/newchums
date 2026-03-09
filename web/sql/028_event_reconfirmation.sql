-- Migration 028: Add attendance reconfirmation setting to events
--
-- require_reconfirmation: when true, attendees receive a reminder 24 hours
-- before the event asking whether they are still planning to attend.
--
-- No auto-cancel logic is applied. This column is a signal for future
-- reminder-email workflows and does not affect RSVP status automatically.
--
-- Run: psql "$DATABASE_URL" -f web/sql/028_event_reconfirmation.sql

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS require_reconfirmation BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN newchums.events.require_reconfirmation IS
  'When true, attendees receive a 24-hour-before reminder asking to reconfirm attendance. Does not trigger auto-cancel.';
