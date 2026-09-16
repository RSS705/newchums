-- Migration 131: MTG Card Evaluation Challenge rosters and the season's end (Batch 8).
--
-- mtg_group_rosters: who plays a season in a group, fixed when picks lock.
--   The lock job writes one row for each member who had joined the group by
--   the lock and had picks then. Standings, the Reveal, badges and results
--   read the roster, so nobody joins a season after its lock, and a player
--   who leaves a group and rejoins keeps their place in its season. Until the
--   lock job has locked a group, the rule is applied directly: members who
--   joined by lock_at.
--
-- mtg_sets.finalized_at: when the finalize job ended the season: it marked
--   the final day's standings final, awarded the season's badges and set the
--   status to 'final'. The season results email waits for it.
--
-- Run: psql "$DATABASE_URL" -f web/sql/131_mtg_rosters_finalize.sql
-- Apply BEFORE deploying the API that reads these.

CREATE TABLE IF NOT EXISTS newchums.mtg_group_rosters (
  community_id UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  set_id       UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, set_id, user_id)
);

-- A player's seasons across groups, for results emails and the trophy case.
CREATE INDEX IF NOT EXISTS idx_mtg_group_rosters_user
  ON newchums.mtg_group_rosters (user_id, set_id);

ALTER TABLE newchums.mtg_sets ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ NULL;

-- The roster rule in one place, for every query that asks who plays a season
-- in a group: on the roster, or, for a group the lock job hasn't locked, a
-- member who joined by the lock. Before the lock that is every member; for a
-- group formed after the lock it is nobody. Callers still require an entry.
CREATE OR REPLACE FUNCTION newchums.mtg_season_player(p_community UUID, p_set UUID, p_user UUID, p_joined TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
           SELECT 1 FROM newchums.mtg_group_rosters r
           WHERE r.community_id = p_community AND r.set_id = p_set AND r.user_id = p_user
         )
      OR (
           NOT EXISTS (
             SELECT 1 FROM newchums.mtg_group_locks l
             WHERE l.community_id = p_community AND l.set_id = p_set
           )
           AND p_joined <= (SELECT s.lock_at FROM newchums.mtg_sets s WHERE s.id = p_set)
         )
$$;
