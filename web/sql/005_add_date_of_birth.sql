-- Migration 005: Add date_of_birth to users
-- Run against Neon Postgres. Requires users table (001) to exist.
-- Nullable to allow existing users and OAuth users (created via getOrCreateAppUser) to remain valid.
-- New credential signups will be required to provide date_of_birth (enforced by API validation).

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
