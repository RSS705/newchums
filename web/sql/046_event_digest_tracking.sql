-- Migration 046: Add event_digest_sent_at to user_profile
--
-- Tracks when the daily event-match digest email was last sent to each user.
-- Used to enforce once-per-day sending and avoid re-notifying about the same plans.

ALTER TABLE newchums.user_profile
  ADD COLUMN IF NOT EXISTS event_digest_sent_at TIMESTAMPTZ NULL;
