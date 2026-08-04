-- Migration 113: daily "you got a shout-out" email bookkeeping.
--
-- Approving a shout-out has always created a bell notification and nothing
-- else, so a recipient who doesn't return to the site never learns about it
-- (at launch, 6 of 8 approved shout-outs had never been read). A daily job
-- now emails them; this column marks a shout-out as handled by that job, so
-- it is emailed at most once ever.
--
-- Backfill decision (Rob, 4 Aug 2026): only shout-outs approved in the last
-- 4 days should generate a first email. Everything older is stamped here as
-- already handled, so the first run cannot mail people about compliments
-- from June. Pending and rejected rows are deliberately left NULL: a
-- pending one still deserves its email if it is approved later, and the job
-- only ever looks at approved rows.

ALTER TABLE newchums.shoutouts
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ NULL;

UPDATE newchums.shoutouts
SET notified_at = NOW()
WHERE notified_at IS NULL
  AND status = 'approved'
  AND (reviewed_at IS NULL OR reviewed_at < NOW() - INTERVAL '4 days');

-- The daily scan's predicate.
CREATE INDEX IF NOT EXISTS idx_shoutouts_notice_pending
  ON newchums.shoutouts (reviewed_at)
  WHERE notified_at IS NULL AND status = 'approved';

-- The outbox's uniqueness is (kind, event_id, user_id), which is right for
-- one-message-per-plan-per-person jobs but wrong here: two guests can thank
-- the same host for the same plan, and each of those is its own message.
-- A nullable group key widens the key without disturbing existing rows
-- (COALESCE keeps NULL behaving exactly as before for every other kind).
ALTER TABLE newchums.email_outbox
  ADD COLUMN IF NOT EXISTS group_key TEXT NULL;

ALTER TABLE newchums.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_kind_event_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_outbox_identity
  ON newchums.email_outbox (kind, event_id, user_id, COALESCE(group_key, ''));
