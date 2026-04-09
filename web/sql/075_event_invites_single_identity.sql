-- Migration 075: Single-source-of-truth for event_invites recipient identity.
--
-- Background: `event_invites` stores the recipient via `user_id` OR `email`.
-- Before this migration, nothing at the schema level prevented a row from
-- having BOTH columns set, which (a) lets two rows reference the same recipient
-- via different identity columns and slip past the partial unique indexes from
-- migration 024, and (b) made cross-key dedup the application's problem.
--
-- Goal after this migration: every row has exactly one of (user_id, email)
-- populated. The application already normalizes new inserts that way
-- (api/src/index.ts POST /events and POST /events/:id/invite both resolve
-- email -> user_id when a user with that email exists). This migration
-- enforces the invariant at the schema level and cleans up any legacy rows
-- that predate the normalization.
--
-- Steps:
--   1. Normalize rows that have BOTH columns set. `user_id` wins (it's the
--      canonical identity when we know who the user is).
--   2. Delete legacy email-only rows whose email matches a user that already
--      has a user_id-keyed invite on the same event. Without this, step 3
--      below would try to promote them and hit the existing unique index on
--      (event_id, user_id).
--   3. Resolve remaining email-only rows to user_id when the email matches
--      an existing user account. Mirrors the normalization the application
--      does on new inserts, applied once to legacy rows.
--   4. Add the CHECK constraint that enforces "exactly one of (user_id,
--      email)". Wrapped in a DO block so the migration is idempotent.
--
-- The existing partial unique indexes from migration 024
--   - idx_event_invites_unique_user  ON (event_id, user_id) WHERE user_id IS NOT NULL
--   - idx_event_invites_unique_email ON (event_id, email) WHERE email IS NOT NULL AND user_id IS NULL
-- are already correct under the new invariant and are intentionally left in
-- place. Note that the cross-key case (one user invited via user_id and again
-- via their email after sign-up) still cannot be prevented in a plain index
-- because it spans two tables; the application layer handles that via the
-- SELECT-before-INSERT check in POST /events/:id/invite and the email ->
-- user_id normalization at creation time.
--
-- Run: psql "$DATABASE_URL" -f sql/075_event_invites_single_identity.sql

-- Step 1: clear `email` on rows that have both columns set. `user_id` wins.
UPDATE newchums.event_invites
SET email = NULL
WHERE user_id IS NOT NULL
  AND email IS NOT NULL;

-- Step 2: drop legacy email-only rows that duplicate an existing user_id
-- row on the same event. This prevents the resolution UPDATE below from
-- hitting the unique index on (event_id, user_id).
DELETE FROM newchums.event_invites AS ei_email
USING newchums.event_invites AS ei_user,
      newchums.users AS u
WHERE ei_email.user_id IS NULL
  AND ei_email.email IS NOT NULL
  AND ei_user.event_id = ei_email.event_id
  AND ei_user.user_id = u.id
  AND LOWER(u.email) = LOWER(ei_email.email);

-- Step 3: promote remaining email-only rows to user_id when possible.
-- Mirrors the new application-side normalization applied to legacy rows.
UPDATE newchums.event_invites AS ei
SET user_id = u.id,
    email = NULL
FROM newchums.users AS u
WHERE ei.user_id IS NULL
  AND ei.email IS NOT NULL
  AND LOWER(u.email) = LOWER(ei.email);

-- Step 4: enforce exactly-one-identity at the schema level. Idempotent guard
-- via pg_constraint so re-running the migration is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'event_invites_single_identity'
      AND conrelid = 'newchums.event_invites'::regclass
  ) THEN
    ALTER TABLE newchums.event_invites
      ADD CONSTRAINT event_invites_single_identity
      CHECK ((user_id IS NULL) <> (email IS NULL));
  END IF;
END $$;
