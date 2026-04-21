-- Migration 087: community operating hours (optional, free for all communities)
--
-- Adds a single JSONB column for day-by-day open/close times so the schema
-- stays narrow and the feature can expand later (per-season hours, per-day
-- notes, etc.) without another ALTER.
--
-- Shape stored in the column (null or missing days = "no hours published"
-- for that day; the UI renders nothing for those days, not "closed"):
--
--   {
--     "mon": { "open": "09:00", "close": "17:00" },
--     "tue": { "closed": true },
--     "wed": { "open": "09:00", "close": "17:00" },
--     ...
--   }
--
-- Rules enforced in the API:
--   - keys are the short weekday codes: mon, tue, wed, thu, fri, sat, sun
--   - each value is either { closed: true } or { open: "HH:MM", close: "HH:MM" }
--   - times are 24-hour zero-padded local-time strings; "00:00" to "23:59"
--   - close may be earlier than open when the venue closes after midnight;
--     the UI renders that as "next day" rather than rejecting it.
--   - storing {} (empty object) is equivalent to NULL (no hours published).
--
-- Run: psql "$DATABASE_URL" -f web/sql/087_community_operating_hours.sql

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS operating_hours JSONB;

-- No index needed, the column is only read on community-detail fetches and
-- never filtered on server-side.
