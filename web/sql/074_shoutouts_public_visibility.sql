-- Migration 074: Section-level visibility toggle for the public-profile shout-outs section.
--
-- Shout-outs (migration 073) were originally surfaced in a private "Shout-outs received"
-- card on the recipient's own /profile page. They now appear on the recipient's public
-- profile (/u/<handle>) instead. This flag lets the recipient hide the entire Shout-outs
-- section from their public profile via a single setting (Settings page Privacy section
-- and a subtle inline owner-only toggle on the public profile).
--
-- Default false so existing recipients see no behavior change beyond the new section
-- becoming visible on their public profile. The toggle is intentionally section-level;
-- there is no per-shout-out curation by design.
--
-- Run: psql "$DATABASE_URL" -f sql/074_shoutouts_public_visibility.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_hidden_shoutouts BOOLEAN NOT NULL DEFAULT false;
