-- Migration 112: day-before reminder bookkeeping.
--
-- Plans WITHOUT the 24-hour attendance check get a plain reminder email the
-- day before (the check's confirmation request covers plans that have it, so
-- nobody hears twice). This column marks a plan as considered by that scan,
-- sent or skipped, so a plan is only ever considered once.
--
-- Backfill: anything already inside or past the send window at migration
-- time is stamped, so the first cron run has no backlog to blast (the
-- run-it-again launch nearly emailed a 31-plan backlog before the same
-- guard was added there).

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS reminder_processed_at TIMESTAMPTZ NULL;

UPDATE newchums.events
SET reminder_processed_at = NOW()
WHERE reminder_processed_at IS NULL
  AND starts_at <= NOW() + INTERVAL '24 hours';

CREATE INDEX IF NOT EXISTS idx_events_reminder_pending
  ON newchums.events (starts_at)
  WHERE reminder_processed_at IS NULL AND status = 'published';
