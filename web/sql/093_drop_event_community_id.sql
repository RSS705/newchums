-- Drop the legacy single-community column from events. Apply only AFTER the
-- API and web have been deployed with the multi-community code from
-- migration 092 onwards. The new code reads/writes newchums.event_communities
-- exclusively.
--
-- Run: psql "$DATABASE_URL" -f sql/093_drop_event_community_id.sql

ALTER TABLE newchums.events DROP COLUMN IF EXISTS community_id;
