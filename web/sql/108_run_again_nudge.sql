-- Migration 108: "Run it again" nudge bookkeeping
--
-- Two days after a plan wraps up, the hourly cron nudges the host (bell +
-- email) to run it again via the existing ?copy_from= duplication path.
-- This column marks a plan as processed by that scan, whether a nudge was
-- sent or the plan was excluded, so a plan is only ever considered once.
--
-- The backfill stamps everything already outside the nudge window at
-- migration time. Without it, the first cron run after deploy would treat
-- the entire history as an unprocessed backlog and blast every past host.

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS run_again_nudge_processed_at TIMESTAMPTZ NULL;

UPDATE newchums.events
SET run_again_nudge_processed_at = NOW()
WHERE run_again_nudge_processed_at IS NULL
  AND starts_at <= NOW() - INTERVAL '48 hours';

-- The hourly scan's predicate: published plans not yet processed. Partial
-- index keeps it a no-op-cheap probe as events grows.
CREATE INDEX IF NOT EXISTS idx_events_run_again_pending
  ON newchums.events (starts_at)
  WHERE run_again_nudge_processed_at IS NULL AND status = 'published';
