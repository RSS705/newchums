-- Migration 104: one-time code (OTP) plan signup + Postgres-backed auth rate limiting
--
-- B1: the plan-signup email now carries a 6-digit code alongside the magic
-- link, so an invitee can verify without leaving the plan page. Both
-- credentials live on the SAME email_verification_tokens row; consuming
-- either one marks the row used (single use, last-issued-wins).
--
-- Strictly additive: new nullable columns only. token_hash keeps its exact
-- meaning (magic-link credential) and the legacy flows that share this table
-- (classic email verification, signin-link returners) never set or read the
-- new columns. Reverting the app code alone restores the old flow; these
-- columns then sit inert.
--
--   otp_hash      - sha256 (base64url) of the 6-digit code; NULL on rows
--                   minted by flows that have no code (classic email-verify,
--                   signin-link, OTP session-grant tokens).
--   otp_attempts  - server-enforced attempt counter; the verify endpoint
--                   invalidates the row at 5 failed attempts.
--   event_id      - the plan the signup started from, so the stored intent
--                   can re-apply on a later visit. SET NULL on plan delete.
--   signup_intent - the invitee's chosen RSVP intent ('going' | 'maybe'),
--                   persisted with the pending signup so a crash between
--                   verify and RSVP does not lose it. RSVP rows themselves
--                   are only ever created by POST /events/:id/rsvp.

ALTER TABLE newchums.email_verification_tokens
  ADD COLUMN IF NOT EXISTS otp_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_id UUID NULL REFERENCES newchums.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signup_intent TEXT NULL;

ALTER TABLE newchums.email_verification_tokens
  DROP CONSTRAINT IF EXISTS email_verification_tokens_signup_intent_check;
ALTER TABLE newchums.email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_signup_intent_check
  CHECK (signup_intent IS NULL OR signup_intent IN ('going', 'maybe'));

-- Postgres-backed sliding-window rate limiting for auth endpoints. The KV
-- limiter (contactRateLimit.ts) is a no-op when the KV binding is absent,
-- which is the case in production; plan-signup issuance caps, the resend
-- cooldown, and OTP verify caps therefore live here. Append-only marker
-- rows; a row is only written when a request is allowed. Rows are prunable
-- at will (roadmap A3 owns repo-wide adoption + cleanup).
CREATE TABLE IF NOT EXISTS newchums.auth_rate_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_events_bucket_created
  ON newchums.auth_rate_events (bucket, created_at);
