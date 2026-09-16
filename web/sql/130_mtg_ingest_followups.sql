-- Migration 130: MTG stats ingest, review follow-ups (Batch 5).
--
-- Two columns on the attempt log:
--   dry_run     an admin's rehearsal. The feed is fetched, matched and checked
--               and the attempt recorded, but no standings are published, so
--               card matching can be tried before the season's first morning.
--   alert_kind  which alert the day has already sent, so a bad day can send
--               its first failure and an end-of-day summary, and no more.
--               `alerted` stays as the flag the admin page shows.
--
-- Run: psql "$DATABASE_URL" -f web/sql/130_mtg_ingest_followups.sql

ALTER TABLE newchums.mtg_ingest_runs ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE newchums.mtg_ingest_runs ADD COLUMN IF NOT EXISTS alert_kind TEXT NULL;

ALTER TABLE newchums.mtg_ingest_runs DROP CONSTRAINT IF EXISTS mtg_ingest_runs_alert_kind_check;
ALTER TABLE newchums.mtg_ingest_runs
  ADD CONSTRAINT mtg_ingest_runs_alert_kind_check CHECK (alert_kind IS NULL OR alert_kind IN ('first', 'final'));
