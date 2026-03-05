-- Migration 016: Add merged_into_interest_id to interests table
-- Run: psql "$DATABASE_URL" -f web/sql/016_interests_merged_into.sql
--
-- Tracks which active (canonical) interest a soft-deleted interest was merged into.
-- Used to auto-remap users who type a deleted interest name to the canonical one.

ALTER TABLE newchums.interests
  ADD COLUMN IF NOT EXISTS merged_into_interest_id UUID NULL;
