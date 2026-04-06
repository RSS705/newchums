-- Migration 066: Add 'planned' status to roadmap items
--
-- Also updates the CHECK constraint to include the new status.
--
-- Run: psql "$DATABASE_URL" -f web/sql/066_roadmap_planned_status.sql

ALTER TABLE newchums.roadmap_items
  DROP CONSTRAINT IF EXISTS roadmap_items_status_check;

ALTER TABLE newchums.roadmap_items
  ADD CONSTRAINT roadmap_items_status_check
  CHECK (status IN ('received', 'needs_clarification', 'in_progress', 'planned', 'completed', 'not_planned'));
