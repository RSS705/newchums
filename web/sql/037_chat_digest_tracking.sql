-- Migration 037: Add chat_digest_sent_at to user_profile
--
-- Tracks when the daily unread-chat digest email was last sent to each user.
-- Used to enforce once-per-day sending and avoid re-notifying for unchanged state.

ALTER TABLE newchums.user_profile
  ADD COLUMN IF NOT EXISTS chat_digest_sent_at TIMESTAMPTZ NULL;
