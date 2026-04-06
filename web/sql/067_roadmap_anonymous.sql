-- Migration 067: Add anonymous submission support to roadmap items
--
-- Adds a boolean column so users can submit feedback anonymously.
-- Public endpoints mask the author; admin endpoints always show the real author.
--
-- Run: psql "$DATABASE_URL" -f web/sql/067_roadmap_anonymous.sql

ALTER TABLE newchums.roadmap_items
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;
