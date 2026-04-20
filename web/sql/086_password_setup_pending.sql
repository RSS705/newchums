-- Migration 086: password_setup_pending flag on users
--
-- Adds an explicit "account setup incomplete" state distinct from the
-- overloaded password_hash IS NULL check, which previously conflated
-- Google-OAuth-only users with lightweight-plan-signup users who never
-- set a password. With this flag the product can reason cleanly about:
--
--   - OAuth-only accounts          password_hash IS NULL, pending = FALSE
--   - Full credential accounts     password_hash set,     pending = FALSE
--   - Lightweight-signup accounts  password_hash IS NULL, pending = TRUE
--   - Lightweight + password set   password_hash set,     pending = FALSE
--
-- The flag is flipped FALSE any time a password is set (plan-signup with
-- password, settings > set password, or a successful password reset).
--
-- Run: psql "$DATABASE_URL" -f web/sql/086_password_setup_pending.sql

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS password_setup_pending BOOLEAN NOT NULL DEFAULT FALSE;

-- Sparse index: only pending rows are interesting (the unfinished tail).
-- Keeps the index small even as the user table grows.
CREATE INDEX IF NOT EXISTS idx_users_password_setup_pending
  ON newchums.users(password_setup_pending)
  WHERE password_setup_pending = TRUE;
