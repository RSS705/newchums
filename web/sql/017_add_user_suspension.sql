-- Migration 017: Add user suspension fields to users table
-- Allows super_admin to suspend accounts; suspended users cannot log in or use the API.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_suspended       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspended_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS suspended_by_user_id UUID       NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason  TEXT        NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_suspended
  ON users (is_suspended)
  WHERE is_suspended = true;
