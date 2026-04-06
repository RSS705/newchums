-- Migration 070: Precomputed local recognition badges
--
-- Stores badge results computed hourly by the cron job so the attendance-record
-- endpoint can read them cheaply instead of running expensive area-wide aggregates
-- on every profile view.
--
-- Run: psql "$DATABASE_URL" -f web/sql/070_user_badges.sql

CREATE TABLE IF NOT EXISTS newchums.user_badges (
  user_id        UUID    NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  badge_type     TEXT    NOT NULL CHECK (badge_type IN ('top_attendee', 'top_host')),
  tier           TEXT    NOT NULL CHECK (tier IN ('gold', 'silver', 'bronze')),
  count          INT     NOT NULL DEFAULT 0,
  rank           INT     NOT NULL DEFAULT 0,
  total_in_area  INT     NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, badge_type)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user
  ON newchums.user_badges (user_id);
