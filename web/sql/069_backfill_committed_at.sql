-- Migration 069: Backfill committed_at for RSVPs missing it
--
-- The join-request approval path (POST /events/:id/join-request/:id/approve)
-- was inserting RSVPs with status='going' but without setting committed_at.
-- This caused those attendees' Chum Stats to show 0/0 for "Going follow-through"
-- and "Shows up" since the attendance-record queries filter on committed_at IS NOT NULL.
--
-- This backfill sets committed_at to created_at for any going RSVP still missing it.
--
-- Run: psql "$DATABASE_URL" -f web/sql/069_backfill_committed_at.sql

UPDATE newchums.event_rsvps
  SET committed_at = created_at
  WHERE status = 'going'
    AND committed_at IS NULL
    AND user_id IS NOT NULL;
