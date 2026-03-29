-- Migration 063: Optional availability deadline for Request availability mode
-- When a host uses "Request availability" alt-times mode, they can set an optional
-- deadline by which attendees should submit their availability.
-- Run: psql "$DATABASE_URL" -f web/sql/063_availability_deadline.sql

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS availability_deadline_at TIMESTAMPTZ NULL;
