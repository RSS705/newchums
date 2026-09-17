-- Migration 133: MTG Card Evaluation Challenge, fixes from the quality check
-- before friends play.
--
-- mtg_entries.revision: counts changes to an entry's stored picks. A save
--   names the revision its page loaded, so a save from a page that is out of
--   date (a second tab or another device) is refused instead of replacing
--   newer picks.
--
-- mtg_entries.prior_completed_at, mtg_entries.incomplete_since: when an entry
--   drops below twenty picks, the completion time it had, and when the
--   player's own change dropped it (NULL when a card leaving the pool did).
--   Back at twenty within 30 minutes of the player's change, or at any time
--   after a card left the pool, the entry keeps its earlier completion time,
--   so swapping a card by removing it and adding another counts like Replace.
--
-- mtg_cards.missing_since: when a card sync first stopped seeing a card in the
--   pool. Before the lock the card leaves the pool only after a day unseen, so
--   a brief gap in Scryfall's listing can't delete players' picks of it.
--
-- mtg_group_rosters.in_final: whether the finalize job counted this player in
--   the group's final standings (NULL until the season is finalized). A
--   finished season shows exactly the players its badges were judged on, so a
--   player who left mid-season doesn't come back onto the podium.
--
-- newchums.mtg_group_season_players(community, set): a finished season's
--   players are the roster players the finalize counted, still in the group or
--   not. A season still being played is unchanged.
--
-- Run: psql "$DATABASE_URL" -f web/sql/133_mtg_qc_fixes.sql
-- Apply BEFORE deploying the API that reads these.

ALTER TABLE newchums.mtg_entries ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE newchums.mtg_entries ADD COLUMN IF NOT EXISTS prior_completed_at TIMESTAMPTZ NULL;
ALTER TABLE newchums.mtg_entries ADD COLUMN IF NOT EXISTS incomplete_since TIMESTAMPTZ NULL;

ALTER TABLE newchums.mtg_cards ADD COLUMN IF NOT EXISTS missing_since TIMESTAMPTZ NULL;

ALTER TABLE newchums.mtg_group_rosters ADD COLUMN IF NOT EXISTS in_final BOOLEAN NULL;

CREATE OR REPLACE FUNCTION newchums.mtg_group_season_players(p_community UUID, p_set UUID)
RETURNS TABLE (user_id UUID, joined_at TIMESTAMPTZ, left_group BOOLEAN)
LANGUAGE sql STABLE
AS $$
  WITH season AS (
    SELECT (s.status <> 'active' AND s.finalized_at IS NOT NULL) AS finished
    FROM newchums.mtg_sets s WHERE s.id = p_set
  )
  SELECT cm.user_id, cm.created_at, false
  FROM newchums.community_members cm
  CROSS JOIN season
  WHERE cm.community_id = p_community AND cm.status = 'active'
    AND newchums.mtg_season_player(p_community, p_set, cm.user_id, cm.created_at)
    -- Left mid-season and rejoined after the finalize: not in its standings.
    AND NOT (season.finished AND EXISTS (
      SELECT 1 FROM newchums.mtg_group_rosters r
      WHERE r.community_id = p_community AND r.set_id = p_set AND r.user_id = cm.user_id AND r.in_final = false
    ))
  UNION ALL
  SELECT r.user_id, r.added_at, true
  FROM newchums.mtg_group_rosters r
  CROSS JOIN season
  WHERE r.community_id = p_community AND r.set_id = p_set
    AND season.finished AND r.in_final IS DISTINCT FROM false
    AND NOT EXISTS (
      SELECT 1 FROM newchums.community_members cm
      WHERE cm.community_id = p_community AND cm.user_id = r.user_id AND cm.status = 'active'
    )
$$;
