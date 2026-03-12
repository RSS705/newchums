-- Migration 032: Reserve seats for invited people
--
-- Adds events.reserve_seats — when enabled, pending invites count against
-- available seats until the invitee responds. Declined invites release their
-- seat; Maybe keeps it held.

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS reserve_seats BOOLEAN NOT NULL DEFAULT FALSE;

-- Run: psql "$DATABASE_URL" -f web/sql/032_event_reserve_seats.sql
