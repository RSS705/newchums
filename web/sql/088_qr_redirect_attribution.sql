-- Migration 088: QR redirect operational attribution
--
-- Adds the lightweight inventory fields the super-admin QR list needs to
-- track real-world printed assets (cards / posters distributed to stores).
-- The redirect contract itself is unchanged; these are pure metadata
-- columns the admin UI uses for filtering, sorting, and reporting.
--
--   media_type        'card', 'poster', or NULL (unspecified). Constrained
--                     to a small known set so the filter UI can list them
--                     without reading existing values; extend the CHECK
--                     when adding a new media type.
--   assigned_store    Free-form string naming the store / location the code
--                     was given to. NULL means "not assigned yet / available
--                     for future use", which the UI surfaces as Unassigned.
--   campaign_variant  Optional tag for the creative or ad design variant
--                     (e.g. 'V1', 'V2', 'A', 'B') so we can report on
--                     which printed design performs better.
--
-- Run: psql "$DATABASE_URL" -f web/sql/088_qr_redirect_attribution.sql
--
-- Rollback (manual, no .down.sql):
--   ALTER TABLE newchums.qr_redirects
--     DROP COLUMN IF EXISTS media_type,
--     DROP COLUMN IF EXISTS assigned_store,
--     DROP COLUMN IF EXISTS campaign_variant;

ALTER TABLE newchums.qr_redirects
  ADD COLUMN IF NOT EXISTS media_type        TEXT,
  ADD COLUMN IF NOT EXISTS assigned_store    TEXT,
  ADD COLUMN IF NOT EXISTS campaign_variant  TEXT;

-- Constrain media_type to the known set. The constraint is added separately
-- so re-running the migration is idempotent (Postgres has no "ADD
-- CONSTRAINT IF NOT EXISTS" until 16; the DO block keeps it portable).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'qr_redirects_media_type_known'
  ) THEN
    ALTER TABLE newchums.qr_redirects
      ADD CONSTRAINT qr_redirects_media_type_known
      CHECK (media_type IS NULL OR media_type IN ('card', 'poster'));
  END IF;
END $$;

-- Filter index for the admin list's "by store" view. Most rows will have a
-- store so this is denser than a partial index; keep it simple.
CREATE INDEX IF NOT EXISTS idx_qr_redirects_assigned_store
  ON newchums.qr_redirects(assigned_store);

-- Filter index for "by media type". Same rationale.
CREATE INDEX IF NOT EXISTS idx_qr_redirects_media_type
  ON newchums.qr_redirects(media_type);
