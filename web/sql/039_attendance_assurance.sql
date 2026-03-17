-- Migration 039: Attendance Assurance system
--
-- Evolves the existing require_reconfirmation toggle into a full
-- attendance assurance lifecycle with:
--   - Minimum confirmed attendee thresholds
--   - Confirmation window / cutoff timing
--   - Fallback policy (proceed / notify_host / auto_cancel)
--   - Per-attendee confirmation tracking (event_confirmations table)
--
-- The existing require_reconfirmation column stays as the feature toggle.
-- New columns add configuration and operational state.
--
-- Run: psql "$DATABASE_URL" -f web/sql/039_attendance_assurance.sql

-- ─── New columns on events ──────────────────────────────────────────────────────

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS min_confirmed_attendees INT NULL;

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS confirmation_window_hours NUMERIC(5,1) NOT NULL DEFAULT 24;

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS confirmation_cutoff_hours NUMERIC(5,1) NOT NULL DEFAULT 2;

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS fallback_policy TEXT NOT NULL DEFAULT 'notify_host';

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ NULL;

ALTER TABLE newchums.events
  ADD COLUMN IF NOT EXISTS cutoff_processed_at TIMESTAMPTZ NULL;

ALTER TABLE newchums.events
  ADD CONSTRAINT events_min_confirmed_positive
    CHECK (min_confirmed_attendees IS NULL OR min_confirmed_attendees >= 1);

ALTER TABLE newchums.events
  ADD CONSTRAINT events_fallback_policy_check
    CHECK (fallback_policy IN ('proceed', 'notify_host', 'auto_cancel'));

ALTER TABLE newchums.events
  ADD CONSTRAINT events_confirmation_window_order
    CHECK (confirmation_window_hours > confirmation_cutoff_hours);

COMMENT ON COLUMN newchums.events.min_confirmed_attendees IS
  'Minimum number of confirmed attendees (including host) for the plan to be considered viable. NULL = no minimum.';

COMMENT ON COLUMN newchums.events.confirmation_window_hours IS
  'Hours before starts_at when the confirmation window opens and initial requests are sent.';

COMMENT ON COLUMN newchums.events.confirmation_cutoff_hours IS
  'Hours before starts_at when unconfirmed attendees are marked expired and viability is evaluated.';

COMMENT ON COLUMN newchums.events.fallback_policy IS
  'What happens when min_confirmed_attendees is not met at cutoff: proceed, notify_host, or auto_cancel.';

COMMENT ON COLUMN newchums.events.confirmation_sent_at IS
  'Set by the cron when initial confirmation requests were sent. Prevents duplicate sends.';

COMMENT ON COLUMN newchums.events.cutoff_processed_at IS
  'Set by the cron when the cutoff was evaluated. Prevents duplicate cutoff processing.';


-- ─── event_confirmations ────────────────────────────────────────────────────────
-- Tracks the final confirmation state for each attendee, distinct from RSVP.
-- Created when the confirmation window opens for Going attendees (including host).

CREATE TABLE IF NOT EXISTS newchums.event_confirmations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES newchums.events(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending',
  responded_at    TIMESTAMPTZ NULL,
  reminder_count  INT         NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT event_confirmations_status_check CHECK (status IN ('pending', 'confirmed', 'declined', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_confirmations_unique
  ON newchums.event_confirmations (event_id, user_id);

CREATE INDEX IF NOT EXISTS idx_event_confirmations_event
  ON newchums.event_confirmations (event_id);

CREATE INDEX IF NOT EXISTS idx_event_confirmations_pending
  ON newchums.event_confirmations (event_id) WHERE status = 'pending';

-- Index to help the cron find events needing confirmation processing
CREATE INDEX IF NOT EXISTS idx_events_confirmation_window
  ON newchums.events (starts_at)
  WHERE require_reconfirmation = true
    AND status = 'published'
    AND confirmation_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_cutoff_pending
  ON newchums.events (starts_at)
  WHERE require_reconfirmation = true
    AND status = 'published'
    AND confirmation_sent_at IS NOT NULL
    AND cutoff_processed_at IS NULL;
