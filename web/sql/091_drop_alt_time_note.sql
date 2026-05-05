-- Drop the unused free-text note column from event_alt_times.
-- The "Note (optional)" UI was removed; the column is no longer read or
-- written by the API. Existing values are discarded.
--
-- Run: psql "$DATABASE_URL" -f sql/091_drop_alt_time_note.sql

ALTER TABLE newchums.event_alt_times DROP COLUMN IF EXISTS note;
