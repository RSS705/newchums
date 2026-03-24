-- Migration 055: Communities
-- Adds communities, community_members, community_join_requests tables
-- and community_id + hide_from_explore on events.

-- ── Communities ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.communities (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  avatar_key      TEXT,
  banner_key      TEXT,
  visibility      TEXT        NOT NULL DEFAULT 'public',
  join_mode       TEXT        NOT NULL DEFAULT 'open',
  chat_enabled    BOOLEAN     NOT NULL DEFAULT true,
  location_name   TEXT,
  location_address TEXT,
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  owner_user_id   UUID        NOT NULL REFERENCES newchums.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT communities_visibility_check CHECK (visibility IN ('public', 'private')),
  CONSTRAINT communities_join_mode_check  CHECK (join_mode IN ('open', 'approval_required'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_slug ON newchums.communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_owner ON newchums.communities(owner_user_id);

-- ── Community members ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.community_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'member',
  status          TEXT        NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cm_role_check   CHECK (role IN ('owner', 'member')),
  CONSTRAINT cm_status_check CHECK (status IN ('active', 'pending', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cm_community_user ON newchums.community_members(community_id, user_id);
CREATE INDEX IF NOT EXISTS idx_cm_user ON newchums.community_members(user_id);

-- ── Community join requests ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.community_join_requests (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id        UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  status              TEXT        NOT NULL DEFAULT 'pending',
  reviewed_by_user_id UUID        REFERENCES newchums.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  CONSTRAINT cjr_status_check CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cjr_pending
  ON newchums.community_join_requests(community_id, user_id)
  WHERE status = 'pending';

-- ── Events: add community association ────────────────────────────────────────

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES newchums.communities(id) ON DELETE SET NULL;

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS hide_from_explore BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_events_community ON newchums.events(community_id) WHERE community_id IS NOT NULL;
