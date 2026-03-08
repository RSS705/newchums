-- Migration 025: Multi-hobby support for events + banner image
-- Run after 024_create_events.sql

-- Junction table for event <-> interest many-to-many
CREATE TABLE IF NOT EXISTS newchums.event_interests (
  event_id UUID NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  interest_id UUID NOT NULL REFERENCES newchums.interests(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, interest_id)
);

CREATE INDEX IF NOT EXISTS idx_event_interests_event ON newchums.event_interests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_interests_interest ON newchums.event_interests(interest_id);

-- Migrate existing single-hobby data into the junction table
INSERT INTO newchums.event_interests (event_id, interest_id)
SELECT id, interest_id FROM newchums.events WHERE interest_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Add banner_key column to events
ALTER TABLE newchums.events ADD COLUMN IF NOT EXISTS banner_key TEXT NULL;
