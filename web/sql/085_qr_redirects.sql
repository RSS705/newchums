-- Migration 085: QR redirect management
-- Internal super-admin redirect layer so printed QR codes on posters/cards
-- can remap to new destinations without reprinting. Public surface is
-- /qr/{code}, served by a Next.js route handler that proxies to the API
-- worker for resolution + scan logging.
-- Run: psql "$DATABASE_URL" -f web/sql/085_qr_redirects.sql

-- ── QR redirect records ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS newchums.qr_redirects (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Short human-chosen identifier printed on the poster (e.g. S004-P002).
  -- Stored UPPERCASE so case typed by scanners/keyboards resolves consistently.
  -- 2..64 chars of [A-Z0-9-_] keeps it poster-friendly and URL-safe.
  code              TEXT        NOT NULL,
  -- Human-readable label for the admin list (e.g. "Rook & Pawn — window card").
  title             TEXT        NOT NULL,
  -- Absolute URL the code should redirect to. Validated at the API layer
  -- (http/https scheme, parseable as URL, length <= 2048).
  destination_url   TEXT        NOT NULL,
  -- Free-form operator notes (e.g. print run, store contact, reassignment log).
  notes             TEXT,
  -- Soft on/off switch. Inactive records redirect to a fallback page rather
  -- than a broken destination.
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_by        UUID        NOT NULL REFERENCES newchums.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT qr_redirects_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$')
);

-- Case-insensitive lookups resolve through the stored UPPERCASE value, so a
-- plain unique index on `code` is sufficient and keeps writes fast.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_redirects_code ON newchums.qr_redirects(code);

-- ── QR scan log ─────────────────────────────────────────────────────────────
--
-- Lightweight scan trail. We deliberately avoid storing raw IP addresses:
-- country (via CF-IPCountry at the edge) + truncated user-agent + referer
-- is enough to answer the operational questions we care about today
-- ("did scans happen?", "roughly where from?", "from which referring page?")
-- without turning this into a full analytics pipeline.

CREATE TABLE IF NOT EXISTS newchums.qr_redirect_scans (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_redirect_id    UUID        NOT NULL REFERENCES newchums.qr_redirects(id) ON DELETE CASCADE,
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent        TEXT,
  referer           TEXT,
  country           TEXT
);

CREATE INDEX IF NOT EXISTS idx_qr_redirect_scans_redirect_time
  ON newchums.qr_redirect_scans(qr_redirect_id, scanned_at DESC);
