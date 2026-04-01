-- Migration 065: QA plan support
-- Adds is_qa flag to events for production-safe QA testing by super admins.
-- QA plans are fully isolated from normal users across all system surfaces.
ALTER TABLE newchums.events ADD COLUMN IF NOT EXISTS is_qa BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient filtering of QA plans in all event queries
CREATE INDEX IF NOT EXISTS idx_events_is_qa ON newchums.events (is_qa) WHERE is_qa = true;
