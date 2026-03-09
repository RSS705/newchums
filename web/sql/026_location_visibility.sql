-- Migration 026: Add location visibility for in-person events
--
-- location_visibility: who can see the exact venue/address
--   - exact_everyone: full address visible everywhere (default, backwards compatible)
--   - exact_joined_only: exact address only visible to host + invitees/RSVPs
--   - approximate_only: never show exact; everyone sees location_area only
--
-- location_area: cached approximate area text (e.g. "Seattle, WA") for approximate display
--
-- Run: psql "$DATABASE_URL" -f web/sql/026_location_visibility.sql

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS location_visibility TEXT NOT NULL DEFAULT 'exact_everyone',
  ADD COLUMN IF NOT EXISTS location_area TEXT NULL;

ALTER TABLE newchums.events
  DROP CONSTRAINT IF EXISTS events_location_visibility_check;

ALTER TABLE newchums.events
  ADD CONSTRAINT events_location_visibility_check
  CHECK (location_visibility IN ('exact_everyone', 'exact_joined_only', 'approximate_only'));

COMMENT ON COLUMN newchums.events.location_visibility IS 'Who can see exact location: exact_everyone | exact_joined_only | approximate_only';
COMMENT ON COLUMN newchums.events.location_area IS 'Approximate area for privacy mode (e.g. Seattle, WA)';
