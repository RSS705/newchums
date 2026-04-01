-- =============================================================================
-- NewChums: Pre-Beta Full Data Wipe
-- =============================================================================
-- Purpose:  Reset all user/product data to a clean state before beta testing.
-- Preserves: interests table (seed + user-created hobbies/interests).
-- Destroys:  All users, events, communities, and every table that depends on them.
--
-- IMPORTANT: Review the warnings at the bottom of this file before running.
-- Run against the target database manually. This is wrapped in a transaction
-- so it either fully succeeds or fully rolls back.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1: Leaf tables / junction tables (no dependents of their own)
-- Order: delete tables that nothing else references first.
-- ─────────────────────────────────────────────────────────────────────────────

-- Event-related leaf tables
TRUNCATE TABLE newchums.event_chat_reads           CASCADE;
TRUNCATE TABLE newchums.event_chat_messages         CASCADE;
TRUNCATE TABLE newchums.event_confirmations         CASCADE;
TRUNCATE TABLE newchums.event_alt_times             CASCADE;
TRUNCATE TABLE newchums.event_rsvps                 CASCADE;
TRUNCATE TABLE newchums.event_invites               CASCADE;
TRUNCATE TABLE newchums.event_join_requests         CASCADE;
TRUNCATE TABLE newchums.host_attendee_removals      CASCADE;
TRUNCATE TABLE newchums.event_interests             CASCADE;

-- Feedback & quality metrics (reference events + users)
TRUNCATE TABLE newchums.plan_feedback               CASCADE;
TRUNCATE TABLE newchums.plan_feedback_dismissals    CASCADE;
TRUNCATE TABLE newchums.attendance_issues           CASCADE;
TRUNCATE TABLE newchums.conduct_reports             CASCADE;
TRUNCATE TABLE newchums.user_metrics                CASCADE;
TRUNCATE TABLE newchums.chum_preferences            CASCADE;

-- Roadmap (leaf tables first, then items)
TRUNCATE TABLE newchums.roadmap_admin_notes         CASCADE;
TRUNCATE TABLE newchums.roadmap_comments            CASCADE;
TRUNCATE TABLE newchums.roadmap_follows             CASCADE;
TRUNCATE TABLE newchums.roadmap_votes               CASCADE;
TRUNCATE TABLE newchums.roadmap_items               CASCADE;

-- Community leaf tables
TRUNCATE TABLE newchums.community_join_requests     CASCADE;
TRUNCATE TABLE newchums.community_members           CASCADE;

-- Social / contacts
TRUNCATE TABLE newchums.user_chums                  CASCADE;
TRUNCATE TABLE newchums.user_contacts               CASCADE;
TRUNCATE TABLE newchums.chum_invites                CASCADE;

-- Notifications
TRUNCATE TABLE newchums.notifications               CASCADE;

-- Auth / account tokens
TRUNCATE TABLE newchums.password_reset_tokens       CASCADE;
TRUNCATE TABLE newchums.email_verification_tokens   CASCADE;
TRUNCATE TABLE newchums.email_change_requests       CASCADE;

-- Profile & preferences
TRUNCATE TABLE newchums.user_profile                CASCADE;

-- User-interest junction (wipes selections, NOT the interests catalog)
TRUNCATE TABLE newchums.user_interests              CASCADE;

-- Admin & tracking
TRUNCATE TABLE newchums.admin_view_timestamps       CASCADE;
TRUNCATE TABLE newchums.user_objective_completions  CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2: Parent tables (referenced by the tables above)
-- ─────────────────────────────────────────────────────────────────────────────

-- Events (parent of event_*, plan_feedback, attendance_issues, conduct_reports)
TRUNCATE TABLE newchums.events                      CASCADE;

-- Communities (parent of community_members, community_join_requests; also
-- referenced by events.community_id but events are already gone)
TRUNCATE TABLE newchums.communities                 CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3: Users (the root of almost everything)
-- ─────────────────────────────────────────────────────────────────────────────

-- All cascading dependents should be empty by now, but CASCADE covers any
-- we may have missed.
TRUNCATE TABLE newchums.users                       CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4: Clean up interests metadata that pointed to now-deleted users
-- ─────────────────────────────────────────────────────────────────────────────
-- These columns have no FK constraint, so they won't cause errors, but they
-- would contain stale UUIDs pointing to deleted users. Null them out.

UPDATE newchums.interests
SET created_by_user_id = NULL,
    updated_by_user_id = NULL,
    deleted_by_user_id = NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: Confirm interests survived
-- ─────────────────────────────────────────────────────────────────────────────
-- This SELECT will appear in your psql output so you can confirm the count.
-- Expect ~40 seed rows plus any user-created interests.

SELECT count(*) AS interests_remaining FROM newchums.interests;

COMMIT;

-- =============================================================================
-- DONE. The database is now clean for beta testing.
-- =============================================================================
