-- Migration 056: Add attachment support to roadmap items
--
-- Stores the R2 object key for an optional screenshot / image attachment.
--
-- Run: psql "$DATABASE_URL" -f web/sql/056_roadmap_attachment.sql

ALTER TABLE newchums.roadmap_items
  ADD COLUMN IF NOT EXISTS attachment_key TEXT NULL;
