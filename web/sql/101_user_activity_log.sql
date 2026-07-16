-- Migration 101: per-request user activity log (super-admin behavior drill-in)
--
-- users.last_active_at (migration 047) powers the KPI active-user counts but
-- is throttled to one write per hour, so it cannot answer "which accounts are
-- active, when, and what are they doing." This table records one row per
-- authenticated API request, written fire-and-forget from the suspension-guard
-- middleware. Query strings are never stored (magic-link and invite tokens
-- travel in query params). Rows older than 90 days are deleted by the hourly
-- cron in the API worker.
--
-- Surfaced at /admin/kpis/activity (all users) and in the per-user
-- "Recent Activity" section of /admin/chums/[id], both via GET /admin/activity.

CREATE TABLE IF NOT EXISTS newchums.user_activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  route TEXT,
  status SMALLINT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-user timeline (User Diagnostics "Recent Activity")
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_time
  ON newchums.user_activity_log (user_id, occurred_at DESC);

-- Global timeline + retention delete
CREATE INDEX IF NOT EXISTS idx_user_activity_log_time
  ON newchums.user_activity_log (occurred_at DESC);
