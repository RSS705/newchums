-- Migration 024: Create event system tables
--
-- events              — core event/plan entity
-- event_invites       — invite records (existing users + email invitees)
-- event_rsvps         — attendance responses (going/maybe/cant_make_it)
-- event_alt_times     — alternate time suggestions from invitees
--
-- Run: psql "$DATABASE_URL" -f sql/024_create_events.sql

-- ─── events ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id    UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  description     TEXT        NULL,
  interest_id     UUID        NULL REFERENCES newchums.interests(id) ON DELETE SET NULL,

  -- scheduling
  starts_at       TIMESTAMPTZ NOT NULL,

  -- location
  location_type   TEXT        NOT NULL DEFAULT 'in_person',
  location_name   TEXT        NULL,
  location_address TEXT       NULL,
  location_place_id TEXT      NULL,
  location_lat    DOUBLE PRECISION NULL,
  location_lng    DOUBLE PRECISION NULL,
  online_link     TEXT        NULL,

  -- capacity
  max_seats       INT         NULL,

  -- visibility: 'invite_only' | 'chums_only' | 'public'
  visibility      TEXT        NOT NULL DEFAULT 'public',

  -- status: 'draft' | 'published' | 'canceled'
  status          TEXT        NOT NULL DEFAULT 'draft',

  -- whether attendees can suggest alternate times
  allow_alt_times BOOLEAN     NOT NULL DEFAULT true,

  canceled_at     TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_location_type_check CHECK (location_type IN ('in_person', 'online')),
  CONSTRAINT events_visibility_check CHECK (visibility IN ('invite_only', 'chums_only', 'public')),
  CONSTRAINT events_status_check CHECK (status IN ('draft', 'published', 'canceled')),
  CONSTRAINT events_max_seats_positive CHECK (max_seats IS NULL OR max_seats > 0)
);

CREATE INDEX IF NOT EXISTS idx_events_host
  ON newchums.events (host_user_id);

CREATE INDEX IF NOT EXISTS idx_events_starts_at
  ON newchums.events (starts_at);

CREATE INDEX IF NOT EXISTS idx_events_interest
  ON newchums.events (interest_id) WHERE interest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_visibility_status
  ON newchums.events (visibility, status);


-- ─── event_invites ────────────────────────────────────────────────────────────
-- Tracks both in-app invites (user_id set) and email invites (email set, user_id null).
-- When an email invitee signs up, user_id can be backfilled.

CREATE TABLE IF NOT EXISTS newchums.event_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id         UUID        NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  email           TEXT        NULL,
  invited_by      UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_invites_has_target CHECK (user_id IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_invites_event
  ON newchums.event_invites (event_id);

CREATE INDEX IF NOT EXISTS idx_event_invites_user
  ON newchums.event_invites (user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_invites_email
  ON newchums.event_invites (email) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_invites_unique_user
  ON newchums.event_invites (event_id, user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_invites_unique_email
  ON newchums.event_invites (event_id, email) WHERE email IS NOT NULL AND user_id IS NULL;


-- ─── event_rsvps ──────────────────────────────────────────────────────────────
-- One RSVP per user per event. Status: 'going' | 'maybe' | 'cant_make_it'

CREATE TABLE IF NOT EXISTS newchums.event_rsvps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'going',
  note            TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_rsvps_status_check CHECK (status IN ('going', 'maybe', 'cant_make_it'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_rsvps_unique
  ON newchums.event_rsvps (event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_user
  ON newchums.event_rsvps (user_id);


-- ─── event_alt_times ──────────────────────────────────────────────────────────
-- Alternate date/time suggestions from attendees

CREATE TABLE IF NOT EXISTS newchums.event_alt_times (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  suggested_at    TIMESTAMPTZ NOT NULL,
  note            TEXT        NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_alt_times_event
  ON newchums.event_alt_times (event_id);
