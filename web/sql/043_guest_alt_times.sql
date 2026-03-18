-- Migration 043: Allow guest (unauthenticated) alternate time suggestions
--
-- Mirrors the pattern from migration 035 (guest RSVPs):
-- make user_id nullable and add guest_email for invitees without an account.
--
-- Run: psql "$DATABASE_URL" -f sql/043_guest_alt_times.sql

ALTER TABLE newchums.event_alt_times
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE newchums.event_alt_times
  ADD COLUMN IF NOT EXISTS guest_email TEXT NULL;
