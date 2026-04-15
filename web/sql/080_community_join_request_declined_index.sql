-- Supports the declined-cooldown check on POST /communities/:id/join and the
-- restricted-view GET payload, both of which look up the most recent declined
-- request for a (community_id, user_id) pair. Without this, the ORDER BY
-- COALESCE(reviewed_at, created_at) DESC LIMIT 1 falls back to a seq scan
-- once the table has meaningful volume.

CREATE INDEX IF NOT EXISTS idx_cjr_declined_recent
  ON newchums.community_join_requests(community_id, user_id, reviewed_at DESC)
  WHERE status = 'declined';
