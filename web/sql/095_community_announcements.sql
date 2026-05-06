-- Migration 095: Community announcements (v1).
--
-- Simple owner-authored announcements that live on a dedicated tab on the
-- community detail page. v1 deliberately scopes to the announcement list;
-- no email blast, no in-app bell notification, no comments, reactions,
-- attachments, or scheduling. The tab indicator uses a per-user last-seen
-- timestamp rather than per-announcement read rows.
--
-- Visibility follows the existing community-page rules: public communities'
-- announcements are readable by anyone (logged out included), private
-- communities require active membership (or super admin). Management
-- (create / edit / pin / delete) is restricted to community owner +
-- super admin; v1 does not introduce a new role.
--
-- Run: psql "$DATABASE_URL" -f web/sql/095_community_announcements.sql

-- Announcements table. Body is sanitized HTML (same pipeline as community
-- and plan descriptions, see sanitizeDescriptionHtml in api/src/lib/).
CREATE TABLE IF NOT EXISTS newchums.community_announcements (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  is_pinned       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Soft delete. Picked this convention so accidental deletions can still
  -- be recovered manually if a host asks; the public list query filters on
  -- deleted_at IS NULL.
  deleted_at      TIMESTAMPTZ NULL,

  CONSTRAINT community_announcements_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT community_announcements_body_len  CHECK (char_length(body)  BETWEEN 1 AND 10000)
);

-- Primary list-ordering index: pinned first, then newest first, scoped to
-- a community and to non-deleted rows.
CREATE INDEX IF NOT EXISTS idx_community_announcements_list
  ON newchums.community_announcements (community_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_announcements_author
  ON newchums.community_announcements (author_user_id);

-- Per-(user, community) "I last opened the announcements tab at..." marker.
-- The tab indicator on the frontend compares this against the most recent
-- non-deleted announcement's created_at; no per-announcement read rows are
-- needed for v1.
CREATE TABLE IF NOT EXISTS newchums.community_announcement_seen (
  user_id       UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  community_id  UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);
