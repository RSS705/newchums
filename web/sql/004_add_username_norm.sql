-- Migration 004: Add username_norm for case-insensitive uniqueness while preserving display casing
-- Run against Neon Postgres. Requires 003 (username column) to exist.

-- 1) Add nullable column
ALTER TABLE users ADD COLUMN IF NOT EXISTS username_norm TEXT;

-- 2) Backfill: username_norm = lower(trim(username)) for rows that have username
UPDATE users
SET username_norm = lower(trim(username))
WHERE username IS NOT NULL;

-- 3) Drop old case-sensitive unique index on username (we use username_norm for uniqueness now)
DROP INDEX IF EXISTS idx_users_username;

-- 4) Unique index on username_norm (partial: only non-null; allows multiple NULLs for OAuth users)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_norm ON users (username_norm) WHERE username_norm IS NOT NULL;
