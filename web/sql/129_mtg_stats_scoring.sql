-- Migration 129: MTG Prediction Challenge stats ingest and scoring (Batch 5).
--
-- Once a day from the morning after the Arena launch, the hourly job reads
-- 17Lands' card data feed (spec 9.1), checks it, archives it and publishes a
-- snapshot: every pool card's GIH WR, adjusted win rate, rank and Card Score
-- (spec 6), and every entry's points. Standings are read from snapshots.
-- Every attempt is recorded in mtg_ingest_runs, published or not. The raw
-- response is kept with its snapshot, so a day can be re-scored after a card
-- mapping is fixed or a card is voided.
--
-- Run: psql "$DATABASE_URL" -f web/sql/129_mtg_stats_scoring.sql

-- Admin overrides for matching a pool card to its 17Lands record when the
-- Arena ID or the name doesn't line up.
ALTER TABLE newchums.mtg_cards ADD COLUMN IF NOT EXISTS stats_arena_id INT NULL;
ALTER TABLE newchums.mtg_cards ADD COLUMN IF NOT EXISTS stats_name TEXT NULL;

CREATE TABLE IF NOT EXISTS newchums.mtg_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id          UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  -- The Eastern date the standings are for.
  snapshot_date   DATE        NOT NULL,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT        NOT NULL CHECK (source IN ('feed', 'paste')),
  raw_key         TEXT        NULL,
  raw_json        TEXT        NOT NULL,
  total_games     BIGINT      NOT NULL,
  matched         INT         NOT NULL,
  pool_size       INT         NOT NULL,
  scoring_version INT         NOT NULL,
  is_final        BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (set_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS newchums.mtg_ingest_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id        UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  snapshot_date DATE        NOT NULL,
  attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger       TEXT        NOT NULL CHECK (trigger IN ('schedule', 'admin', 'paste')),
  outcome       TEXT        NOT NULL CHECK (outcome IN ('published', 'not_newer', 'fetch_failed', 'failed_validation', 'error')),
  notes         TEXT        NULL,
  raw_key       TEXT        NULL,
  total_games   BIGINT      NULL,
  matched       INT         NULL,
  -- Set on the run that emailed the admin, so a bad day sends one alert.
  alerted       BOOLEAN     NOT NULL DEFAULT false,
  snapshot_id   UUID        NULL REFERENCES newchums.mtg_snapshots(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mtg_ingest_runs_set ON newchums.mtg_ingest_runs (set_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS newchums.mtg_card_stats (
  snapshot_id UUID    NOT NULL REFERENCES newchums.mtg_snapshots(id) ON DELETE CASCADE,
  card_id     UUID    NOT NULL REFERENCES newchums.mtg_cards(id) ON DELETE CASCADE,
  -- 17Lands' numbers as published; null when the card isn't in the feed.
  gih_games   INT     NULL,
  gih_wr      NUMERIC NULL,
  adj_wr      NUMERIC NULL,
  -- 1 is the best ranked card at the rarity, out of `ranked`.
  rarity_rank INT     NULL,
  ranked      INT     NOT NULL,
  -- 0 to 100; a neutral 50 until the card has a win rate.
  card_score  NUMERIC NOT NULL,
  alsa        NUMERIC NULL,
  ata         NUMERIC NULL,
  iwd         NUMERIC NULL,
  PRIMARY KEY (snapshot_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_mtg_card_stats_card ON newchums.mtg_card_stats (card_id);

CREATE TABLE IF NOT EXISTS newchums.mtg_entry_scores (
  snapshot_id  UUID    NOT NULL REFERENCES newchums.mtg_snapshots(id) ON DELETE CASCADE,
  entry_id     UUID    NOT NULL REFERENCES newchums.mtg_entries(id) ON DELETE CASCADE,
  total        NUMERIC NOT NULL,
  common       NUMERIC NOT NULL,
  uncommon     NUMERIC NOT NULL,
  rare         NUMERIC NOT NULL,
  mythic       NUMERIC NOT NULL,
  -- The four #1 picks' points, the first tie-break.
  slot1_points NUMERIC NOT NULL,
  PRIMARY KEY (snapshot_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_mtg_entry_scores_entry ON newchums.mtg_entry_scores (entry_id);
