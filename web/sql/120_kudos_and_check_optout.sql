-- 120: Kudos (replaces the text shout-outs) and an attendance-check opt-out marker.
--
-- Kudos are fixed tags (catalogue lives in api/src/lib/kudos.ts) that one
-- attendee gives another after a plan. No free text, no moderation queue,
-- and profiles show aggregated counts only, so a viewer never sees who gave
-- what. One row per (plan, giver, recipient); the giver may change the tag
-- or retract it while the 7-day window is open.
CREATE TABLE IF NOT EXISTS newchums.kudos (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id            UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  giver_user_id      UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  recipient_user_id  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  tag                TEXT        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Stamped by the daily digest whether it emailed or skipped, so nobody
  -- hears about the same kudos twice.
  notified_at        TIMESTAMPTZ NULL,
  CONSTRAINT kudos_no_self          CHECK (giver_user_id <> recipient_user_id),
  CONSTRAINT kudos_unique_per_slot  UNIQUE (plan_id, giver_user_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_kudos_recipient
  ON newchums.kudos (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kudos_giver_plan
  ON newchums.kudos (giver_user_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_kudos_unnotified
  ON newchums.kudos (created_at) WHERE notified_at IS NULL;

-- Attendance check: people who turned off the confirmation emails were still
-- given a pending row, which expired and read as "didn't confirm" to the host
-- and as an unanswered check on their profile. The cron now marks those rows
-- so the host sees "not asked" and the profile stat leaves them out.
ALTER TABLE newchums.event_confirmations
  ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN NOT NULL DEFAULT false;
