-- Migration 015: Add moderation columns to interests table, add role to users
-- Run: psql "$DATABASE_URL" -f web/sql/015_interests_moderation.sql

-- Add role column to users ('super_admin', etc.)
ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS role TEXT NULL;

-- Add tracking / moderation columns to interests
ALTER TABLE newchums.interests
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_by_user_id UUID NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id UUID NULL;

CREATE INDEX IF NOT EXISTS idx_interests_is_deleted
  ON newchums.interests (is_deleted);
