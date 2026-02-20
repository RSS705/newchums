-- Down migration for 003: Remove username column from users
-- Run manually if rollback is needed. Ensure no application code depends on username before running.

DROP INDEX IF EXISTS idx_users_username;
ALTER TABLE users DROP COLUMN IF EXISTS username;
