-- Migration 128: MTG Prediction Challenge lock, Group Mind, badges (Batch 4).
--
-- At the lock the hourly job stamps every entry with its pick count, awards
-- the entry badges (spec 7.4), computes each challenge group's Group Mind and
-- Early Bird, then records mtg_sets.locked_at so later runs do nothing. A
-- group formed after the lock gets its Group Mind and Early Bird the first
-- time its Reveal is opened; mtg_group_locks marks a group as done either way,
-- so a group too small for a Group Mind is not recomputed on every visit.
--
-- mtg_badge_awards will also hold on-track and final-day badges in later
-- batches. award_key tells stacked awards apart (a colour for Loyalist, a
-- rarity for Called It).
--
-- Run: psql "$DATABASE_URL" -f web/sql/128_mtg_lock_reveal.sql

ALTER TABLE newchums.mtg_sets ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;
ALTER TABLE newchums.mtg_entries ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;
ALTER TABLE newchums.mtg_entries ADD COLUMN IF NOT EXISTS locked_pick_count SMALLINT NULL;

CREATE TABLE IF NOT EXISTS newchums.mtg_group_locks (
  community_id UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  set_id       UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  -- Members with at least one pick when the group was locked.
  entries      INT         NOT NULL,
  locked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, set_id)
);

CREATE TABLE IF NOT EXISTS newchums.mtg_group_minds (
  community_id UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  set_id       UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  rarity       TEXT        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic')),
  slot         SMALLINT    NOT NULL CHECK (slot BETWEEN 1 AND 5),
  card_id      UUID        NOT NULL REFERENCES newchums.mtg_cards(id) ON DELETE CASCADE,
  -- 5 votes for a #1 pick down to 1 for a #5, summed across the group.
  votes        INT         NOT NULL,
  pickers      INT         NOT NULL,
  entries      INT         NOT NULL,
  computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, set_id, rarity, slot)
);

CREATE TABLE IF NOT EXISTS newchums.mtg_badge_awards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id       UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  -- Null for badges that are not tied to one group.
  community_id UUID        NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  badge_code   TEXT        NOT NULL,
  award_key    TEXT        NOT NULL DEFAULT '',
  detail       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  status       TEXT        NOT NULL DEFAULT 'awarded' CHECK (status IN ('on_track', 'awarded')),
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mtg_badge_awards_identity
  ON newchums.mtg_badge_awards (set_id, user_id, COALESCE(community_id::text, ''), badge_code, award_key);
CREATE INDEX IF NOT EXISTS idx_mtg_badge_awards_group
  ON newchums.mtg_badge_awards (set_id, community_id);
