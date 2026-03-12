-- Migration 031: Store IANA timezone on events
--
-- Adds events.timezone so that email notifications and other server-side
-- date formatting can render the correct local time instead of UTC.
-- Defaults to 'UTC' for existing rows (safe fallback).

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Run: psql "$DATABASE_URL" -f web/sql/031_event_timezone.sql
