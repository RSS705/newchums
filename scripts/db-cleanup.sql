-- ============================================================================
-- NewChums Database Cleanup Script
-- ============================================================================
-- Purpose: Remove all test/dummy data while preserving whitelisted accounts
--          and system/reference data (interests seed, etc.)
--
-- Usage:
--   1. Set the whitelist below (emails of accounts to keep)
--   2. Run the DRY RUN section first to review what will be deleted
--   3. If satisfied, run the REAL CLEANUP section inside a transaction
--
-- Safety:
--   - All deletes run inside a single transaction with explicit ROLLBACK prompt
--   - FK ON DELETE CASCADE handles most child rows automatically
--   - System/reference tables (interests, user_profile schema) are NOT touched
--   - The script never uses TRUNCATE
-- ============================================================================

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  CONFIGURATION — edit this whitelist before running                    │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Add the emails of every account you want to KEEP.
-- All other users and their dependent data will be removed.

-- CREATE TEMP TABLE so it's usable across both dry-run and cleanup:
DROP TABLE IF EXISTS _keep_emails;
CREATE TEMP TABLE _keep_emails (email TEXT PRIMARY KEY);

INSERT INTO _keep_emails (email) VALUES
  -- ── Add your keeper emails here ──
  ('your-email@example.com')
  -- ,('another-keeper@example.com')
;

-- Resolve keeper user IDs
DROP TABLE IF EXISTS _keep_ids;
CREATE TEMP TABLE _keep_ids AS
  SELECT id FROM newchums.users WHERE LOWER(email) IN (SELECT LOWER(email) FROM _keep_emails);

-- ============================================================================
-- TABLE CLASSIFICATION
-- ============================================================================
--
-- SYSTEM / REFERENCE (never cleaned):
--   interests / newchums.interests    — seeded hobby catalog
--   user_profile                      — schema-level (no rows to clean independently)
--
-- USER-GENERATED (cleaned by deleting users — FK CASCADE handles these):
--   password_reset_tokens             — FK CASCADE from users
--   email_verification_tokens         — FK CASCADE from users
--   newchums.email_change_requests    — FK CASCADE from users
--   newchums.user_chums               — FK CASCADE from users
--   newchums.user_contacts            — FK CASCADE from users
--   newchums.notifications            — FK CASCADE from users
--   newchums.chum_invites             — FK CASCADE from users
--   newchums.chum_preferences         — FK CASCADE from users
--   newchums.user_metrics             — FK CASCADE from users
--   newchums.user_objective_completions — FK CASCADE from users
--   newchums.admin_view_timestamps    — FK CASCADE from users
--   newchums.communities              — owner FK (NO CASCADE) — must delete explicitly
--   newchums.community_members        — FK CASCADE from communities
--   newchums.community_join_requests  — FK CASCADE from communities
--   newchums.events                   — FK CASCADE from users (host)
--     All event child tables cascade from events:
--     event_invites, event_rsvps, event_alt_times, event_chat_messages,
--     event_chat_reads, event_join_requests, event_confirmations,
--     event_interests, host_attendee_removals, plan_feedback,
--     attendance_issues, conduct_reports
--   newchums.roadmap_items            — FK CASCADE from users
--     roadmap_votes, roadmap_follows, roadmap_comments,
--     roadmap_admin_notes             — FK CASCADE from roadmap_items
--   user_interests                    — FK from users (likely CASCADE)
--
-- MIXED / EDGE CASES:
--   newchums.interests columns: created_by_user_id, updated_by_user_id,
--     deleted_by_user_id — these are nullable with NO FK constraint in SQL.
--     Deleting users won't break interests, but stale UUIDs may remain.
--     We null them out for hygiene.
--
-- ============================================================================


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECTION 1: DRY RUN — reports what would be deleted                   │
-- └─────────────────────────────────────────────────────────────────────────┘

SELECT '══════════════════════════════════════════════════════' AS "DRY RUN REPORT";

-- Keepers
SELECT '── Accounts to KEEP ──' AS "Section";
SELECT id, email, name, role, created_at
FROM newchums.users
WHERE id IN (SELECT id FROM _keep_ids)
ORDER BY email;

-- Users to delete
SELECT '── Accounts to DELETE ──' AS "Section";
SELECT COUNT(*) AS users_to_delete
FROM newchums.users
WHERE id NOT IN (SELECT id FROM _keep_ids);

-- Breakdown of what will cascade
SELECT '── Dependent data that will be removed ──' AS "Section";

SELECT 'events (plans)' AS "table",
       COUNT(*) AS row_count
FROM newchums.events
WHERE host_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'event_rsvps',
       COUNT(*)
FROM newchums.event_rsvps
WHERE event_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
   OR user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'event_invites',
       COUNT(*)
FROM newchums.event_invites
WHERE event_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
UNION ALL
SELECT 'event_chat_messages',
       COUNT(*)
FROM newchums.event_chat_messages
WHERE event_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
UNION ALL
SELECT 'event_join_requests',
       COUNT(*)
FROM newchums.event_join_requests
WHERE event_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
UNION ALL
SELECT 'event_confirmations',
       COUNT(*)
FROM newchums.event_confirmations
WHERE event_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
UNION ALL
SELECT 'plan_feedback',
       COUNT(*)
FROM newchums.plan_feedback
WHERE plan_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
   OR reviewer_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reviewee_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'attendance_issues',
       COUNT(*)
FROM newchums.attendance_issues
WHERE plan_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
   OR reporter_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reported_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'conduct_reports',
       COUNT(*)
FROM newchums.conduct_reports
WHERE plan_id IN (SELECT id FROM newchums.events WHERE host_user_id NOT IN (SELECT id FROM _keep_ids))
   OR reporter_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reported_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'notifications',
       COUNT(*)
FROM newchums.notifications
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'user_chums',
       COUNT(*)
FROM newchums.user_chums
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
   OR chum_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'user_contacts',
       COUNT(*)
FROM newchums.user_contacts
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'chum_invites',
       COUNT(*)
FROM newchums.chum_invites
WHERE inviter_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'communities',
       COUNT(*)
FROM newchums.communities
WHERE owner_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'community_members',
       COUNT(*)
FROM newchums.community_members
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'roadmap_items',
       COUNT(*)
FROM newchums.roadmap_items
WHERE author_user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'user_metrics',
       COUNT(*)
FROM newchums.user_metrics
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'chum_preferences',
       COUNT(*)
FROM newchums.chum_preferences
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'user_objective_completions',
       COUNT(*)
FROM newchums.user_objective_completions
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'password_reset_tokens',
       COUNT(*)
FROM password_reset_tokens
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
UNION ALL
SELECT 'email_verification_tokens',
       COUNT(*)
FROM email_verification_tokens
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- System data preserved
SELECT '── System data PRESERVED ──' AS "Section";
SELECT 'interests (total)' AS "table", COUNT(*) AS row_count FROM newchums.interests
UNION ALL
SELECT 'interests (seeded)', COUNT(*) FROM newchums.interests WHERE is_seed = true
UNION ALL
SELECT 'interests (user-created)', COUNT(*) FROM newchums.interests WHERE is_seed = false;

SELECT '══════════════════════════════════════════════════════' AS "END DRY RUN";
SELECT 'Review the counts above. If they look correct, proceed to the REAL CLEANUP section below.' AS "Next step";


-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  SECTION 2: REAL CLEANUP — run only after reviewing the dry run        │
-- │                                                                        │
-- │  IMPORTANT: Everything below is wrapped in a transaction.              │
-- │  Change the final ROLLBACK to COMMIT when you are ready.               │
-- └─────────────────────────────────────────────────────────────────────────┘

-- Uncomment the BEGIN through ROLLBACK/COMMIT block below to execute:

/*
BEGIN;

-- ── Step 1: Clean up cross-references that involve non-kept users ────────
-- These tables reference users but don't all CASCADE from the user delete,
-- or they reference multiple users where only some are being deleted.

-- Plan feedback where any participant is deleted
DELETE FROM newchums.plan_feedback
WHERE reviewer_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reviewee_user_id NOT IN (SELECT id FROM _keep_ids);

-- Attendance issues where any participant is deleted
DELETE FROM newchums.attendance_issues
WHERE reporter_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reported_user_id NOT IN (SELECT id FROM _keep_ids);

-- Conduct reports where any participant is deleted
DELETE FROM newchums.conduct_reports
WHERE reporter_user_id NOT IN (SELECT id FROM _keep_ids)
   OR reported_user_id NOT IN (SELECT id FROM _keep_ids);

-- User chums where either side is deleted
DELETE FROM newchums.user_chums
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
   OR chum_user_id NOT IN (SELECT id FROM _keep_ids);

-- User contacts referencing deleted users
DELETE FROM newchums.user_contacts
WHERE user_id NOT IN (SELECT id FROM _keep_ids)
   OR (linked_user_id IS NOT NULL AND linked_user_id NOT IN (SELECT id FROM _keep_ids));

-- Community members for deleted users
DELETE FROM newchums.community_members
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- Community join requests for deleted users
DELETE FROM newchums.community_join_requests
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 2: Delete communities owned by non-kept users ───────────────────
-- (communities FK to users has NO CASCADE, so we must delete explicitly)
-- CASCADE on community_members/community_join_requests handles children.
-- Also nullifies events.community_id via ON DELETE SET NULL.
DELETE FROM newchums.communities
WHERE owner_user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 3: Remove RSVPs/invites/chat on keeper-hosted events for deleted users ─
-- Events hosted by keepers survive, but deleted users' RSVPs etc. need cleanup.
DELETE FROM newchums.event_rsvps
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_invites
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_chat_messages
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_chat_reads
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_alt_times
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_join_requests
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.event_confirmations
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.host_attendee_removals
WHERE removed_user_id NOT IN (SELECT id FROM _keep_ids)
   OR host_user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 4: Delete events hosted by non-kept users ───────────────────────
-- ON DELETE CASCADE will clean up all remaining child rows:
-- event_invites, event_rsvps, event_alt_times, event_chat_messages,
-- event_chat_reads, event_join_requests, event_confirmations,
-- event_interests, host_attendee_removals, plan_feedback,
-- attendance_issues, conduct_reports
DELETE FROM newchums.events
WHERE host_user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 5: Delete roadmap items by non-kept users ───────────────────────
-- CASCADE cleans up votes, follows, comments, admin_notes
DELETE FROM newchums.roadmap_items
WHERE author_user_id NOT IN (SELECT id FROM _keep_ids);

-- Also clean up votes/follows/comments by deleted users on kept roadmap items
DELETE FROM newchums.roadmap_votes
WHERE user_id NOT IN (SELECT id FROM _keep_ids);
DELETE FROM newchums.roadmap_follows
WHERE user_id NOT IN (SELECT id FROM _keep_ids);
DELETE FROM newchums.roadmap_comments
WHERE user_id NOT IN (SELECT id FROM _keep_ids);
DELETE FROM newchums.roadmap_admin_notes
WHERE admin_user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 6: Clean up remaining user-scoped tables ────────────────────────
DELETE FROM newchums.notifications
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.chum_invites
WHERE inviter_user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.user_metrics
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.chum_preferences
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.user_objective_completions
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.admin_view_timestamps
WHERE admin_user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM password_reset_tokens
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM email_verification_tokens
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

DELETE FROM newchums.email_change_requests
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 7: Clean user_interests for deleted users ───────────────────────
DELETE FROM user_interests
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 8: Clean user_profile for deleted users ─────────────────────────
-- user_profile may or may not FK cascade — explicit delete is safe
DELETE FROM user_profile
WHERE user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 9: Null out stale user references in interests table ────────────
-- These columns have NO FK so deleting users leaves orphan UUIDs
UPDATE newchums.interests SET created_by_user_id = NULL
WHERE created_by_user_id IS NOT NULL
  AND created_by_user_id NOT IN (SELECT id FROM _keep_ids);

UPDATE newchums.interests SET updated_by_user_id = NULL
WHERE updated_by_user_id IS NOT NULL
  AND updated_by_user_id NOT IN (SELECT id FROM _keep_ids);

UPDATE newchums.interests SET deleted_by_user_id = NULL
WHERE deleted_by_user_id IS NOT NULL
  AND deleted_by_user_id NOT IN (SELECT id FROM _keep_ids);

-- ── Step 10: Delete the users themselves ─────────────────────────────────
-- By this point all FK dependencies should be resolved.
DELETE FROM newchums.users
WHERE id NOT IN (SELECT id FROM _keep_ids);

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
UNION ALL SELECT 'roadmap_items remaining', COUNT(*) FROM newchums.roadmap_items;

-- ══════════════════════════════════════════════════════════════════════════
-- SAFETY: Change ROLLBACK to COMMIT only when you've verified the output.
-- ══════════════════════════════════════════════════════════════════════════
ROLLBACK;
-- COMMIT;

*/
