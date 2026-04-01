-- Migration 064: Add composite index for RSVP count queries
-- Speeds up going/maybe count subqueries in explore feed, event details, and digests
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_rsvps_event_status
  ON newchums.event_rsvps (event_id, status);
