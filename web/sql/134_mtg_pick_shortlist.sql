-- Migration 134: MTG Card Evaluation Challenge, a shortlist below each rarity's
-- five picks.
--
-- mtg_pick_shortlist: up to five more cards per rarity that a player is still
--   weighing, kept in order right after their picks (slots 6 to 10), so they
--   can drag a card up into their top five. Only mtg_picks (slots 1 to 5) are
--   picks: the shortlist never scores, never counts toward the twenty, and is
--   never shown to anyone else. When a pick is dropped (its card left the pool),
--   the cards below it move up, so a shortlisted card can become a pick.
--
-- Run: psql "$DATABASE_URL" -f web/sql/134_mtg_pick_shortlist.sql
-- Apply BEFORE deploying the API that reads it.

CREATE TABLE IF NOT EXISTS newchums.mtg_pick_shortlist (
  entry_id   UUID        NOT NULL REFERENCES newchums.mtg_entries(id) ON DELETE CASCADE,
  rarity     TEXT        NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic')),
  slot       SMALLINT    NOT NULL CHECK (slot BETWEEN 6 AND 10),
  card_id    UUID        NOT NULL REFERENCES newchums.mtg_cards(id) ON DELETE CASCADE,
  -- The player's thoughts on the card, kept so they survive a move in and out
  -- of the top five.
  note       TEXT        NULL CHECK (note IS NULL OR char_length(note) <= 140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, rarity, slot),
  CONSTRAINT mtg_pick_shortlist_card_once UNIQUE (entry_id, card_id)
);
