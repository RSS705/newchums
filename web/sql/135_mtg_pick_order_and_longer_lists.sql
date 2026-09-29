-- Migration 135: MTG Card Evaluation Challenge, a small bonus for pick order
-- from the next season on, longer lists, and new lock badges.
--
-- mtg_sets.scoring_version: which scoring rules a season uses. Version 1 counts
--   every pick the same. Version 2 gives the order of a rarity's five picks a
--   small weight (1.2, 1.1, 1.0, 0.9, 0.8; see MTG_SLOT_WEIGHTS in
--   api/src/lib/mtgScoring.ts). Seasons created from now on take version 2.
--   Seasons that already exist keep the version they have, so Reality Fracture,
--   whose picks were made and locked under version 1, stays on version 1.
--
-- mtg_pick_shortlist: a rarity's list now holds up to twenty cards, the five
--   picks (mtg_picks, slots 1 to 5) and up to fifteen more on the shortlist
--   (slots 6 to 20). The shortlist still never scores and nobody else sees it.
--
-- mtg_sets.lock_badges_version: which lock badge rules a season's awards were
--   made under. Seasons that already exist are on version 1 (the first entry
--   badges and Early Bird); seasons created from now on take version 2 (group
--   honors that compare a player's picks with their group's). The hourly job
--   brings a locked season on an older version up to date once: it removes the
--   retired badges' awards and gives the new ones from the locked picks, so
--   this migration changes no badge rows itself.
--
-- Run: psql "$DATABASE_URL" -f web/sql/135_mtg_pick_order_and_longer_lists.sql
-- Apply BEFORE deploying the API that reads it.

ALTER TABLE newchums.mtg_sets ALTER COLUMN scoring_version SET DEFAULT 2;

ALTER TABLE newchums.mtg_pick_shortlist DROP CONSTRAINT IF EXISTS mtg_pick_shortlist_slot_check;
ALTER TABLE newchums.mtg_pick_shortlist ADD CONSTRAINT mtg_pick_shortlist_slot_check CHECK (slot BETWEEN 6 AND 20);

ALTER TABLE newchums.mtg_sets ADD COLUMN IF NOT EXISTS lock_badges_version INT NOT NULL DEFAULT 1;
ALTER TABLE newchums.mtg_sets ALTER COLUMN lock_badges_version SET DEFAULT 2;
