-- Migration 099: Per-plan mute for host attendance emails
--
-- Adds events.mute_host_attendance_emails — when the host enables it for a plan,
-- that plan stops emailing the host when someone RSVPs Going / Maybe / Can't
-- make it, including invited people updating their attendance. The in-app bell
-- notifications, join-request emails, and at-risk / auto-cancel emails are all
-- unaffected; the host can still check the plan to see who has responded.

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS mute_host_attendance_emails BOOLEAN NOT NULL DEFAULT FALSE;

-- Run: psql "$DATABASE_URL" -f web/sql/099_mute_host_attendance_emails.sql
