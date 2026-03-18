-- Migration 044: Track when super admins last viewed each admin section
--
-- Used to compute badge counts for new items since the admin's last visit.
-- section values: 'users', 'interests', 'plans'
--
-- Run: psql "$DATABASE_URL" -f sql/044_admin_view_timestamps.sql

CREATE TABLE IF NOT EXISTS newchums.admin_view_timestamps (
  admin_user_id  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  section        TEXT        NOT NULL,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (admin_user_id, section)
);
