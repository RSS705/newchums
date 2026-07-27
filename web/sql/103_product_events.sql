-- Migration 103: append-only product analytics events (first-party funnel mirror)
--
-- GA (gtag) only runs in production and is partially eaten by ad blockers, so
-- the server-detectable funnel steps are mirrored into this table by the API
-- worker (helpers in api/src/lib/productEvents.ts). Rows are written
-- fire-and-forget: a failed insert never fails the parent request, and
-- application logic never updates or deletes rows.
--
-- Event names recorded today (full catalogue with GA counterparts in
-- docs/Technical_Specs.md, section 12, "Product analytics events"):
--   rsvp_verified        - plan-signup magic-link verification completed (once per user)
--   rsvp_recorded        - RSVP row created by a user who entered via plan signup
--   signup_completed     - any signup path completed verification (once per user)
--   first_plan_created   - host's first non-QA plan insert (once per user)
--   second_plan_created  - host's second non-QA plan insert (once per user)
--   plan_reached_3_rsvps - plan gained its third non-host "going" RSVP (once per plan)
--
-- QA plans (events.is_qa = true) never produce rows here, matching the
-- standing rule that QA activity stays out of KPI metrics.
--
-- FKs use ON DELETE SET NULL rather than CASCADE: funnel counts must survive
-- account or plan deletion (COUNT(*) aggregates are unaffected), while the
-- reference itself is cleared so DELETE /account leaves no dangling link.

CREATE TABLE IF NOT EXISTS newchums.product_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id UUID NULL REFERENCES newchums.users(id) ON DELETE SET NULL,
  event_id UUID NULL REFERENCES newchums.events(id) ON DELETE SET NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Funnel queries aggregate by name over a time window.
CREATE INDEX IF NOT EXISTS idx_product_events_name_created
  ON newchums.product_events (event_name, created_at);

-- Once-per-subject events are enforced at the database level. The API writes
-- with a bare ON CONFLICT DO NOTHING, so a concurrent double-fire (e.g. two
-- RSVPs racing past the 3-going threshold) records exactly one row. The
-- rsvp_verified index doubles as the fast lookup path for the rsvp_recorded
-- "did this user enter via plan signup" check.
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_events_rsvp_verified
  ON newchums.product_events (user_id) WHERE event_name = 'rsvp_verified';
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_events_signup_completed
  ON newchums.product_events (user_id) WHERE event_name = 'signup_completed';
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_events_first_plan_created
  ON newchums.product_events (user_id) WHERE event_name = 'first_plan_created';
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_events_second_plan_created
  ON newchums.product_events (user_id) WHERE event_name = 'second_plan_created';
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_events_plan_reached_3_rsvps
  ON newchums.product_events (event_id) WHERE event_name = 'plan_reached_3_rsvps';
