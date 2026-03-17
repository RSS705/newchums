-- Migration 040: Legal acceptance tracking
-- Adds columns to users table to record when and which version of
-- Terms of Use and Privacy Policy the user accepted at signup.
-- Run: psql "$DATABASE_URL" -f web/sql/040_legal_acceptance.sql

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS accepted_terms_version   TEXT         NULL,
  ADD COLUMN IF NOT EXISTS accepted_privacy_version TEXT         NULL,
  ADD COLUMN IF NOT EXISTS accepted_legal_at        TIMESTAMPTZ  NULL;
