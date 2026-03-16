-- Migration 038: Add ends_at to event_alt_times
--
-- Supports collaborative alternate-time scheduling where entries have
-- both a start time (suggested_at) and an optional end time (ends_at).

ALTER TABLE newchums.event_alt_times
  ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ NULL;
