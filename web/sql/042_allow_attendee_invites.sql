-- Migration 042: Add allow_attendee_invites to events
--
-- When true (default), Going attendees can invite other people to the plan.
-- The host can toggle this on/off at any time.
--
-- Run: psql "$DATABASE_URL" -f sql/042_allow_attendee_invites.sql

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS allow_attendee_invites BOOLEAN NOT NULL DEFAULT true;
