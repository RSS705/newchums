-- 054: Objectives / nudge framework
-- Tracks per-user objective completion for the next-best-step nudge system.
-- Also adds a user-level toggle to permanently disable tutorial nudges.

CREATE TABLE IF NOT EXISTS newchums.user_objective_completions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  objective_key TEXT     NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, objective_key)
);

CREATE INDEX IF NOT EXISTS idx_uoc_user_id
  ON newchums.user_objective_completions(user_id);

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS tutorial_nudges_off BOOLEAN NOT NULL DEFAULT false;
