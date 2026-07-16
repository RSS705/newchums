-- Migration 102: direct messages ("Inbox")
--
-- 1:1 async messaging between users, framed as an email-like Inbox rather
-- than real-time chat (no websockets; plain request/response + light polling).
-- Purpose: staying in touch with people you met through plans (exchange
-- contact details, etc.) without broadcasting to a whole plan chat.
--
-- Reachability is governed by users.dm_privacy (new-conversation gate only;
-- replies inside an existing conversation are always allowed) plus per-user
-- blocks which silence both directions and beat every setting.
--
-- Email notification model: at most one email per conversation until the
-- recipient reads it (dm_participant_state.notified_at is set when the email
-- goes out and cleared when the thread is read). Gated by the new
-- 'direct_message' notification preference key.
--
-- Conduct reports gain DM support: plan_id becomes nullable, and DM reports
-- carry a dm_conversation_id plus a dm_evidence JSONB snapshot of the recent
-- messages at report time. Admins never get a browse-all-messages view;
-- message content reaches admins only through a report's evidence snapshot.
--
-- All FKs cascade from users(id), so DELETE /account needs no changes.

-- One row per user pair. Canonical ordering (user_a < user_b) makes the
-- pair unique regardless of who messaged first; created_by records the
-- initiator for the new-conversation rate limit.
CREATE TABLE IF NOT EXISTS newchums.dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_a ON newchums.dm_conversations (user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_user_b ON newchums.dm_conversations (user_b, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_created_by ON newchums.dm_conversations (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS newchums.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES newchums.dm_conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON newchums.dm_messages (conversation_id, created_at DESC);

-- Per-participant conversation state. last_read_at drives unread counts;
-- notified_at implements the once-per-conversation email throttle;
-- archived_at is reserved for a future per-side archive (no UI yet).
CREATE TABLE IF NOT EXISTS newchums.dm_participant_state (
  conversation_id UUID NOT NULL REFERENCES newchums.dm_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

-- Blocks silence messaging in both directions and beat every privacy
-- setting. Not disclosed to the blocked user (sends fail with the same
-- generic error as privacy denials).
CREATE TABLE IF NOT EXISTS newchums.user_blocks (
  blocker_user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON newchums.user_blocks (blocked_user_id);

-- Who can start a new conversation with this user. Replies within an
-- existing conversation bypass this (you opted in by messaging them).
ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS dm_privacy TEXT NOT NULL DEFAULT 'everyone'
  CHECK (dm_privacy IN ('everyone', 'chums_and_plans', 'no_one'));

-- Conduct reports: support DM-sourced reports alongside plan-sourced ones.
-- dm_evidence snapshots the recent messages at report time so the report
-- stays reviewable even if the conversation or accounts disappear.
ALTER TABLE newchums.conduct_reports
  ALTER COLUMN plan_id DROP NOT NULL;
ALTER TABLE newchums.conduct_reports
  ADD COLUMN IF NOT EXISTS dm_conversation_id UUID REFERENCES newchums.dm_conversations(id) ON DELETE SET NULL;
ALTER TABLE newchums.conduct_reports
  ADD COLUMN IF NOT EXISTS dm_evidence JSONB;
