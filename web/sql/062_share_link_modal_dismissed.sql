-- Migration 062: Share link modal dismissed flag
-- Tracks whether the user has dismissed the first-use share link info modal.
-- Run: psql "$DATABASE_URL" -f web/sql/062_share_link_modal_dismissed.sql

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS share_link_modal_dismissed BOOLEAN NOT NULL DEFAULT false;
