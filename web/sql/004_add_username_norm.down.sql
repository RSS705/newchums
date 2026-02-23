-- Down migration for 004: Remove username_norm, restore idx_users_username
DROP INDEX IF EXISTS idx_users_username_norm;
ALTER TABLE users DROP COLUMN IF EXISTS username_norm;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);
