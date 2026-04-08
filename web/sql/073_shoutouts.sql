-- Migration 073: Shout-outs (moderated post-plan positive notes)
--
-- Adds a lightweight moderated note one participant can leave another after a
-- plan they both attended. Notes are reviewed by a super admin; on approval the
-- recipient gets a bell notification (no email) and the note appears in a
-- private "Shout-outs received" section on their own /profile page.
--
-- Rules enforced at the schema level:
--   - one shout-out per (plan, sender, recipient) — `shoutouts_unique_per_slot`
--   - sender ≠ recipient                          — `shoutouts_no_self`
--   - status ∈ pending|approved|rejected           — `shoutouts_status_valid`
--
-- The "locked after moderation" rule (a sender cannot edit a shout-out once
-- it has been approved or rejected) is enforced in the API handler by gating
-- the ON CONFLICT UPDATE on `shoutouts.status = 'pending'`.
--
-- Run: psql "$DATABASE_URL" -f sql/073_shoutouts.sql

CREATE TABLE IF NOT EXISTS newchums.shoutouts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  sender_user_id      UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  recipient_user_id   UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  message             TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by_user_id UUID        REFERENCES newchums.users(id) ON DELETE SET NULL,

  CONSTRAINT shoutouts_no_self         CHECK (sender_user_id <> recipient_user_id),
  CONSTRAINT shoutouts_status_valid    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT shoutouts_unique_per_slot UNIQUE (plan_id, sender_user_id, recipient_user_id)
);

-- Recipient lookup for the private profile section: only approved rows, newest first.
CREATE INDEX IF NOT EXISTS idx_shoutouts_recipient_approved
  ON newchums.shoutouts (recipient_user_id, created_at DESC)
  WHERE status = 'approved';

-- Admin moderation queue: pending only, newest first.
CREATE INDEX IF NOT EXISTS idx_shoutouts_pending
  ON newchums.shoutouts (created_at DESC)
  WHERE status = 'pending';

-- Sender lookup so the feedback form can hydrate per-attendee draft state in
-- one query when the user re-opens a plan they've already shouted on.
CREATE INDEX IF NOT EXISTS idx_shoutouts_sender_plan
  ON newchums.shoutouts (sender_user_id, plan_id);
