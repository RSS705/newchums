-- Migration 079: Add optional message to community join requests
-- Allows requesters to include a short note when requesting to join a private community.

ALTER TABLE newchums.community_join_requests
  ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE newchums.community_join_requests
  ADD CONSTRAINT cjr_message_length CHECK (length(message) <= 500);
