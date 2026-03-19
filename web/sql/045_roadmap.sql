-- Migration 045: Community Roadmap / Feature Request system
--
-- Creates tables for user-submitted feedback, voting, following,
-- commenting, admin notes, and merge tracking.
--
-- Run: psql "$DATABASE_URL" -f web/sql/045_roadmap.sql

-- Core feedback entries
CREATE TABLE IF NOT EXISTS newchums.roadmap_items (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id       UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  category             TEXT        NOT NULL CHECK (category IN ('feature_request', 'bug', 'general_feedback')),
  title                TEXT        NOT NULL,
  body                 TEXT        NULL,
  status               TEXT        NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'needs_clarification', 'in_progress', 'completed', 'not_planned')),
  vote_count           INT         NOT NULL DEFAULT 0,
  comment_count        INT         NOT NULL DEFAULT 0,
  follower_count       INT         NOT NULL DEFAULT 0,
  merged_into_item_id  UUID        NULL REFERENCES newchums.roadmap_items(id) ON DELETE SET NULL,
  is_removed           BOOLEAN     NOT NULL DEFAULT false,
  removal_reason       TEXT        NULL,
  completed_at         TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_status_votes
  ON newchums.roadmap_items (status, vote_count DESC);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_author
  ON newchums.roadmap_items (author_user_id);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_merged
  ON newchums.roadmap_items (merged_into_item_id)
  WHERE merged_into_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roadmap_items_created
  ON newchums.roadmap_items (created_at DESC);

-- Upvotes (one per user per item)
CREATE TABLE IF NOT EXISTS newchums.roadmap_votes (
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  item_id    UUID        NOT NULL REFERENCES newchums.roadmap_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- Follow for email updates (one per user per item)
CREATE TABLE IF NOT EXISTS newchums.roadmap_follows (
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  item_id    UUID        NOT NULL REFERENCES newchums.roadmap_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

-- Plain text comments
CREATE TABLE IF NOT EXISTS newchums.roadmap_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID        NOT NULL REFERENCES newchums.roadmap_items(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  body       TEXT        NOT NULL,
  is_removed BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_comments_item
  ON newchums.roadmap_comments (item_id, created_at ASC);

-- Public admin status updates / notes
CREATE TABLE IF NOT EXISTS newchums.roadmap_admin_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        UUID        NOT NULL REFERENCES newchums.roadmap_items(id) ON DELETE CASCADE,
  admin_user_id  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  body           TEXT        NOT NULL,
  status_before  TEXT        NULL,
  status_after   TEXT        NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_admin_notes_item
  ON newchums.roadmap_admin_notes (item_id, created_at ASC);
