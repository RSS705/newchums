-- 123: MTG Prediction Challenge, batch 1 (docs/MTG-Bets-Spec.md).
--
-- A challenge is a NewChums community with a specialization; its home view
-- becomes the game. Sets carry the season's dates and the 17Lands feed
-- address (settings, not code). Cards come from Scryfall, one row per
-- oracle card (the regular printing), stamped when first seen so the pick
-- screens can show what's new. Entries, picks, standings and badges arrive
-- in later batches.

ALTER TABLE newchums.communities ADD COLUMN IF NOT EXISTS specialization TEXT NULL;
ALTER TABLE newchums.communities DROP CONSTRAINT IF EXISTS communities_specialization_check;
ALTER TABLE newchums.communities
  ADD CONSTRAINT communities_specialization_check
  CHECK (specialization IS NULL OR specialization IN ('mtg_prediction_challenge'));

CREATE TABLE IF NOT EXISTS newchums.mtg_sets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT        NOT NULL UNIQUE,          -- Scryfall set code, lower case ('fra')
  name                TEXT        NOT NULL,
  previews_start_at   TIMESTAMPTZ NULL,
  gallery_complete_at TIMESTAMPTZ NULL,                     -- full card list expected; the pool firms up here
  prerelease_start_at TIMESTAMPTZ NULL,
  prerelease_end_at   TIMESTAMPTZ NULL,
  picks_open_at       TIMESTAMPTZ NULL,
  lock_at             TIMESTAMPTZ NOT NULL,                 -- picks freeze (server clock)
  arena_release_at    TIMESTAMPTZ NULL,
  tabletop_release_at TIMESTAMPTZ NULL,
  final_at            TIMESTAMPTZ NOT NULL,                 -- final standings taken
  feed_url            TEXT        NOT NULL,                 -- 17Lands card_data feed for this set
  scoring_version     INT         NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'active', -- active | final | archived (phases derive from dates)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mtg_sets_status_check CHECK (status IN ('active', 'final', 'archived'))
);

CREATE TABLE IF NOT EXISTS newchums.mtg_cards (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id             UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  scryfall_id        UUID        NOT NULL UNIQUE,
  oracle_id          UUID        NOT NULL,
  arena_id           INT         NULL,                      -- joins to 17Lands mtga_id once Scryfall has it
  name               TEXT        NOT NULL,
  rarity             TEXT        NOT NULL,
  collector_number   TEXT        NOT NULL,
  collector_sort     INT         NOT NULL DEFAULT 0,        -- numeric part of collector_number, for ordering
  layout             TEXT        NULL,
  colors             TEXT        NOT NULL DEFAULT '',       -- 'WU'; '' = colorless
  mana_cost          TEXT        NULL,
  mana_value         NUMERIC     NULL,
  type_line          TEXT        NULL,
  oracle_text        TEXT        NULL,
  image_normal       TEXT        NULL,
  image_large        TEXT        NULL,
  image_back_normal  TEXT        NULL,
  image_back_large   TEXT        NULL,
  image_status       TEXT        NULL,
  booster            BOOLEAN     NULL,                      -- Scryfall's flag; unreliable during previews
  previewed_at       DATE        NULL,
  preview_source     TEXT        NULL,
  preview_source_uri TEXT        NULL,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),    -- drives NEW ribbons in the pick screens
  in_pool            BOOLEAN     NOT NULL DEFAULT true,     -- computed by the sync (rarity + booster once the gallery is complete)
  voided             BOOLEAN     NOT NULL DEFAULT false,    -- admin override: never pickable or scored
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mtg_cards_rarity_check CHECK (rarity IN ('common', 'uncommon', 'rare', 'mythic')),
  CONSTRAINT mtg_cards_set_oracle_unique UNIQUE (set_id, oracle_id)
);
CREATE INDEX IF NOT EXISTS idx_mtg_cards_set_rarity ON newchums.mtg_cards (set_id, rarity, collector_sort);

CREATE TABLE IF NOT EXISTS newchums.mtg_card_syncs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id     UUID        NOT NULL REFERENCES newchums.mtg_sets(id) ON DELETE CASCADE,
  ran_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome    TEXT        NOT NULL,                          -- ok | failed
  cards_seen INT         NOT NULL DEFAULT 0,
  cards_new  INT         NOT NULL DEFAULT 0,
  notes      TEXT        NULL,
  raw_keys   TEXT[]      NOT NULL DEFAULT '{}'              -- R2 keys of the archived Scryfall pages
);
CREATE INDEX IF NOT EXISTS idx_mtg_card_syncs_set ON newchums.mtg_card_syncs (set_id, ran_at DESC);

-- First season: Reality Fracture. All times Eastern (EDT, UTC-4) per the spec.
INSERT INTO newchums.mtg_sets (
  code, name, previews_start_at, gallery_complete_at, prerelease_start_at, prerelease_end_at,
  picks_open_at, lock_at, arena_release_at, tabletop_release_at, final_at, feed_url
) VALUES (
  'fra', 'Reality Fracture',
  '2026-09-08T04:00:00Z',  -- previews from Tue Sept 8
  '2026-09-18T14:00:00Z',  -- full gallery Fri Sept 18, ~10 AM ET
  '2026-09-25T04:00:00Z',  -- prerelease Fri Sept 25 ...
  '2026-10-02T03:59:00Z',  -- ... through Thu Oct 1
  '2026-09-18T14:00:00Z',  -- picks open with the gallery
  '2026-09-29T03:59:00Z',  -- lock: Mon Sept 28, 11:59 PM ET
  '2026-09-29T18:00:00Z',  -- Arena launch: Tue Sept 29, ~2 PM ET
  '2026-10-02T04:00:00Z',  -- paper release Fri Oct 2
  '2026-10-27T13:00:00Z',  -- final standings: Tue Oct 27, 9 AM ET
  'https://www.17lands.com/api/card_data?expansion=FRA&event_type=PremierDraft&time_period=ALL_TIME'
) ON CONFLICT (code) DO NOTHING;
