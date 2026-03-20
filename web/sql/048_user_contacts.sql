-- Migration 048: Create user_contacts table
--
-- Replaces user_chums with a two-part connection model:
--   type = 'on_newchums'  — on-platform users (linked_user_id required)
--   type = 'private'      — off-platform contacts for planning (email/name, no account needed)
--
-- Private Contacts auto-promote to On NewChums when the contact later creates an account
-- with a matching email (handled in application code).
--
-- user_chums is NOT dropped here — it remains as a safety net until verified.

CREATE TABLE IF NOT EXISTS newchums.user_contacts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  type           TEXT        NOT NULL DEFAULT 'on_newchums',
  linked_user_id UUID        NULL REFERENCES newchums.users(id) ON DELETE CASCADE,
  contact_email  TEXT        NULL,
  contact_name   TEXT        NULL,
  note           TEXT        NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_contacts_type_check       CHECK (type IN ('on_newchums', 'private')),
  CONSTRAINT user_contacts_on_nc_needs_user CHECK (type != 'on_newchums' OR linked_user_id IS NOT NULL),
  CONSTRAINT user_contacts_private_needs_id CHECK (type != 'private' OR contact_email IS NOT NULL OR contact_name IS NOT NULL),
  CONSTRAINT user_contacts_no_self          CHECK (linked_user_id IS NULL OR user_id <> linked_user_id)
);

-- One On NewChums entry per user pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contacts_linked
  ON newchums.user_contacts (user_id, linked_user_id) WHERE linked_user_id IS NOT NULL;

-- One Private Contact per email per owner (unlinked only)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_contacts_private_email
  ON newchums.user_contacts (user_id, LOWER(contact_email)) WHERE contact_email IS NOT NULL AND linked_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_contacts_user_id ON newchums.user_contacts (user_id);
CREATE INDEX IF NOT EXISTS idx_user_contacts_linked_user_id ON newchums.user_contacts (linked_user_id);

-- For auto-linking: find all private contacts by email when a new user registers
CREATE INDEX IF NOT EXISTS idx_user_contacts_email_lookup
  ON newchums.user_contacts (LOWER(contact_email)) WHERE type = 'private' AND linked_user_id IS NULL;

-- Migrate existing user_chums data into user_contacts as on_newchums entries
INSERT INTO newchums.user_contacts (user_id, type, linked_user_id, note, created_at)
SELECT user_id, 'on_newchums', chum_user_id, note, created_at
FROM newchums.user_chums
ON CONFLICT DO NOTHING;
