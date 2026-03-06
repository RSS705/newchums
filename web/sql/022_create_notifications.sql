-- Migration 022: Create general notifications table
--
-- Designed to be extensible for future notification types beyond chum_added_you.
--
-- user_id       = the recipient (the person who receives the notification)
-- actor_user_id = the person who performed the action (nullable for system notifications)
-- entity_id     = optional reference to a related entity (e.g. event id) for future use
-- metadata      = optional JSONB for type-specific extra data
-- read_at       = null means unread; set to NOW() when the user views it

CREATE TABLE IF NOT EXISTS newchums.notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL,
  actor_user_id   UUID        NULL     REFERENCES newchums.users(id) ON DELETE SET NULL,
  entity_id       UUID        NULL,
  metadata        JSONB       NULL,
  read_at         TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON newchums.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON newchums.notifications (user_id)
  WHERE read_at IS NULL;
