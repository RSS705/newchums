-- Migration 011: Pending email change requests
-- Single-use, 60min expiry. Rate limited by application (3/hour per user).
-- Run: psql "$DATABASE_URL" -f web/sql/011_email_change_requests.sql
-- API uses newchums schema. Adjust schema name if your DB differs.

CREATE TABLE IF NOT EXISTS newchums.email_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_ip TEXT NULL,
  user_agent TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_change_requests_user_id ON newchums.email_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_email_change_requests_new_email ON newchums.email_change_requests(new_email);
CREATE INDEX IF NOT EXISTS idx_email_change_requests_expires_at ON newchums.email_change_requests(expires_at);
COMMENT ON TABLE newchums.email_change_requests IS 'Pending email change requests; token single-use, 60min expiry';
