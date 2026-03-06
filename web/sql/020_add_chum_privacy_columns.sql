-- Migration 020: Add Chum-related privacy columns to users table
--
-- is_hidden_chum_list:
--   Owner's setting. When true, the Chum list section is hidden on their public profile.
--   Other users' private Chum lists are unaffected.
--
-- is_hidden_from_chum_lists:
--   Individual's setting. When true, this user will not appear in the public Chum list
--   section on other users' public profiles. They still appear on private Chum lists
--   for users who have already added them.
--
-- Both default to false so existing users see no change in behaviour.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_hidden_chum_list        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden_from_chum_lists  BOOLEAN NOT NULL DEFAULT false;
