-- Migration 097: Community Schedule (v1).
--
-- Adds a per-community "Display Schedule tab" feature flag and a durable
-- table for recurring weekly schedule blocks. v1 only exposes weekly
-- recurring entries, but the schema leaves room for future one-off /
-- date-specific blocks via the `entry_type` column and a nullable
-- `specific_date` slot, so we don't have to migrate the table again to
-- expand the feature later.
--
-- Visibility follows the existing community-page rules: public
-- communities' schedule blocks are readable by anyone (logged out
-- included); private communities require an active member or super
-- admin. Management (create / edit / delete) is restricted to community
-- owner + super admin, same as announcements. v1 does not introduce a
-- new role.
--
-- Run: psql "$DATABASE_URL" -f web/sql/097_community_schedule.sql

-- ── Community feature flag ─────────────────────────────────────────────────

ALTER TABLE newchums.communities
  ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Idempotent backfill for existing rows. The column default makes new
-- rows inherit the on state, but pre-existing rows would have NULL on
-- a freshly added column without the default; the NOT NULL DEFAULT
-- handles that, and this UPDATE is a belt-and-braces guarantee that
-- any pre-existing partial migration that added the column without a
-- default still ends up enabled for legacy rows.
UPDATE newchums.communities
   SET schedule_enabled = TRUE
 WHERE schedule_enabled IS DISTINCT FROM TRUE;

-- ── Schedule blocks ───────────────────────────────────────────────────────
--
-- One row per recurring weekly time window on a community page. Soft
-- delete via `deleted_at` so accidental removals can be recovered, same
-- convention as `community_announcements` (migration 095). Sort within
-- a day uses a manager-controlled `sort_order` (lower first), then
-- `start_time`, then `created_at` as a stable tiebreaker.
--
-- `entry_type` is intentionally text+CHECK rather than an enum so we
-- can add 'one_off' or similar values in a future migration without
-- ALTER TYPE acrobatics. v1 only ever stores `'weekly_recurring'`.
-- `specific_date` is reserved for that future one-off variant; v1
-- writes NULL.

CREATE TABLE IF NOT EXISTS newchums.community_schedule_blocks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID        NOT NULL REFERENCES newchums.communities(id) ON DELETE CASCADE,
  entry_type      TEXT        NOT NULL DEFAULT 'weekly_recurring',
  -- 0 = Sunday ... 6 = Saturday, matches `Date#getDay()` so the client
  -- can compare without an extra mapping. Required for weekly entries,
  -- ignored (and expected NULL) for future one-off entries.
  day_of_week     SMALLINT    NULL,
  -- Reserved for future one-off entries. NULL for weekly recurring.
  specific_date   DATE        NULL,
  start_time      TIME        NOT NULL,
  end_time        TIME        NOT NULL,
  title           TEXT        NOT NULL,
  description     TEXT        NULL,
  banner_key      TEXT        NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_by_user_id UUID     NULL REFERENCES newchums.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL,

  CONSTRAINT csb_entry_type_check
    CHECK (entry_type IN ('weekly_recurring', 'one_off')),
  CONSTRAINT csb_weekly_has_dow
    CHECK (
      (entry_type = 'weekly_recurring' AND day_of_week BETWEEN 0 AND 6 AND specific_date IS NULL)
      OR (entry_type = 'one_off' AND day_of_week IS NULL AND specific_date IS NOT NULL)
    ),
  CONSTRAINT csb_time_order
    CHECK (end_time > start_time),
  CONSTRAINT csb_title_len
    CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT csb_description_len
    CHECK (description IS NULL OR char_length(description) <= 2000)
);

-- Primary list-ordering index for the Schedule tab: scoped to a single
-- community and to non-deleted rows, ordered the way the UI groups them
-- (day of week, then within-day sort).
CREATE INDEX IF NOT EXISTS idx_community_schedule_blocks_list
  ON newchums.community_schedule_blocks (community_id, day_of_week, sort_order, start_time)
  WHERE deleted_at IS NULL;

-- Author lookup convenience for any future audit / "blocks I created"
-- queries; mirrors the announcements `author_user_id` index.
CREATE INDEX IF NOT EXISTS idx_community_schedule_blocks_creator
  ON newchums.community_schedule_blocks (created_by_user_id);
