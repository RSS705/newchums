-- Migration 089: QR redirect scan geo columns
--
-- Extends `qr_redirect_scans` with Cloudflare-supplied geo data so the admin
-- scan log can answer "where was this poster scanned?" more specifically
-- than a two-letter country code. The reduced Chrome user-agent string
-- ("Mozilla/5.0 (Linux; Android 10; K)...") carries almost no device info,
-- so location is the more useful operational signal for understanding where
-- printed posters are actually being scanned.
--
-- All fields are nullable. They come from the edge request context (via
-- `request.cf` in the worker, or the `cf-ip*` managed-transform headers as
-- a fallback), either of which can be absent in local dev, on non-CF traffic,
-- or if the edge cannot resolve the client IP to a location. The UI renders
-- "-" for missing values.
--
-- Fields:
--   city        Cloudflare-resolved city name (e.g. "Toronto").
--   region      Region / state / province name (e.g. "Ontario").
--   latitude    Approximate client latitude, five decimal places.
--   longitude   Approximate client longitude, five decimal places.
--   timezone    IANA timezone name (e.g. "America/Toronto"), useful for
--               rendering scan times in local time rather than UTC.
--
-- We deliberately do NOT add raw IP addresses here; the original privacy
-- stance (country + UA + referer, no IPs) still holds. City-level geo is
-- already what Cloudflare exposes to every Worker, this migration just
-- starts recording it.
--
-- Run: psql "$DATABASE_URL" -f web/sql/089_qr_redirect_scan_geo.sql
--
-- Rollback (manual, no .down.sql):
--   ALTER TABLE newchums.qr_redirect_scans
--     DROP COLUMN IF EXISTS city,
--     DROP COLUMN IF EXISTS region,
--     DROP COLUMN IF EXISTS latitude,
--     DROP COLUMN IF EXISTS longitude,
--     DROP COLUMN IF EXISTS timezone;

ALTER TABLE newchums.qr_redirect_scans
  ADD COLUMN IF NOT EXISTS city      TEXT,
  ADD COLUMN IF NOT EXISTS region    TEXT,
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(8, 5),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(8, 5),
  ADD COLUMN IF NOT EXISTS timezone  TEXT;
