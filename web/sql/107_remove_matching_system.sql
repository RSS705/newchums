-- 107: Drop the matching system's storage.
--
-- The chum-preferences / hidden-metrics matching layer was removed from the
-- product in July 2026 (see the July 2026 commits "Remove the
-- chum-preferences matching system" and "Post-plan rebuild"). The API and UI
-- stopped reading and writing everything below before this migration runs,
-- so it is pure storage cleanup; git history is the archive of the schema,
-- and the owner snapshots data before applying.
--
-- What stays, deliberately:
--   - newchums.attendance_issues itself, including issue_type, status,
--     is_host_report and their CHECK constraints. The public attendance
--     record and the recognition-badges cron read issue_type + status;
--     'dismissed' is the only status that restores "shown up" credit, so the
--     status machinery is load-bearing. The issue_type CHECK still lists
--     late_cancel/very_late because historical rows carry those values and
--     tightening the constraint would fail validation; new writes are
--     host-only no_show.
--   - newchums.plan_feedback_dismissals: historical name (migration 060),
--     now stores post-plan wrap-up dismissals.

-- Enum responses scored into user_metrics; both worthless once nothing
-- consumes the scores.
DROP TABLE IF EXISTS newchums.plan_feedback;
DROP TABLE IF EXISTS newchums.user_metrics;
DROP TABLE IF EXISTS newchums.chum_preferences;

-- Per-plan preference overrides (migration 051).
ALTER TABLE newchums.events DROP COLUMN IF EXISTS pref_overrides;

-- Scoring bookkeeping on attendance rows (migration 052). The two protected
-- consumers never read these.
ALTER TABLE newchums.attendance_issues DROP COLUMN IF EXISTS confidence;
ALTER TABLE newchums.attendance_issues DROP COLUMN IF EXISTS applied_penalty;

-- The give_first_feedback objective was replaced by send_first_shoutout;
-- its persisted completions would otherwise sit orphaned in the admin
-- objectives KPI forever.
DELETE FROM newchums.user_objective_completions
WHERE objective_key = 'give_first_feedback';
