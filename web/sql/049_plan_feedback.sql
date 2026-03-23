-- Migration 049: Plan feedback, attendance issues, conduct reports, user metrics
--
-- Foundation for the Chum Preferences / matching-quality system.
--
-- Tables:
--   plan_feedback      — per-attendee prompt responses (reliability, sociability, etc.)
--   attendance_issues  — structured attendance problem reports (no-show, late cancel, etc.)
--   conduct_reports    — safety/behavioral concern reports
--   user_metrics       — aggregated hidden quality scores per user
--
-- Also adds feedback_email_sent_at to events for cron-based email scheduling.

-- ── plan_feedback ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.plan_feedback (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  reviewer_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  reviewee_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  prompt           TEXT        NOT NULL,
  response         TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plan_feedback_prompt_check   CHECK (prompt IN ('reliability', 'sociability', 'presentation', 'match_quality', 'hosting_skills')),
  CONSTRAINT plan_feedback_response_check CHECK (response IN ('agree', 'maybe', 'disagree')),
  CONSTRAINT plan_feedback_no_self        CHECK (reviewer_user_id <> reviewee_user_id),
  UNIQUE (plan_id, reviewer_user_id, reviewee_user_id, prompt)
);

CREATE INDEX IF NOT EXISTS idx_plan_feedback_plan      ON newchums.plan_feedback (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_feedback_reviewer  ON newchums.plan_feedback (reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_plan_feedback_reviewee  ON newchums.plan_feedback (reviewee_user_id);

-- ── attendance_issues ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.attendance_issues (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  reporter_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  reported_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  issue_type       TEXT        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT attendance_issues_type_check CHECK (issue_type IN ('no_show', 'late_cancel', 'very_late')),
  CONSTRAINT attendance_issues_no_self    CHECK (reporter_user_id <> reported_user_id),
  UNIQUE (plan_id, reporter_user_id, reported_user_id, issue_type)
);

CREATE INDEX IF NOT EXISTS idx_attendance_issues_plan     ON newchums.attendance_issues (plan_id);
CREATE INDEX IF NOT EXISTS idx_attendance_issues_reported ON newchums.attendance_issues (reported_user_id);

-- ── conduct_reports ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.conduct_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  reporter_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  reported_user_id UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  reason           TEXT        NOT NULL,
  details          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT conduct_reports_reason_check CHECK (reason IN (
    'rude_aggressive', 'harassment', 'boundary_issue', 'discriminatory',
    'unsafe_intoxicated', 'disruptive', 'property_damage', 'other'
  )),
  CONSTRAINT conduct_reports_no_self CHECK (reporter_user_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_conduct_reports_plan     ON newchums.conduct_reports (plan_id);
CREATE INDEX IF NOT EXISTS idx_conduct_reports_reported ON newchums.conduct_reports (reported_user_id);

-- ── user_metrics ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.user_metrics (
  user_id     UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  metric      TEXT        NOT NULL,
  score       NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  signal_count INT        NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, metric),
  CONSTRAINT user_metrics_metric_check CHECK (metric IN (
    'reliability', 'sociability', 'presentation', 'hosting_skills', 'match_quality'
  ))
);

-- ── feedback email tracking ───────────────────────────────────────────────────

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS feedback_email_sent_at TIMESTAMPTZ;
