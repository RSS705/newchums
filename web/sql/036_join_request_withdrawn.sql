-- Migration 036: Add 'withdrawn' status to join requests
--
-- Allows requesters to withdraw/cancel their pending join request.
-- The unique partial index on (event_id, user_id) WHERE status = 'pending'
-- already permits re-requesting after a non-pending state.

ALTER TABLE newchums.event_join_requests
  DROP CONSTRAINT IF EXISTS event_join_requests_status_check;

ALTER TABLE newchums.event_join_requests
  ADD CONSTRAINT event_join_requests_status_check
  CHECK (status IN ('pending', 'approved', 'declined', 'withdrawn'));
