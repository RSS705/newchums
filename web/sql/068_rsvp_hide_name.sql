-- Migration 068: Add per-plan "hide my name" option to event RSVPs
--
-- When true, the user's real name is hidden from other attendees on this plan.
-- Their @handle remains visible. Admin/super_admin contexts still see the real name.
--
-- Run: psql "$DATABASE_URL" -f web/sql/068_rsvp_hide_name.sql

ALTER TABLE newchums.event_rsvps
  ADD COLUMN IF NOT EXISTS hide_name BOOLEAN NOT NULL DEFAULT false;
