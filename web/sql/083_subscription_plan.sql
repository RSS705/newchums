-- Migration 083: Subscription plan framework
-- Adds subscription_plan to users and a lightweight audit history table.
-- Run: psql "$DATABASE_URL" -f web/sql/083_subscription_plan.sql

-- ── Add subscription_plan column to users ───────────────────────────────────

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT NOT NULL DEFAULT 'free';

ALTER TABLE newchums.users
  ADD CONSTRAINT users_subscription_plan_check
    CHECK (subscription_plan IN ('free', 'super_host', 'community_pro'));

-- Sparse index: only non-free plans are worth indexing.
CREATE INDEX IF NOT EXISTS idx_users_subscription_plan
  ON newchums.users(subscription_plan) WHERE subscription_plan != 'free';

-- ── Subscription plan change history (admin audit trail) ────────────────────

CREATE TABLE IF NOT EXISTS newchums.subscription_plan_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  old_plan        TEXT        NOT NULL,
  new_plan        TEXT        NOT NULL,
  assigned_by     UUID        NOT NULL REFERENCES newchums.users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sph_old_plan_check CHECK (old_plan IN ('free', 'super_host', 'community_pro')),
  CONSTRAINT sph_new_plan_check CHECK (new_plan IN ('free', 'super_host', 'community_pro'))
);

CREATE INDEX IF NOT EXISTS idx_sph_user ON newchums.subscription_plan_history(user_id);
