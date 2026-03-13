-- Migration 035: Support guest RSVPs for email-only invitees
--
-- Allows invited-by-email recipients who don't have a NewChums account
-- to RSVP to a plan without signing up. Guest RSVPs have user_id = NULL
-- and are identified by guest_email instead.
--
-- Run: psql "$DATABASE_URL" -f web/sql/035_guest_rsvps.sql

-- Allow RSVP rows without a user account
ALTER TABLE newchums.event_rsvps ALTER COLUMN user_id DROP NOT NULL;

-- Store the guest's email and display name
ALTER TABLE newchums.event_rsvps ADD COLUMN IF NOT EXISTS guest_email TEXT NULL;
ALTER TABLE newchums.event_rsvps ADD COLUMN IF NOT EXISTS guest_name  TEXT NULL;

-- One guest RSVP per email per event
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_rsvps_guest_email
  ON newchums.event_rsvps (event_id, guest_email)
  WHERE user_id IS NULL AND guest_email IS NOT NULL;
