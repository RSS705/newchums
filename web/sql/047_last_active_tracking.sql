-- Migration 047: Add last_active_at to users for activity tracking (KPIs)
--
-- Tracks the last time a user made an authenticated API request.
-- Updated at most once per hour via the suspension-guard middleware to
-- minimise write overhead while keeping KPI windows (7d / 30d) accurate.

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Back-fill existing users with created_at so historical accounts are not
-- counted as "never active."
UPDATE newchums.users SET last_active_at = created_at WHERE last_active_at IS NULL;

-- Index for 7-day / 30-day active-user counts
CREATE INDEX IF NOT EXISTS idx_users_last_active_at
  ON newchums.users (last_active_at)
  WHERE last_active_at IS NOT NULL;

-- Index for daily-signup time-series (growth chart)
CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON newchums.users (created_at);

-- Index for daily plan-creation time-series (growth chart)
CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON newchums.events (created_at);

-- Index for plan-health queries (past published + canceled)
CREATE INDEX IF NOT EXISTS idx_events_status_starts_at
  ON newchums.events (status, starts_at);
