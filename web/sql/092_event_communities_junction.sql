-- Convert plan-to-community from a single optional column to a many-to-many
-- junction table. This migration is additive only: the existing
-- events.community_id column is left in place so the running API keeps
-- working until the new code is deployed. Migration 093 drops the column.
--
-- Run: psql "$DATABASE_URL" -f sql/092_event_communities_junction.sql

CREATE TABLE IF NOT EXISTS newchums.event_communities (
  event_id      UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  community_id  UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_event_communities_community
  ON newchums.event_communities (community_id);

-- Backfill the junction table from the existing single-column linkage.
INSERT INTO newchums.event_communities (event_id, community_id)
SELECT id, community_id
FROM newchums.events
WHERE community_id IS NOT NULL
ON CONFLICT DO NOTHING;
