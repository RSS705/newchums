-- Migration 096: Community announcement emails (per-community mute).
--
-- Adds opt-out storage so community members can suppress announcement
-- emails from a specific community without affecting their global
-- "Community announcements" notification preference. The global
-- preference (key `community_announcements` on `user_profile.notification_prefs`,
-- defaulted on for new and existing users via the standard normalize-on-read
-- pathway in `api/src/lib/notificationPrefs.ts`) supersedes per-community
-- mutes at send time, but turning it off does NOT clear these rows; if
-- the user re-enables the global pref later, their per-community choices
-- are still respected.
--
-- Run: psql "$DATABASE_URL" -f web/sql/096_community_announcement_emails.sql

CREATE TABLE IF NOT EXISTS newchums.community_announcement_mutes (
  user_id       UUID        NOT NULL REFERENCES newchums.users(id)       ON DELETE CASCADE,
  community_id  UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  muted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_mutes_community
  ON newchums.community_announcement_mutes (community_id);
