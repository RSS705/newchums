-- Migration 009: Add bio to user_profile
-- Run against Neon Postgres. Requires user_profile table to exist.
-- Max 500 characters; nullable.

ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS bio VARCHAR(500);
