-- Migration 010: Add avatar_key and avatar_updated_at for R2-backed avatar uploads
-- API uses newchums.users. If your DB uses a different schema, replace newchums.users accordingly.
-- Run: psql "$DATABASE_URL" -f web/sql/010_add_avatar_to_users.sql

ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS avatar_key TEXT NULL;
ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ NULL;
