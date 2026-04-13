-- Migration 078: Community discovery enhancements
-- Adds online flag, website, join_link to communities
-- Adds community_interests junction table for hobby/interest tagging

-- ── New columns on communities ──────────────────────────────────────────────

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS website TEXT;

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS join_link TEXT;

-- Constraints on new text columns
ALTER TABLE newchums.communities
  ADD CONSTRAINT communities_website_length CHECK (length(website) <= 500);

ALTER TABLE newchums.communities
  ADD CONSTRAINT communities_join_link_length CHECK (length(join_link) <= 500);

-- ── Community interests (hobby tagging) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.community_interests (
  community_id  UUID NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  interest_id   UUID NOT NULL REFERENCES newchums.interests(id) ON DELETE CASCADE,
  PRIMARY KEY (community_id, interest_id)
);

CREATE INDEX IF NOT EXISTS idx_ci_interest ON newchums.community_interests(interest_id);
