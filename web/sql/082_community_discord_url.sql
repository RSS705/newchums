-- Adds a community-level Discord server link. Replaces the Add/Edit Community
-- form's "Join link" field (stored in `join_link`), which was ambiguous at the
-- community level and conflated community identity with per-plan join links.
-- The old `join_link` column is intentionally NOT dropped here: existing rows
-- keep their value for historical lookup, but the UI no longer reads or
-- writes it, and the API no longer returns it in the community payload.

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS discord_url TEXT;
