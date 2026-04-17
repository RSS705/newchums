-- Migration 084: Remove guest participation model
--
-- Replaces guest participation (nullable user_id + guest_email/guest_name columns)
-- with lightweight real-account creation at invite/share-link time. Guests are gone;
-- every participant is a real authenticated user.
--
-- Destructive: deletes guest rows and drops columns. The beta has no production
-- guest data worth preserving; the pre-check DO block below aborts if more rows
-- exist than expected, as a safety catch.
--
-- Run: psql "$DATABASE_URL" -f web/sql/084_remove_guest_participation.sql

-- ── Safety pre-check: abort if unexpectedly many guest rows ──────────────────

DO $$
DECLARE
  rsvp_count        INT;
  confirm_count     INT;
  alt_time_count    INT;
  total_count       INT;
  threshold CONSTANT INT := 100;
BEGIN
  SELECT COUNT(*) INTO rsvp_count     FROM newchums.event_rsvps         WHERE user_id IS NULL;
  SELECT COUNT(*) INTO confirm_count  FROM newchums.event_confirmations WHERE user_id IS NULL;
  SELECT COUNT(*) INTO alt_time_count FROM newchums.event_alt_times     WHERE user_id IS NULL;
  total_count := rsvp_count + confirm_count + alt_time_count;

  RAISE NOTICE 'Migration 084 pre-check: guest rows to delete — rsvps=%, confirmations=%, alt_times=%, total=%',
    rsvp_count, confirm_count, alt_time_count, total_count;

  IF total_count > threshold THEN
    RAISE EXCEPTION 'Migration 084 aborted: % guest rows exceed threshold of %. Review data before running.',
      total_count, threshold;
  END IF;
END$$;

-- ── Delete guest rows ────────────────────────────────────────────────────────

DELETE FROM newchums.event_rsvps         WHERE user_id IS NULL;
DELETE FROM newchums.event_confirmations WHERE user_id IS NULL;
DELETE FROM newchums.event_alt_times     WHERE user_id IS NULL;

-- ── Drop guest-specific partial indexes ─────────────────────────────────────

DROP INDEX IF EXISTS newchums.idx_event_rsvps_guest_email;
DROP INDEX IF EXISTS newchums.idx_event_confirmations_guest_unique;

-- ── Restore NOT NULL constraints on user_id ─────────────────────────────────

ALTER TABLE newchums.event_rsvps         ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE newchums.event_confirmations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE newchums.event_alt_times     ALTER COLUMN user_id SET NOT NULL;

-- ── Drop guest columns ──────────────────────────────────────────────────────

ALTER TABLE newchums.event_rsvps
  DROP COLUMN IF EXISTS guest_email,
  DROP COLUMN IF EXISTS guest_name;

ALTER TABLE newchums.event_alt_times
  DROP COLUMN IF EXISTS guest_email;

ALTER TABLE newchums.event_confirmations
  DROP COLUMN IF EXISTS guest_email;

-- Note: event_invites.email is intentionally preserved. Migration 075's
-- single-identity constraint (user_id XOR email) still applies. Email invites
-- remain a pre-account lookup key so hosts can invite people who haven't
-- signed up yet; their invite row adopts user_id when they complete the
-- lightweight signup flow.
