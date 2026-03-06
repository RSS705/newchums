-- Migration 019: Add profile_theme field to users table
-- Stores the user's chosen public profile card color theme.
-- Allowed values enforced in application code:
--   default | warm_sand | soft_blue | sage | lavender | blush
-- NULL and 'default' are both treated as the standard white card appearance.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_theme TEXT NULL;
