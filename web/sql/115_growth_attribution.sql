-- Migration 115: source and generation attribution + research exclusion.
-- (docs/Growth_Experiment_Plan.md section 6, items 1b and 2.)
--
-- Every account carries how it arrived. Invite/share arrivals are stamped
-- server-side inside GET /events/:id (authoritative: the adoption code
-- already knows the plan). Ad/organic arrivals are stamped once by
-- POST /me/attribution from a first-touch cookie the landing page set;
-- self-reported, guarded to young unattributed accounts only.
--
-- Generation is deliberately NOT stored: it is computed by walking
-- origin_host_user_id (gen-0 has none), so a backfill or correction never
-- leaves stale generation numbers behind.
--
-- research_excluded implements the founder ground rule: the flag removes a
-- user from every research numerator while their hosted plans remain real
-- exposure events with real lineage. Set from super-admin; no emails or
-- patterns live in this public repo.

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS research_excluded   BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signup_source       TEXT        NULL,
  ADD COLUMN IF NOT EXISTS signup_utm          JSONB       NULL,
  ADD COLUMN IF NOT EXISTS origin_event_id     UUID        NULL REFERENCES newchums.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_host_user_id UUID        NULL REFERENCES newchums.users(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_method  TEXT        NULL,
  ADD COLUMN IF NOT EXISTS attributed_at       TIMESTAMPTZ NULL;

ALTER TABLE newchums.users
  DROP CONSTRAINT IF EXISTS users_attribution_method_valid;
ALTER TABLE newchums.users
  ADD CONSTRAINT users_attribution_method_valid CHECK (
    attribution_method IS NULL OR
    attribution_method IN ('utm', 'invite', 'share', 'organic', 'backfill_invite', 'manual')
  );

-- Lineage walks and per-plan origin lookups.
CREATE INDEX IF NOT EXISTS idx_users_origin_host ON newchums.users (origin_host_user_id)
  WHERE origin_host_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_origin_event ON newchums.users (origin_event_id)
  WHERE origin_event_id IS NOT NULL;
