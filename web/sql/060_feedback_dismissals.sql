-- Migration 060: Track when a user dismisses the feedback prompt for a plan
--
-- Allows users to permanently hide the "How did it go?" section on a
-- per-plan basis. Once dismissed, the feedback GET endpoint returns
-- dismissed: true and the UI hides the section.

CREATE TABLE IF NOT EXISTS newchums.plan_feedback_dismissals (
  plan_id    UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (plan_id, user_id)
);
