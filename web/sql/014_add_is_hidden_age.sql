-- Migration 014: Add is_hidden_age to users table
-- Run: psql "$DATABASE_URL" -f web/sql/014_add_is_hidden_age.sql
--
-- Default false so new users (OAuth or credentials) get age visible.
-- When true, age is not shown on public profile.

ALTER TABLE newchums.users ADD COLUMN IF NOT EXISTS is_hidden_age BOOLEAN NOT NULL DEFAULT false;
