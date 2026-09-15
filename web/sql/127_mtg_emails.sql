-- Migration 127: MTG Prediction Challenge emails (Batch 3).
--
-- mtg_email_log is the guarantee behind "nobody gets the same email twice"
-- (spec section 8): a row is written when an email is queued, keyed by
-- player, set, email type and period (the ISO week for weekly standings,
-- empty otherwise).
--
-- Season emails reuse the existing email outbox for delivery and retries.
-- They are not about a plan, so event_id becomes optional and set_id names
-- the season instead; every row must name one or the other. The identity
-- index is rebuilt to treat the two alike. Existing code inserts with a bare
-- ON CONFLICT DO NOTHING, which works with the new index. The new API reads
-- email_outbox.set_id, so apply this BEFORE deploying the API: deploying the
-- API first would stop every outbox email until the migration ran.
--
-- Run: psql "$DATABASE_URL" -f web/sql/127_mtg_emails.sql

CREATE TABLE IF NOT EXISTS newchums.mtg_email_log (
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  set_id     UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  email_type TEXT        NOT NULL CHECK (email_type IN ('welcome', 'lock_warning', 'revealed', 'weekly', 'results')),
  period     TEXT        NOT NULL DEFAULT '',
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_id, email_type, period)
);

ALTER TABLE newchums.email_outbox ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE newchums.email_outbox
  ADD COLUMN IF NOT EXISTS set_id UUID NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_outbox_names_a_subject') THEN
    ALTER TABLE newchums.email_outbox
      ADD CONSTRAINT email_outbox_names_a_subject CHECK (event_id IS NOT NULL OR set_id IS NOT NULL);
  END IF;
END $$;

-- New identity first, so uniqueness is never missing, then retire the old one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_identity_v2
  ON newchums.email_outbox (kind, COALESCE(event_id::text, set_id::text, ''), user_id, COALESCE(group_key, ''));
DROP INDEX IF EXISTS newchums.idx_email_outbox_identity;
