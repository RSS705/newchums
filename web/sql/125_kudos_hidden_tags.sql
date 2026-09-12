-- Migration 125: let a tag recipient hide one of their tags from their
-- public profile.
--
-- Tags (kudos internally) are aggregated per tag type on /u/<handle>, so the
-- hide is per tag type rather than per row: hiding "Sweaty" hides the whole
-- count, not one of the three people who gave it. The row exists only while
-- the tag is hidden, so the default everywhere is visible.
--
-- The owner still sees every tag on their own profile, marked as hidden, so
-- they can put one back. Nobody else sees a hidden tag or any trace of it,
-- including in the total.
--
-- Run: psql "$DATABASE_URL" -f web/sql/125_kudos_hidden_tags.sql

CREATE TABLE IF NOT EXISTS newchums.kudos_hidden_tags (
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  tag        TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag)
);

COMMENT ON TABLE newchums.kudos_hidden_tags IS 'Tags the recipient has hidden from their own public profile. Catalogue lives in api/src/lib/kudos.ts.';
