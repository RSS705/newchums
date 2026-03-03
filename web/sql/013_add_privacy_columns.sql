-- Migration 013: Add privacy columns to users table
-- Run: psql "$DATABASE_URL" -f web/sql/013_add_privacy_columns.sql
-- API uses newchums.users. If your DB uses a different schema, replace newchums.users accordingly.
--
-- Defaults to false so new users and existing users (before migration) get OFF.
-- These flags control profile visibility (enforcement implemented separately).

ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS is_hidden_from_search BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS is_hidden_from_external_indexing BOOLEAN NOT NULL DEFAULT false;
