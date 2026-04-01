-- =============================================================================
-- NewChums: Post-Wipe Verification
-- =============================================================================
-- Run this after beta_wipe.sql to confirm the wipe was complete and the
-- interests catalog survived intact.
--
-- Expected result: every table shows 0 rows except "interests", which should
-- show ~40+ rows. Any non-zero count on a wiped table means something was
-- missed or the wipe didn't fully commit.
-- =============================================================================

SELECT '── SHOULD BE EMPTY ──────────────────────────────────' AS section;

SELECT 'users'                      AS table_name, count(*) AS row_count FROM newchums.users
UNION ALL
SELECT 'user_profile',               count(*) FROM newchums.user_profile
UNION ALL
SELECT 'user_interests',             count(*) FROM newchums.user_interests
UNION ALL
SELECT 'user_chums',                 count(*) FROM newchums.user_chums
UNION ALL
SELECT 'user_contacts',              count(*) FROM newchums.user_contacts
UNION ALL
SELECT 'user_metrics',               count(*) FROM newchums.user_metrics
UNION ALL
SELECT 'user_objective_completions', count(*) FROM newchums.user_objective_completions
UNION ALL
SELECT 'chum_invites',               count(*) FROM newchums.chum_invites
UNION ALL
SELECT 'chum_preferences',           count(*) FROM newchums.chum_preferences
UNION ALL
SELECT 'password_reset_tokens',      count(*) FROM newchums.password_reset_tokens
UNION ALL
SELECT 'email_verification_tokens',  count(*) FROM newchums.email_verification_tokens
UNION ALL
SELECT 'email_change_requests',      count(*) FROM newchums.email_change_requests
UNION ALL
SELECT 'notifications',              count(*) FROM newchums.notifications
UNION ALL
SELECT 'events',                     count(*) FROM newchums.events
UNION ALL
SELECT 'event_interests',            count(*) FROM newchums.event_interests
UNION ALL
SELECT 'event_invites',              count(*) FROM newchums.event_invites
UNION ALL
SELECT 'event_rsvps',                count(*) FROM newchums.event_rsvps
UNION ALL
SELECT 'event_alt_times',            count(*) FROM newchums.event_alt_times
UNION ALL
SELECT 'event_join_requests',        count(*) FROM newchums.event_join_requests
UNION ALL
SELECT 'event_confirmations',        count(*) FROM newchums.event_confirmations
UNION ALL
SELECT 'event_chat_messages',        count(*) FROM newchums.event_chat_messages
UNION ALL
SELECT 'event_chat_reads',           count(*) FROM newchums.event_chat_reads
UNION ALL
SELECT 'host_attendee_removals',     count(*) FROM newchums.host_attendee_removals
UNION ALL
SELECT 'plan_feedback',              count(*) FROM newchums.plan_feedback
UNION ALL
SELECT 'plan_feedback_dismissals',   count(*) FROM newchums.plan_feedback_dismissals
UNION ALL
SELECT 'attendance_issues',          count(*) FROM newchums.attendance_issues
UNION ALL
SELECT 'conduct_reports',            count(*) FROM newchums.conduct_reports
UNION ALL
SELECT 'communities',                count(*) FROM newchums.communities
UNION ALL
SELECT 'community_members',          count(*) FROM newchums.community_members
UNION ALL
SELECT 'community_join_requests',    count(*) FROM newchums.community_join_requests
UNION ALL
SELECT 'roadmap_items',              count(*) FROM newchums.roadmap_items
UNION ALL
SELECT 'roadmap_votes',              count(*) FROM newchums.roadmap_votes
UNION ALL
SELECT 'roadmap_follows',            count(*) FROM newchums.roadmap_follows
UNION ALL
SELECT 'roadmap_comments',           count(*) FROM newchums.roadmap_comments
UNION ALL
SELECT 'roadmap_admin_notes',        count(*) FROM newchums.roadmap_admin_notes
UNION ALL
SELECT 'admin_view_timestamps',      count(*) FROM newchums.admin_view_timestamps
ORDER BY table_name;

-- ─────────────────────────────────────────────────────────────────────────────

SELECT '── SHOULD BE PRESERVED ─────────────────────────────' AS section;

SELECT 'interests'                   AS table_name, count(*) AS row_count FROM newchums.interests;

-- Show breakdown: seed vs user-created
SELECT
  CASE WHEN is_seed THEN 'seed' ELSE 'user-created' END AS origin,
  count(*) AS count
FROM newchums.interests
GROUP BY is_seed
ORDER BY origin;

-- Confirm no stale user references remain on interests
SELECT count(*) AS stale_user_refs
FROM newchums.interests
WHERE created_by_user_id IS NOT NULL
   OR updated_by_user_id IS NOT NULL
   OR deleted_by_user_id IS NOT NULL;

-- =============================================================================
-- PASS CRITERIA:
--   1. All wiped tables show row_count = 0
--   2. interests row_count >= 40 (seed data intact)
--   3. stale_user_refs = 0 (user references were nullified)
-- =============================================================================
