-- Migration 059: Add status column to communities for soft-close
--
-- Allows community owners to close a community without deleting data.
-- Closed communities are hidden from listings and inaccessible to
-- non-admin users. Linked events have their community_id set to NULL.
--
-- Run: psql "$DATABASE_URL" -f web/sql/059_community_status.sql

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Only add the constraint if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_status_check'
  ) THEN
    ALTER TABLE newchums.communities
      ADD CONSTRAINT communities_status_check CHECK (status IN ('active', 'closed'));
  END IF;
END$$;
