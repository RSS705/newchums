-- ============================================================================
-- NewChums Database Cleanup Script (NO WHITELIST)
-- ============================================================================
-- Purpose: Remove all user/test/dummy data while preserving system/reference
--          data such as seeded interests.
--
-- Usage:
--   1. Run the DRY RUN section first to review what will be deleted
--   2. If satisfied, run the REAL CLEANUP section inside a transaction
--
-- Safety:
--   - All deletes run inside a single transaction with explicit ROLLBACK prompt
--   - FK ON DELETE CASCADE handles most child rows automatically
--   - System/reference tables (interests seed, etc.) are NOT touched
--   - The script never uses TRUNCATE
-- ============================================================================

--   newchums.attendance_issues
--   newchums.conduct_reports
--   newchums.roadmap_items
--   newchums.roadmap_votes
--   newchums.roadmap_follows
--   newchums.roadmap_comments
--   newchums.roadmap_admin_notes
--
-- MIXED / EDGE CASES:
--   newchums.interests columns:
--     created_by_user_id, updated_by_user_id, deleted_by_user_id
--   These may contain user IDs with no FK constraint, so we null them out.
--
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECTION 1: DRY RUN — reports what would be deleted                   │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT '══════════════════════════════════════════════════════' AS "DRY RUN REPORT";

SELECT '── Accounts to DELETE ──' AS "Section";
SELECT COUNT(*) AS users_to_delete
FROM newchums.users;

SELECT '── Dependent data that will be removed ──' AS "Section";

SELECT 'events (plans)' AS "table", COUNT(*) AS row_count
FROM newchums.events
UNION ALL
SELECT 'event_rsvps', COUNT(*) FROM newchums.event_rsvps
UNION ALL
SELECT 'event_invites', COUNT(*) FROM newchums.event_invites
UNION ALL
SELECT 'event_chat_messages', COUNT(*) FROM newchums.event_chat_messages
UNION ALL
SELECT 'event_chat_reads', COUNT(*) FROM newchums.event_chat_reads
UNION ALL
SELECT 'event_join_requests', COUNT(*) FROM newchums.event_join_requests
UNION ALL
SELECT 'event_confirmations', COUNT(*) FROM newchums.event_confirmations
UNION ALL
SELECT 'event_alt_times', COUNT(*) FROM newchums.event_alt_times
UNION ALL
SELECT 'event_interests', COUNT(*) FROM newchums.event_interests
UNION ALL
SELECT 'host_attendee_removals', COUNT(*) FROM newchums.host_attendee_removals
UNION ALL

SELECT '── System data PRESERVED ──' AS "Section";
SELECT 'interests (total)' AS "table", COUNT(*) AS row_count FROM newchums.interests
UNION ALL
SELECT 'interests (seeded)', COUNT(*) FROM newchums.interests WHERE is_seed = true
UNION ALL
SELECT 'interests (user-created, preserved)', COUNT(*) FROM newchums.interests WHERE is_seed = false;

SELECT '══════════════════════════════════════════════════════' AS "END DRY RUN";
SELECT 'Review the counts above. If they look correct, proceed to the REAL CLEANUP section below.' AS "Next step";


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECTION 2: REAL CLEANUP — run only after reviewing the dry run       │
-- │                                                                        │
-- │  IMPORTANT: Everything below is wrapped in a transaction.              │
-- │  Change the final ROLLBACK to COMMIT when you are ready.               │
-- └─────────────────────────────────────────────────────────────────────────┘

/*
BEGIN;

-- ── Step 1: Delete cross-reference tables that may block user deletion ───

DELETE FROM newchums.attendance_issues;
DELETE FROM newchums.conduct_reports;

DELETE FROM newchums.user_chums;
DELETE FROM newchums.user_contacts;

DELETE FROM newchums.community_members;
DELETE FROM newchums.community_join_requests;

DELETE FROM newchums.event_rsvps;
DELETE FROM newchums.event_invites;
DELETE FROM newchums.event_chat_messages;
DELETE FROM newchums.event_chat_reads;
DELETE FROM newchums.event_alt_times;
DELETE FROM newchums.event_join_requests;
DELETE FROM newchums.event_confirmations;
DELETE FROM newchums.host_attendee_removals;

DELETE FROM newchums.roadmap_votes;
DELETE FROM newchums.roadmap_follows;
DELETE FROM newchums.roadmap_comments;
DELETE FROM newchums.roadmap_admin_notes;

-- ── Step 2: Delete top-level user-owned objects ──────────────────────────

DELETE FROM newchums.communities;
DELETE FROM newchums.events;
DELETE FROM newchums.roadmap_items;

-- ── Step 3: Delete remaining user-scoped tables ──────────────────────────

DELETE FROM newchums.notifications;
DELETE FROM newchums.chum_invites;
DELETE FROM newchums.user_objective_completions;
DELETE FROM newchums.admin_view_timestamps;

DELETE FROM password_reset_tokens;
DELETE FROM email_verification_tokens;
DELETE FROM newchums.email_change_requests;

DELETE FROM user_interests;
DELETE FROM user_profile;

-- ── Step 4: Null out stale user references in interests ──────────────────

UPDATE newchums.interests
SET created_by_user_id = NULL
WHERE created_by_user_id IS NOT NULL;

UPDATE newchums.interests
SET updated_by_user_id = NULL
WHERE updated_by_user_id IS NOT NULL;

UPDATE newchums.interests
SET deleted_by_user_id = NULL
WHERE deleted_by_user_id IS NOT NULL;

-- ── Step 5: Delete all users ─────────────────────────────────────────────

DELETE FROM newchums.users;

-- ── Verification ─────────────────────────────────────────────────────────

SELECT 'Cleanup complete. Verifying...' AS status;

SELECT 'users remaining' AS check_item, COUNT(*) AS count FROM newchums.users
UNION ALL SELECT 'events remaining', COUNT(*) FROM newchums.events
UNION ALL SELECT 'communities remaining', COUNT(*) FROM newchums.communities
UNION ALL SELECT 'notifications remaining', COUNT(*) FROM newchums.notifications
UNION ALL SELECT 'user_contacts remaining', COUNT(*) FROM newchums.user_contacts
UNION ALL SELECT 'user_chums remaining', COUNT(*) FROM newchums.user_chums
UNION ALL SELECT 'interests (preserved)', COUNT(*) FROM newchums.interests
UNION ALL SELECT 'user_interests remaining', COUNT(*) FROM user_interests
UNION ALL SELECT 'roadmap_items remaining', COUNT(*) FROM newchums.roadmap_items
UNION ALL SELECT 'user_profile remaining', COUNT(*) FROM user_profile;

-- ══════════════════════════════════════════════════════════════════════════
-- SAFETY: Change ROLLBACK to COMMIT only when you've verified the output.
-- ══════════════════════════════════════════════════════════════════════════
ROLLBACK;
-- COMMIT;
*/