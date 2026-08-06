-- Migration 116: attribution backfill from historical invite records.
-- (docs/Growth_Experiment_Plan.md section 6 item 2: existing users seed
-- Experiment B on day one.)
--
-- ORDERING RULE (section 6): run only AFTER the test-account cleanup is
-- confirmed, so deleted accounts never enter the lineage tree. Idempotent:
-- touches only rows with no attribution, so re-running after a later
-- deletion pass is safe and is the intended repair path.
--
-- Rule: a user's origin is the EARLIEST invite that targeted them (by
-- user_id link or matching email) and predates their account by any amount,
-- or arrived while the account already existed (invited-then-adopted rows
-- get user_id set with email cleared, so both shapes count). "Earliest
-- wins" is the disambiguation Rob approved for multi-invite users; the
-- 'manual' method exists as the override. Origin host is the PLAN's host
-- (the gathering did the exposing), matching the experiment doc, not the
-- attendee who typed the address.
--
-- No PII lives in this file; it is pure joins over existing rows.

WITH earliest_invite AS (
  SELECT DISTINCT ON (u.id)
    u.id            AS user_id,
    i.event_id      AS event_id,
    e.host_user_id  AS host_user_id,
    i.created_at    AS invited_at
  FROM newchums.users u
  JOIN newchums.event_invites i
    ON (i.user_id = u.id OR (i.email IS NOT NULL AND LOWER(i.email) = LOWER(u.email)))
  JOIN newchums.events e ON e.id = i.event_id
  WHERE u.attribution_method IS NULL
    AND e.host_user_id <> u.id            -- self-invites carry no lineage
    AND COALESCE(e.is_qa, FALSE) = FALSE  -- QA plans stay out of research data
  ORDER BY u.id, i.created_at ASC
)
UPDATE newchums.users u
SET origin_event_id     = ei.event_id,
    origin_host_user_id = ei.host_user_id,
    attribution_method  = 'backfill_invite',
    attributed_at       = NOW()
FROM earliest_invite ei
WHERE u.id = ei.user_id
  AND u.attribution_method IS NULL;
