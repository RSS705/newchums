-- Migration 105: admin_audit, durable record of destructive/sensitive admin actions
--
-- Written as the FIRST statement inside the same transaction as a hard
-- delete, so the audit row commits atomically with the cascade and survives
-- it. Deliberately has NO foreign keys: the subject is usually gone by the
-- time anyone reads the row, and the actor must remain attributable even in
-- pathological cases. Actions recorded today:
--   user_hard_delete             - super admin removed a user + full cascade
--   plan_hard_delete             - super admin removed a plan + full cascade
--   plan_chat_transcript_viewed  - super admin opened a plan chat transcript
--                                  (read-only moderation view)
-- detail carries the impact counts (hard deletes) or view metadata.

CREATE TABLE IF NOT EXISTS newchums.admin_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  subject_label TEXT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
  ON newchums.admin_audit (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_subject
  ON newchums.admin_audit (subject_type, subject_id);
