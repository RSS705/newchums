-- Migration 098: Schedule-block location.
--
-- Adds nullable location fields to `community_schedule_blocks` so a
-- schedule entry can carry its own venue / address. The schema mirrors
-- `communities` (location_name, location_address, location_lat,
-- location_lng) so the existing PlacesAutocompleteInput pattern slots
-- in unchanged. All four columns are nullable so existing rows
-- migrate cleanly with a "no location" state, and so the form's
-- "default to the parent community's location" UX remains a pure
-- frontend convenience rather than a forced backfill.
--
-- Run: psql "$DATABASE_URL" -f web/sql/098_community_schedule_block_location.sql

ALTER TABLE newchums.community_schedule_blocks
  ADD COLUMN IF NOT EXISTS location_name    TEXT             NULL,
  ADD COLUMN IF NOT EXISTS location_address TEXT             NULL,
  ADD COLUMN IF NOT EXISTS location_lat     DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS location_lng     DOUBLE PRECISION NULL;
