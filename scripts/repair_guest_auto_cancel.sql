-- scripts/repair_guest_auto_cancel.sql
--
-- Repair for plans that were incorrectly auto-cancelled by the
-- `cancelNoAttendeePlans` cron path when the plan actually had guest
-- attendees (event_rsvps rows with user_id IS NULL).
--
-- Root cause: the query used `er.user_id != e.host_user_id`, which is
-- NULL (and therefore falsy) for guest rows, so guest-only plans were
-- treated as host-only and cancelled with cancellation_reason = 'no_attendees'.
--
-- What this script does (for one plan at a time, keyed by event id):
--   1) Verifies the plan was cancelled by the no-attendees path.
--   2) Verifies guest attendees actually existed at the time of cancel,
--      i.e. this was a mis-cancel (not a legitimate host-only plan).
--   3) Restores the plan to 'published' and clears the cancel metadata.
--   4) Clears feedback_email_sent_at so the post-plan feedback cron can
--      pick it up on its next tick (if the plan already ended ≥ 3 hours ago).
--
-- It does NOT touch:
--   - Attendance-assurance fields (require_reconfirmation, confirmation_sent_at,
--     cutoff_processed_at) because the cancellation_reason was 'no_attendees',
--     a different path that doesn't modify those.
--   - event_rsvps / event_confirmations — those are preserved.
--
-- Safety:
--   - Wrapped in an explicit transaction with a guard SELECT so the UPDATE is
--     only applied when both preconditions hold.
--   - Prints the affected row both before and after so it can be audited.
--   - If the preconditions don't match, the UPDATE silently affects 0 rows
--     (the SELECT will show the reason), and the transaction can be rolled
--     back with no effect.
--
-- Usage:
--   1) Set :event_id to the affected plan's UUID.
--   2) Run inside a psql session and review the output of each step.
--   3) COMMIT if the result looks right, otherwise ROLLBACK.
--
--   psql "$DATABASE_URL" \
--     -v event_id="'00000000-0000-0000-0000-000000000000'" \
--     -f scripts/repair_guest_auto_cancel.sql

\set ON_ERROR_STOP on

BEGIN;

-- ─── Step 1: show current state so we can eyeball before / after ─────────────
SELECT
  id,
  status,
  cancellation_reason,
  canceled_at,
  feedback_email_sent_at,
  starts_at,
  (SELECT COUNT(*) FROM newchums.event_rsvps er
     WHERE er.event_id = e.id AND er.status = 'going'
       AND er.user_id IS NULL) AS guest_going_count,
  (SELECT COUNT(*) FROM newchums.event_rsvps er
     WHERE er.event_id = e.id AND er.status = 'going'
       AND er.user_id IS NOT NULL
       AND er.user_id <> e.host_user_id) AS user_going_count
FROM newchums.events e
WHERE e.id = :event_id;

-- ─── Step 2: restore, guarded by the two preconditions ───────────────────────
--   - cancellation_reason = 'no_attendees' (the buggy path)
--   - at least one guest going RSVP exists
-- Any other cancellation (host_canceled, min_attendees_not_met, NULL) is left
-- untouched because those paths aren't the bug we're repairing here.
UPDATE newchums.events AS e
SET
  status                 = 'published',
  cancellation_reason    = NULL,
  canceled_at            = NULL,
  -- Clear the feedback stamp so the post-plan feedback cron will pick this
  -- plan up on its next tick if starts_at is already ≥ 3 hours in the past.
  -- If the plan is still in the future this is a no-op.
  feedback_email_sent_at = NULL,
  updated_at             = NOW()
WHERE e.id = :event_id
  AND e.status = 'canceled'
  AND e.cancellation_reason = 'no_attendees'
  AND EXISTS (
    SELECT 1
    FROM newchums.event_rsvps er
    WHERE er.event_id = e.id
      AND er.status = 'going'
      AND er.user_id IS NULL
  );

-- ─── Step 3: show post-repair state ──────────────────────────────────────────
SELECT
  id,
  status,
  cancellation_reason,
  canceled_at,
  feedback_email_sent_at,
  starts_at
FROM newchums.events
WHERE id = :event_id;

-- Review the output, then:
--   COMMIT;   -- if the row is now published with a clean cancel state
--   ROLLBACK; -- if anything looks wrong
