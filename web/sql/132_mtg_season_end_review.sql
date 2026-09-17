-- Migration 132: MTG Card Evaluation Challenge, the Batch 9 review of the season's end.
--
-- mtg_sets.reopened_at: when an admin reopened a finalized season. The hourly
--   finalize job leaves a reopened season alone, so the admin has time to fix
--   its standings; Finalize now ends it again and clears this.
--
-- mtg_ingest_runs.alert_kind: adds 'catchup', the admin alert after the day
--   after the final day, when the job retries the final day's standings.
--
-- newchums.mtg_group_season_players(community, set): who played a season in a
--   group. For a season still being played, the active members who play it
--   (mtg_season_player). A finished season is kept whole: its roster players
--   who have since left the group are still in it, marked left_group.
--
-- idx_mtg_badge_awards_user: the trophy case reads a player's badges.
--
-- Run: psql "$DATABASE_URL" -f web/sql/132_mtg_season_end_review.sql
-- Apply BEFORE deploying the API that reads these.

ALTER TABLE newchums.mtg_sets ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ NULL;

ALTER TABLE newchums.mtg_ingest_runs DROP CONSTRAINT IF EXISTS mtg_ingest_runs_alert_kind_check;
ALTER TABLE newchums.mtg_ingest_runs
  ADD CONSTRAINT mtg_ingest_runs_alert_kind_check CHECK (alert_kind IS NULL OR alert_kind IN ('first', 'final', 'catchup'));

CREATE INDEX IF NOT EXISTS idx_mtg_badge_awards_user ON newchums.mtg_badge_awards (user_id, set_id);

CREATE OR REPLACE FUNCTION newchums.mtg_group_season_players(p_community UUID, p_set UUID)
RETURNS TABLE (user_id UUID, joined_at TIMESTAMPTZ, left_group BOOLEAN)
LANGUAGE sql STABLE
AS $$
  SELECT cm.user_id, cm.created_at, false
  FROM newchums.community_members cm
  WHERE cm.community_id = p_community AND cm.status = 'active'
    AND newchums.mtg_season_player(p_community, p_set, cm.user_id, cm.created_at)
  UNION ALL
  SELECT r.user_id, r.added_at, true
  FROM newchums.mtg_group_rosters r
  JOIN newchums.mtg_sets s ON s.id = r.set_id
  WHERE r.community_id = p_community AND r.set_id = p_set
    AND s.status <> 'active' AND s.finalized_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM newchums.community_members cm
      WHERE cm.community_id = p_community AND cm.user_id = r.user_id AND cm.status = 'active'
    )
$$;
