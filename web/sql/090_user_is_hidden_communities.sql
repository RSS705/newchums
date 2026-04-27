-- Migration 090: Add is_hidden_communities to users
--
-- Section-level privacy toggle for the public-profile Communities section,
-- mirrors the existing is_hidden_chum_list / is_hidden_shoutouts pattern.
-- When true, GET /public/users/:handle/communities returns an empty list
-- with hidden=true and the Communities card does not render on the public
-- profile.
--
-- Default false so existing users with active community memberships
-- automatically get the new section visible without action.
--
-- Run: psql "$DATABASE_URL" -f web/sql/090_user_is_hidden_communities.sql

ALTER TABLE newchums.users
  ADD COLUMN IF NOT EXISTS is_hidden_communities BOOLEAN NOT NULL DEFAULT false;
