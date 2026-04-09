-- Migration 076: Per-shout-out visibility toggle for the recipient.
--
-- Background: migration 074 added `users.is_hidden_shoutouts` for a
-- section-level hide on the public profile. The inline control on the
-- public profile is now per-shout-out (a subtle icon button per card), so
-- we need a per-row flag the recipient can flip. The section-level flag
-- from migration 074 stays unchanged: it controls whether the whole
-- Shout-outs section renders. This new flag controls whether a specific
-- card is visible to non-owner viewers when the section is showing.
--
-- Default false so existing approved shout-outs remain visible. Only the
-- recipient can toggle their own rows (enforced at the API layer via
-- PATCH /shoutouts/:id).
--
-- Run: psql "$DATABASE_URL" -f sql/076_shoutouts_hidden_by_recipient.sql

ALTER TABLE newchums.shoutouts
  ADD COLUMN IF NOT EXISTS hidden_by_recipient BOOLEAN NOT NULL DEFAULT false;
