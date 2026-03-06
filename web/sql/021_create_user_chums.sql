-- Migration 021: Create user_chums table for one-way Chum relationships
--
-- A Chum relationship is intentionally one-way (no approval required).
-- user_id   = the person who added the Chum
-- chum_user_id = the person who was added

CREATE TABLE IF NOT EXISTS newchums.user_chums (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  chum_user_id  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_chums_no_self UNIQUE (user_id, chum_user_id),
  CONSTRAINT user_chums_no_self_chum CHECK (user_id <> chum_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_chums_user_id
  ON newchums.user_chums (user_id);

CREATE INDEX IF NOT EXISTS idx_user_chums_chum_user_id
  ON newchums.user_chums (chum_user_id);
