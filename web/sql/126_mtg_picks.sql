-- Migration 126: MTG Prediction Challenge picks (Batch 2).
--
-- One entry per player per set, shared by every challenge community the
-- player belongs to (spec rule 5). Each entry holds up to five ranked picks
-- per rarity, twenty cards in all, with an optional Receipts note on each.
-- Other players' picks never leave the server before the lock; that rule is
-- enforced in the API, not here.
--
-- mtg_rarity_reviews drives the NEW ribbons: a card is new for a player when
-- it was first seen after they last opened that rarity.
--
-- Run: psql "$DATABASE_URL" -f web/sql/126_mtg_picks.sql

CREATE TABLE IF NOT EXISTS newchums.mtg_entries (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  set_id                   UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Last change before the lock. Tie-break input for scoring.
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the entry most recently became complete (all 20 slots filled);
  -- cleared if a pick is removed, so it cannot be claimed early and then
  -- changed. Feeds the Early Bird badge and the tie-break.
  completed_at             TIMESTAMPTZ NULL,
  hide_from_everyone_board BOOLEAN     NOT NULL DEFAULT false,
  CONSTRAINT mtg_entries_one_per_set UNIQUE (user_id, set_id)
);

CREATE INDEX IF NOT EXISTS idx_mtg_entries_set ON newchums.mtg_entries (set_id);

CREATE TABLE IF NOT EXISTS newchums.mtg_picks (
  entry_id   UUID        NOT NULL REFERENCES newchums.mtg_entries(id) ON DELETE CASCADE,
  rarity     TEXT        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic')),
  slot       SMALLINT    NOT NULL CHECK (slot BETWEEN 1 AND 5),
  card_id    UUID        NOT NULL REFERENCES newchums.mtg_cards(id) ON DELETE CASCADE,
  -- Receipts: sealed until the lock, then shown beside the card all season.
  note       TEXT        NULL CHECK (note IS NULL OR char_length(note) <= 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, rarity, slot),
  CONSTRAINT mtg_picks_card_once UNIQUE (entry_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_mtg_picks_card ON newchums.mtg_picks (card_id);

CREATE TABLE IF NOT EXISTS newchums.mtg_rarity_reviews (
  user_id          UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  set_id           UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  rarity           TEXT        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic')),
  last_reviewed_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, set_id, rarity)
);
